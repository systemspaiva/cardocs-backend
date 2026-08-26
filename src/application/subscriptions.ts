import { createHash } from "node:crypto";
import { UserSubscription } from "../domain/models.js";

export interface SubscriptionTransactionVerifier {
  verify(signedTransactionInfo: string): Promise<Omit<UserSubscription, "syncedAt">>;
}

export type SubscriptionStore = "appStore" | "googlePlay";

export interface SubscriptionPersistenceMetadata {
  store: SubscriptionStore;
  purchaseTokenHash: string | null;
  linkedPurchaseTokenHash: string | null;
  purchaseTokenLineageHashes: string[];
  packageName: string | null;
  basePlanId: string | null;
  offerId: string | null;
}

export interface GooglePlaySubscriptionSyncInput {
  packageName: string;
  productId: string;
  purchaseToken: string;
}

export interface VerifiedGooglePlaySubscription {
  subscription: Omit<UserSubscription, "syncedAt">;
  metadata: SubscriptionPersistenceMetadata & { store: "googlePlay" };
  packageName: string;
  productId: string;
  purchaseToken: string;
  needsAcknowledgement: boolean;
}

export interface GooglePlaySubscriptionSyncAttempt {
  purchaseTokenHash: string;
  generation: number;
}

export interface InactiveGooglePlaySubscription {
  status: "notEntitled";
  purchaseTokenHash: string;
}

export type GooglePlaySubscriptionVerification =
  | {
      status: "entitled";
      purchase: VerifiedGooglePlaySubscription;
    }
  | InactiveGooglePlaySubscription;

export interface GooglePlayPurchaseVerifier {
  verify(
    input: GooglePlaySubscriptionSyncInput,
    ownerId: string
  ): Promise<GooglePlaySubscriptionVerification>;

  acknowledge(subscription: VerifiedGooglePlaySubscription): Promise<void>;
}

export interface SubscriptionEntitlementStore {
  beginGooglePlaySubscriptionSync(
    userId: string,
    purchaseTokenHash: string
  ): Promise<GooglePlaySubscriptionSyncAttempt>;

  syncSubscription(
    userId: string,
    subscription: Omit<UserSubscription, "syncedAt">,
    metadata: SubscriptionPersistenceMetadata,
    attempt?: GooglePlaySubscriptionSyncAttempt | null
  ): Promise<SubscriptionPersistenceResult>;

  clearGooglePlaySubscription(
    userId: string,
    attempt: GooglePlaySubscriptionSyncAttempt
  ): Promise<GooglePlaySubscriptionRevocationResult>;
}

export type GooglePlaySubscriptionSyncResult = "granted" | "revoked" | "unchanged";
export type SubscriptionPersistenceResult = "stored" | "ignoredStale";
export type GooglePlaySubscriptionRevocationResult =
  | "cleared"
  | "unchanged"
  | "ignoredStale";

/**
 * Keeps the security-sensitive ordering explicit: verify with Google, persist the
 * entitlement, and only then acknowledge the purchase. Repeated calls are safe.
 */
export class GooglePlaySubscriptionSyncService {
  constructor(
    private readonly verifier: GooglePlayPurchaseVerifier,
    private readonly store: SubscriptionEntitlementStore
  ) {}

  async sync(
    input: GooglePlaySubscriptionSyncInput,
    ownerId: string
  ): Promise<GooglePlaySubscriptionSyncResult> {
    const purchaseTokenHash = googlePlayPurchaseTokenHash(input.purchaseToken);
    const attempt = await this.store.beginGooglePlaySubscriptionSync(
      ownerId,
      purchaseTokenHash
    );
    const verification = await this.verifier.verify(input, ownerId);
    if (verification.status === "notEntitled") {
      assertVerifiedPurchaseTokenHash(
        verification.purchaseTokenHash,
        attempt.purchaseTokenHash
      );
      const revocation = await this.store.clearGooglePlaySubscription(ownerId, attempt);
      return revocation === "cleared" ? "revoked" : "unchanged";
    }

    assertVerifiedPurchaseTokenHash(
      verification.purchase.metadata.purchaseTokenHash,
      attempt.purchaseTokenHash
    );

    const persistenceResult = await this.store.syncSubscription(
      ownerId,
      verification.purchase.subscription,
      verification.purchase.metadata,
      attempt
    );
    if (persistenceResult === "ignoredStale") return "unchanged";
    await this.verifier.acknowledge(verification.purchase);
    return "granted";
  }
}

export const appStoreSubscriptionMetadata: SubscriptionPersistenceMetadata = {
  store: "appStore",
  purchaseTokenHash: null,
  linkedPurchaseTokenHash: null,
  purchaseTokenLineageHashes: [],
  packageName: null,
  basePlanId: null,
  offerId: null
};

export function googlePlayAccountIdForOwner(ownerId: string): string {
  return createHash("sha256").update(ownerId, "utf8").digest("hex");
}

export function googlePlayPurchaseTokenHash(purchaseToken: string): string {
  return createHash("sha256").update(purchaseToken, "utf8").digest("hex");
}

function assertVerifiedPurchaseTokenHash(
  verifiedHash: string | null,
  expectedHash: string
): void {
  if (verifiedHash !== expectedHash) {
    throw new Error("Google Play verifier returned a mismatched purchase token hash.");
  }
}
