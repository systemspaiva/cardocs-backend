import { getAuth } from "firebase-admin/auth";
import { AccountAuthStore } from "../application/accountDeletion.js";

export class FirebaseAccountAuthStore implements AccountAuthStore {
  async deleteUser(ownerId: string): Promise<void> {
    try {
      await getAuth().deleteUser(ownerId);
    } catch (error) {
      if (isUserNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }
}

function isUserNotFoundError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "auth/user-not-found";
}
