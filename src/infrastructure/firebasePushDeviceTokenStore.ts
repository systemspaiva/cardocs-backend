import { createHash } from "crypto";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  PushDeviceTokenRegistration,
  PushDeviceTokenStore,
  StoredPushDeviceToken
} from "../application/pushNotifications.js";

export class FirebasePushDeviceTokenStore implements PushDeviceTokenStore {
  constructor(private readonly db: Firestore) {}

  async saveToken(ownerId: string, registration: PushDeviceTokenRegistration): Promise<void> {
    const tokenRef = this.tokenRef(ownerId, registration.token);
    const globalTokenRef = this.globalTokenRef(registration.token);

    await this.db.runTransaction(async (transaction) => {
      const [snapshot, globalSnapshot] = await Promise.all([
        transaction.get(tokenRef),
        transaction.get(globalTokenRef)
      ]);
      const previousOwnerId = stringValue(globalSnapshot.data()?.ownerId);
      if (previousOwnerId && previousOwnerId !== ownerId) {
        transaction.delete(this.tokenRef(previousOwnerId, registration.token));
      }

      transaction.set(tokenRef, {
        token: registration.token,
        platform: registration.platform,
        provider: "fcm",
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
        lastRegisteredAt: FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(globalTokenRef, {
        ownerId,
        platform: registration.platform,
        provider: "fcm",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  }

  async deleteToken(ownerId: string, token: string): Promise<void> {
    const tokenRef = this.tokenRef(ownerId, token);
    const globalTokenRef = this.globalTokenRef(token);
    await this.db.runTransaction(async (transaction) => {
      const globalSnapshot = await transaction.get(globalTokenRef);
      transaction.delete(tokenRef);
      if (stringValue(globalSnapshot.data()?.ownerId) === ownerId) {
        transaction.delete(globalTokenRef);
      }
    });
  }

  async listTokens(ownerId: string): Promise<StoredPushDeviceToken[]> {
    const snapshot = await this.tokenCollection(ownerId).get();
    return snapshot.docs
      .map((doc) => toStoredToken(doc.id, doc.data()))
      .filter((token): token is StoredPushDeviceToken => token !== null);
  }

  async deleteTokens(ownerId: string, tokens: string[]): Promise<void> {
    const uniqueTokens = [...new Set(tokens)];
    for (const token of uniqueTokens) {
      await this.deleteToken(ownerId, token);
    }
  }

  private tokenCollection(ownerId: string) {
    return this.db.collection("users").doc(ownerId).collection("pushDeviceTokens");
  }

  private tokenRef(ownerId: string, token: string) {
    return this.tokenCollection(ownerId).doc(tokenDocumentId(token));
  }

  private globalTokenRef(token: string) {
    return this.db.collection("pushDeviceTokens").doc(tokenDocumentId(token));
  }
}

function toStoredToken(id: string, value: FirebaseFirestore.DocumentData): StoredPushDeviceToken | null {
  if (typeof value.token !== "string" || value.token.trim().length === 0) {
    return null;
  }
  if (value.platform !== "ios") {
    return null;
  }
  return {
    id,
    token: value.token,
    platform: value.platform
  };
}

function tokenDocumentId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
