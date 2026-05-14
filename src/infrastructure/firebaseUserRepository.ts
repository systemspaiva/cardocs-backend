import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { ValidationError } from "../application/errors.js";
import { LegalAcceptance, UserProfile } from "../domain/models.js";

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
