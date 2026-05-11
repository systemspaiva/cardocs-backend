import { FieldValue, Firestore } from "firebase-admin/firestore";
import { UserProfile } from "../domain/models.js";

export class FirebaseUserRepository {
  constructor(private readonly db: Firestore) {}

  async upsertFromAuth(profile: UserProfile): Promise<UserProfile> {
    const userRef = this.db.collection("users").doc(profile.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
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
