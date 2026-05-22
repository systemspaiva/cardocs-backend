import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { ValidationError } from "../application/errors.js";
import { LegalAcceptance, UserAccessStatus, UserProfile, UserSubscription } from "../domain/models.js";

export class FirebaseUserRepository {
  constructor(private readonly db: Firestore) {}

  async upsertFromAuth(profile: UserProfile, legalAcceptance?: LegalAcceptance): Promise<UserProfile> {
    const userRef = this.db.collection("users").doc(profile.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists && !legalAcceptance) {
        throw new ValidationError("Aceite dos termos e da politica de privacidade obrigatorio para criar o perfil.");
      }

      const legalAcceptancePatch = legalAcceptance ? toLegalAcceptancePatch(legalAcceptance) : {};
      transaction.set(
        userRef,
        {
          profile,
          auth: {
            email: profile.email,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
            emailVerified: profile.emailVerified,
            signInProvider: profile.signInProvider,
            providerIds: profile.providerIds
          },
          ...legalAcceptancePatch,
          ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
          lastLoginAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });
    return profile;
  }

  async getUserAccessStatus(userId: string): Promise<UserAccessStatus> {
    const snapshot = await this.db.collection("users").doc(userId).get();
    if (!snapshot.exists) {
      return withoutAccess();
    }

    const data = snapshot.data() ?? {};
    const now = new Date();
    const freeDaysUntil = toDate(data.freeDaysUntil);
    if (freeDaysUntil && freeDaysUntil > now) {
      return {
        hasAccess: true,
        reason: "freeDays",
        freeDaysUntil: freeDaysUntil.toISOString(),
        subscription: null
      };
    }

    const subscription = toUserSubscription(data.subscription);
    if (subscription && new Date(subscription.expiresAt) > now) {
      return {
        hasAccess: true,
        reason: "subscription",
        freeDaysUntil: freeDaysUntil?.toISOString() ?? null,
        subscription
      };
    }

    return {
      ...withoutAccess(),
      freeDaysUntil: freeDaysUntil?.toISOString() ?? null,
      subscription
    };
  }

  async syncSubscription(userId: string, subscription: Omit<UserSubscription, "syncedAt">): Promise<void> {
    const expiresAt = new Date(subscription.expiresAt);
    const userRef = this.db.collection("users").doc(userId);
    const matchingSubscriptions = this.db
      .collection("users")
      .where("subscription.originalTransactionId", "==", subscription.originalTransactionId);

    await this.db.runTransaction(async (transaction) => {
      const existingOwners = await transaction.get(matchingSubscriptions);
      for (const ownerSnapshot of existingOwners.docs) {
        if (ownerSnapshot.id === userId) continue;
        transaction.set(
          ownerSnapshot.ref,
          {
            subscription: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      transaction.set(userRef, {
        subscription: {
          plan: subscription.plan,
          productId: subscription.productId,
          expiresAt: Timestamp.fromDate(expiresAt),
          transactionId: subscription.transactionId,
          originalTransactionId: subscription.originalTransactionId,
          syncedAt: FieldValue.serverTimestamp()
        },
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  }

  async clearSubscription(userId: string): Promise<void> {
    await this.db.collection("users").doc(userId).set(
      {
        subscription: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
}

function toLegalAcceptancePatch(legalAcceptance: LegalAcceptance) {
  return {
    legal: {
      termsVersion: legalAcceptance.termsVersion,
      privacyVersion: legalAcceptance.privacyVersion,
      acceptedAt: Timestamp.fromDate(new Date(legalAcceptance.acceptedAt)),
      source: legalAcceptance.source,
      recordedAt: FieldValue.serverTimestamp()
    }
  };
}

function withoutAccess(): UserAccessStatus {
  return {
    hasAccess: false,
    reason: "none",
    freeDaysUntil: null,
    subscription: null
  };
}

function toUserSubscription(value: unknown): UserSubscription | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const expiresAt = toDate(raw.expiresAt);
  if (!expiresAt) return null;
  const plan = raw.plan === "monthly" || raw.plan === "annual" ? raw.plan : null;
  if (!plan) return null;

  return {
    plan,
    productId: typeof raw.productId === "string" ? raw.productId : "",
    expiresAt: expiresAt.toISOString(),
    transactionId: typeof raw.transactionId === "string" ? raw.transactionId : "",
    originalTransactionId: typeof raw.originalTransactionId === "string" ? raw.originalTransactionId : "",
    syncedAt: toDate(raw.syncedAt)?.toISOString() ?? ""
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }
  return null;
}
