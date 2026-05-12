import { Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { AccountDataStore } from "../application/accountDeletion.js";
import { publicReportSlug } from "../domain/factories.js";

type StorageBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export class FirebaseAccountDataStore implements AccountDataStore {
  constructor(
    private readonly db: Firestore,
    private readonly bucket: StorageBucket
  ) {}

  static fromDefaultBucket(db: Firestore): FirebaseAccountDataStore {
    return new FirebaseAccountDataStore(db, getStorage().bucket());
  }

  async deleteAllForUser(ownerId: string): Promise<void> {
    const userRef = this.db.collection("users").doc(ownerId);
    const publicReportIds = await this.publicReportIdsForUser(ownerId);

    await this.deletePublicReports(publicReportIds);
    await this.deleteStoragePrefix(ownerId);
    await this.db.recursiveDelete(userRef);
  }

  private async publicReportIdsForUser(ownerId: string): Promise<string[]> {
    const vehicles = await this.db.collection("users").doc(ownerId).collection("vehicles").get();
    return vehicles.docs
      .map((vehicleDoc) => {
        const vehicle = vehicleDoc.data().vehicle as { id?: unknown; plate?: unknown } | undefined;
        const id = nonEmptyString(vehicle?.id) ?? vehicleDoc.id;
        const plate = nonEmptyString(vehicle?.plate);
        return plate ? publicReportSlug({ id, plate }) : null;
      })
      .filter((value): value is string => Boolean(value));
  }

  private async deletePublicReports(publicReportIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(publicReportIds)];
    for (let index = 0; index < uniqueIds.length; index += 450) {
      const chunk = uniqueIds.slice(index, index + 450);
      if (chunk.length === 0) {
        continue;
      }

      const batch = this.db.batch();
      for (const reportId of chunk) {
        batch.delete(this.db.collection("publicReports").doc(reportId));
      }
      await batch.commit();
    }
  }

  private async deleteStoragePrefix(ownerId: string): Promise<void> {
    await this.bucket.deleteFiles({
      prefix: `users/${sanitizePathSegment(ownerId)}/`,
      force: true
    });
  }
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "unknown";
}
