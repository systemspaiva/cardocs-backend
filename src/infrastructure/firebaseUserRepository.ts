import {
  DocumentReference,
  FieldValue,
  Firestore,
  Timestamp
} from "firebase-admin/firestore";
import { ValidationError } from "../application/errors.js";
import {
  GooglePlaySubscriptionSyncAttempt,
  GooglePlaySubscriptionRevocationResult,
  SubscriptionPersistenceMetadata,
  SubscriptionPersistenceResult,
  SubscriptionStore
} from "../application/subscriptions.js";
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

  async syncSubscription(
    userId: string,
    subscription: Omit<UserSubscription, "syncedAt">,
    metadata: SubscriptionPersistenceMetadata,
    attempt: GooglePlaySubscriptionSyncAttempt | null = null
  ): Promise<SubscriptionPersistenceResult> {
    const expiresAt = new Date(subscription.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new ValidationError("Validade da assinatura invalida.");
    }
    const userRef = this.db.collection("users").doc(userId);
    validateGooglePlayAttempt(metadata, attempt);
    const tokenStateRef = attempt
      ? googlePlayTokenStateRef(userRef, attempt.purchaseTokenHash)
      : null;
    const identifiers = [
      ...new Set([subscription.transactionId, subscription.originalTransactionId])
    ];
    const users = this.db.collection("users");
    const matchingTransactions = users.where(
      "subscription.transactionId",
      "in",
      identifiers
    );
    const matchingOriginalTransactions = users.where(
      "subscription.originalTransactionId",
      "in",
      identifiers
    );
    const storePath = `subscriptions.${metadata.store}`;
    const matchingStoreTransactions = users.where(
      `${storePath}.transactionId`,
      "in",
      identifiers
    );
    const matchingStoreOriginalTransactions = users.where(
      `${storePath}.originalTransactionId`,
      "in",
      identifiers
    );
    const matchingStoreLineages = users.where(
      `${storePath}.verification.purchaseTokenLineageHashes`,
      "array-contains-any",
      identifiers
    );
    const matchingHistoryTransactions = users.where(
      "subscriptionHistory.googlePlay.latest.transactionId",
      "in",
      identifiers
    );
    const matchingHistorySupersededTokens = users.where(
      "subscriptionHistory.googlePlay.supersededPurchaseTokenHashes",
      "array-contains-any",
      identifiers
    );

    return this.db.runTransaction(async (transaction) => {
      const [
        userSnapshot,
        transactionOwners,
        originalTransactionOwners,
        storeTransactionOwners,
        storeOriginalTransactionOwners,
        storeLineageOwners,
        historyTransactionOwners,
        historySupersededTokenOwners,
        tokenStateSnapshot
      ] = await Promise.all([
        transaction.get(userRef),
        transaction.get(matchingTransactions),
        transaction.get(matchingOriginalTransactions),
        transaction.get(matchingStoreTransactions),
        transaction.get(matchingStoreOriginalTransactions),
        transaction.get(matchingStoreLineages),
        transaction.get(matchingHistoryTransactions),
        transaction.get(matchingHistorySupersededTokens),
        tokenStateRef ? transaction.get(tokenStateRef) : Promise.resolve(null)
      ]);
      if (
        attempt &&
        tokenStateSnapshot &&
        hasNewerGooglePlayAttempt(tokenStateSnapshot.data() ?? {}, attempt)
      ) {
        return "ignoredStale";
      }
      if (attempt && tokenStateRef) {
        transaction.set(
          tokenStateRef,
          googlePlayTokenStatePatch(attempt, "entitled"),
          { merge: true }
        );
      }
      const existingOwners = new Map(
        [
          ...transactionOwners.docs,
          ...originalTransactionOwners.docs,
          ...storeTransactionOwners.docs,
          ...storeOriginalTransactionOwners.docs,
          ...storeLineageOwners.docs,
          ...historyTransactionOwners.docs,
          ...historySupersededTokenOwners.docs
        ].map((snapshot) => [snapshot.id, snapshot])
      );
      const userData = userSnapshot.data() ?? {};
      const currentSubscriptions = storedSubscriptionsFromData(userData);
      const matchingGooglePlayHistories = metadata.store === "googlePlay"
        ? [
            googlePlayHistoryFromData(userData),
            ...[...existingOwners.values()].map((snapshot) =>
              googlePlayHistoryFromData(snapshot.data() ?? {})
            )
          ]
        : [];
      const matchingStoredSubscriptions = [
        currentSubscriptions[metadata.store],
        ...[...existingOwners.values()].map((snapshot) =>
          storedSubscriptionsFromData(snapshot.data() ?? {})[metadata.store]
        ),
        ...matchingGooglePlayHistories.map((history) => history.latest)
      ].filter(isStoredSubscription);

      if (
        metadata.store === "googlePlay" &&
        (
          matchingStoredSubscriptions.some((stored) =>
            isGooglePlaySuccessorOf(stored, metadata.purchaseTokenHash)
          ) ||
          matchingGooglePlayHistories.some((history) =>
            historySupersedesPurchaseToken(history, metadata.purchaseTokenHash)
          )
        )
      ) {
        return "ignoredStale";
      }

      const currentForStore = currentSubscriptions[metadata.store];
      if (!shouldStoreSubscription(currentForStore, subscription, metadata)) {
        return "ignoredStale";
      }

      const predecessor = findPredecessorSubscription(
        matchingStoredSubscriptions,
        metadata
      );
      const canonicalOriginalTransactionId = storedString(
        predecessor,
        "originalTransactionId"
      ) ?? subscription.originalTransactionId;
      const canonicalMetadata = canonicalSubscriptionMetadata(metadata, predecessor);
      const storedSubscription: StoredSubscription = {
        plan: subscription.plan,
        productId: subscription.productId,
        expiresAt: Timestamp.fromDate(expiresAt),
        transactionId: subscription.transactionId,
        originalTransactionId: canonicalOriginalTransactionId,
        syncedAt: FieldValue.serverTimestamp(),
        verification: canonicalMetadata
      };

      for (const ownerSnapshot of existingOwners.values()) {
        if (ownerSnapshot.id === userId) continue;
        const ownerSubscriptions = storedSubscriptionsFromData(ownerSnapshot.data() ?? {});
        const ownerSubscription = ownerSubscriptions[metadata.store];
        if (!ownerSubscription || !matchesAnyIdentifier(ownerSubscription, identifiers)) {
          continue;
        }
        const ownerHistory = metadata.store === "googlePlay"
          ? googlePlayHistoryWithLatest(
              googlePlayHistoryFromData(ownerSnapshot.data() ?? {}),
              ownerSubscription,
              googlePlayTokenHash(ownerSubscription) === metadata.purchaseTokenHash
                ? []
                : [googlePlayTokenHash(ownerSubscription)]
            )
          : undefined;
        delete ownerSubscriptions[metadata.store];
        transaction.set(
          ownerSnapshot.ref,
          subscriptionStoragePatch(ownerSubscriptions, ownerHistory),
          { merge: true }
        );
      }

      currentSubscriptions[metadata.store] = storedSubscription;
      const currentHistory = metadata.store === "googlePlay"
        ? googlePlayHistoryWithLatest(
            googlePlayHistoryFromData(userData),
            storedSubscription,
            canonicalMetadata.purchaseTokenLineageHashes
          )
        : undefined;
      transaction.set(
        userRef,
        subscriptionStoragePatch(currentSubscriptions, currentHistory),
        { merge: true }
      );
      return "stored";
    });
  }

  async clearSubscription(
    userId: string,
    store: SubscriptionStore = "appStore"
  ): Promise<void> {
    const userRef = this.db.collection("users").doc(userId);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const subscriptions = storedSubscriptionsFromData(snapshot.data() ?? {});
      if (!subscriptions[store]) return;
      delete subscriptions[store];
      transaction.set(userRef, subscriptionStoragePatch(subscriptions), { merge: true });
    });
  }

  async clearGooglePlaySubscription(
    userId: string,
    attempt: GooglePlaySubscriptionSyncAttempt
  ): Promise<GooglePlaySubscriptionRevocationResult> {
    validateGooglePlaySyncAttempt(attempt);
    const userRef = this.db.collection("users").doc(userId);
    const tokenStateRef = googlePlayTokenStateRef(
      userRef,
      attempt.purchaseTokenHash
    );
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, tokenStateSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(tokenStateRef)
      ]);
      if (hasNewerGooglePlayAttempt(tokenStateSnapshot.data() ?? {}, attempt)) {
        return "ignoredStale";
      }
      transaction.set(
        tokenStateRef,
        googlePlayTokenStatePatch(attempt, "notEntitled"),
        { merge: true }
      );
      const subscriptions = storedSubscriptionsFromData(snapshot.data() ?? {});
      const subscription = subscriptions.googlePlay;
      if (
        !subscription ||
        !isMatchingGooglePlaySubscription(subscription, attempt.purchaseTokenHash)
      ) {
        return "unchanged";
      }

      const history = googlePlayHistoryWithLatest(
        googlePlayHistoryFromData(snapshot.data() ?? {}),
        subscription,
        googlePlayLineageHashes(subscription)
      );
      delete subscriptions.googlePlay;
      transaction.set(
        userRef,
        subscriptionStoragePatch(subscriptions, history),
        { merge: true }
      );
      return "cleared";
    });
  }

  async beginGooglePlaySubscriptionSync(
    userId: string,
    purchaseTokenHash: string
  ): Promise<GooglePlaySubscriptionSyncAttempt> {
    if (!isSha256Hash(purchaseTokenHash)) {
      throw new ValidationError("Hash do token Google Play invalido.");
    }
    const userRef = this.db.collection("users").doc(userId);
    const counterRef = googlePlaySyncCounterRef(userRef);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const currentGeneration = snapshot.exists
        ? storedSafeInteger(snapshot.data() ?? {}, "generation")
        : 0;
      if (currentGeneration === null || currentGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Google Play sync generation is invalid.");
      }
      const attempt = {
        purchaseTokenHash,
        generation: currentGeneration + 1
      };
      transaction.set(
        counterRef,
        {
          generation: attempt.generation,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return attempt;
    });
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

type StoredSubscription = Record<string, unknown>;
type StoredSubscriptions = Partial<Record<SubscriptionStore, StoredSubscription>>;
type GooglePlaySubscriptionHistory = {
  latest: StoredSubscription | undefined;
  supersededPurchaseTokenHashes: string[];
};

function storedSubscriptionsFromData(data: Record<string, unknown>): StoredSubscriptions {
  const result: StoredSubscriptions = {};
  const subscriptions = objectRecord(data.subscriptions);
  for (const store of ["appStore", "googlePlay"] as const) {
    const stored = objectRecord(subscriptions?.[store]);
    if (stored) result[store] = stored;
  }

  const legacy = objectRecord(data.subscription);
  if (legacy) {
    const legacyStore = storedSubscriptionStore(legacy) ?? "appStore";
    result[legacyStore] ??= legacy;
  }
  return result;
}

function subscriptionStoragePatch(
  subscriptions: StoredSubscriptions,
  googlePlayHistory?: GooglePlaySubscriptionHistory
) {
  const effective = effectiveSubscription(subscriptions);
  return {
    subscriptions: {
      appStore: subscriptions.appStore ?? FieldValue.delete(),
      googlePlay: subscriptions.googlePlay ?? FieldValue.delete()
    },
    subscription: effective ?? FieldValue.delete(),
    ...(googlePlayHistory
      ? {
          subscriptionHistory: {
            googlePlay: {
              latest: googlePlayHistory.latest ?? FieldValue.delete(),
              supersededPurchaseTokenHashes:
                googlePlayHistory.supersededPurchaseTokenHashes,
              updatedAt: FieldValue.serverTimestamp()
            }
          }
        }
      : {}),
    updatedAt: FieldValue.serverTimestamp()
  };
}

function googlePlayHistoryFromData(
  data: Record<string, unknown>
): GooglePlaySubscriptionHistory {
  const subscriptionHistory = objectRecord(data.subscriptionHistory);
  const googlePlay = objectRecord(subscriptionHistory?.googlePlay);
  const latest = objectRecord(googlePlay?.latest) ?? undefined;
  const supersededPurchaseTokenHashes = Array.isArray(
    googlePlay?.supersededPurchaseTokenHashes
  )
    ? googlePlay.supersededPurchaseTokenHashes.filter(isSha256HashValue)
    : [];
  return { latest, supersededPurchaseTokenHashes };
}

function googlePlayHistoryWithLatest(
  history: GooglePlaySubscriptionHistory,
  latest: StoredSubscription,
  supersededHashes: Array<string | null>
): GooglePlaySubscriptionHistory {
  const supersededPurchaseTokenHashes = new Set(
    history.supersededPurchaseTokenHashes
  );
  for (const hash of supersededHashes) {
    if (hash && isSha256Hash(hash)) supersededPurchaseTokenHashes.add(hash);
  }
  return {
    latest,
    supersededPurchaseTokenHashes: [...supersededPurchaseTokenHashes]
  };
}

function historySupersedesPurchaseToken(
  history: GooglePlaySubscriptionHistory,
  purchaseTokenHash: string | null
): boolean {
  return Boolean(
    purchaseTokenHash &&
    history.supersededPurchaseTokenHashes.includes(purchaseTokenHash)
  );
}

function effectiveSubscription(subscriptions: StoredSubscriptions): StoredSubscription | null {
  return [subscriptions.appStore, subscriptions.googlePlay]
    .filter(isStoredSubscription)
    .map((subscription) => ({ subscription, expiresAt: toDate(subscription.expiresAt) }))
    .filter((candidate): candidate is { subscription: StoredSubscription; expiresAt: Date } =>
      candidate.expiresAt !== null
    )
    .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0]
    ?.subscription ?? null;
}

function shouldStoreSubscription(
  current: StoredSubscription | undefined,
  incoming: Omit<UserSubscription, "syncedAt">,
  metadata: SubscriptionPersistenceMetadata
): boolean {
  if (!current) return true;

  const currentExpiry = toDate(current.expiresAt);
  const incomingExpiry = new Date(incoming.expiresAt);

  if (metadata.store === "googlePlay") {
    const currentHash = googlePlayTokenHash(current);
    if (currentHash && currentHash === metadata.purchaseTokenHash) {
      return !currentExpiry || incomingExpiry >= currentExpiry;
    }
    if (
      currentHash &&
      metadata.linkedPurchaseTokenHash === currentHash
    ) {
      return true;
    }
    if (
      metadata.purchaseTokenHash &&
      googlePlayLineageHashes(current).includes(metadata.purchaseTokenHash)
    ) {
      return false;
    }
  }

  return !currentExpiry || incomingExpiry > currentExpiry;
}

function isGooglePlaySuccessorOf(
  stored: StoredSubscription,
  incomingPurchaseTokenHash: string | null
): boolean {
  if (!incomingPurchaseTokenHash || storedSubscriptionStore(stored) !== "googlePlay") {
    return false;
  }
  const storedHash = googlePlayTokenHash(stored);
  return storedHash !== incomingPurchaseTokenHash &&
    googlePlayLineageHashes(stored).includes(incomingPurchaseTokenHash);
}

function findPredecessorSubscription(
  candidates: StoredSubscription[],
  metadata: SubscriptionPersistenceMetadata
): StoredSubscription | undefined {
  if (metadata.store !== "googlePlay") return undefined;
  const predecessorHash = metadata.linkedPurchaseTokenHash ?? metadata.purchaseTokenHash;
  if (!predecessorHash) return undefined;
  return candidates.find((candidate) =>
    storedSubscriptionStore(candidate) === "googlePlay" &&
    googlePlayTokenHash(candidate) === predecessorHash
  );
}

function canonicalSubscriptionMetadata(
  metadata: SubscriptionPersistenceMetadata,
  predecessor: StoredSubscription | undefined
): SubscriptionPersistenceMetadata {
  if (metadata.store !== "googlePlay") return metadata;

  const lineage = new Set<string>();
  if (predecessor) {
    for (const hash of googlePlayLineageHashes(predecessor)) lineage.add(hash);
    const predecessorHash = googlePlayTokenHash(predecessor);
    if (predecessorHash) lineage.add(predecessorHash);
  }
  for (const hash of metadata.purchaseTokenLineageHashes) lineage.add(hash);
  if (metadata.linkedPurchaseTokenHash) lineage.add(metadata.linkedPurchaseTokenHash);
  if (metadata.purchaseTokenHash) lineage.delete(metadata.purchaseTokenHash);

  return {
    ...metadata,
    purchaseTokenLineageHashes: [...lineage]
  };
}

function googlePlayLineageHashes(subscription: StoredSubscription): string[] {
  const metadata = objectRecord(subscription.verification);
  if (!metadata || metadata.store !== "googlePlay") return [];
  const lineage = new Set<string>();
  if (Array.isArray(metadata.purchaseTokenLineageHashes)) {
    for (const value of metadata.purchaseTokenLineageHashes) {
      if (typeof value === "string" && value) lineage.add(value);
    }
  }
  if (typeof metadata.linkedPurchaseTokenHash === "string") {
    lineage.add(metadata.linkedPurchaseTokenHash);
  }
  const currentHash = googlePlayTokenHash(subscription);
  const original = storedString(subscription, "originalTransactionId");
  if (original && original !== currentHash) lineage.add(original);
  return [...lineage];
}

function googlePlayTokenHash(subscription: StoredSubscription): string | null {
  const metadata = objectRecord(subscription.verification);
  if (metadata?.store === "googlePlay" && typeof metadata.purchaseTokenHash === "string") {
    return metadata.purchaseTokenHash;
  }
  return storedString(subscription, "transactionId");
}

function storedSubscriptionStore(subscription: StoredSubscription): SubscriptionStore | null {
  const metadata = objectRecord(subscription.verification);
  return metadata?.store === "appStore" || metadata?.store === "googlePlay"
    ? metadata.store
    : null;
}

function matchesAnyIdentifier(
  subscription: StoredSubscription,
  identifiers: string[]
): boolean {
  return identifiers.includes(storedString(subscription, "transactionId") ?? "") ||
    identifiers.includes(storedString(subscription, "originalTransactionId") ?? "");
}

function storedString(
  subscription: StoredSubscription | undefined,
  field: string
): string | null {
  const value = subscription?.[field];
  return typeof value === "string" && value ? value : null;
}

function isMatchingGooglePlaySubscription(
  value: StoredSubscription | undefined,
  purchaseTokenHash: string
): boolean {
  return Boolean(
    value &&
    storedSubscriptionStore(value) === "googlePlay" &&
    googlePlayTokenHash(value) === purchaseTokenHash
  );
}

function isStoredSubscription(
  value: StoredSubscription | undefined
): value is StoredSubscription {
  return value !== undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validateGooglePlayAttempt(
  metadata: SubscriptionPersistenceMetadata,
  attempt: GooglePlaySubscriptionSyncAttempt | null
): void {
  if (metadata.store === "appStore") {
    if (attempt) throw new Error("App Store sync cannot use a Google Play attempt.");
    return;
  }
  if (!attempt || metadata.purchaseTokenHash !== attempt.purchaseTokenHash) {
    throw new Error("Google Play sync attempt does not match the verified purchase.");
  }
  validateGooglePlaySyncAttempt(attempt);
}

function validateGooglePlaySyncAttempt(attempt: GooglePlaySubscriptionSyncAttempt): void {
  if (
    !isSha256Hash(attempt.purchaseTokenHash) ||
    !Number.isSafeInteger(attempt.generation) ||
    attempt.generation <= 0
  ) {
    throw new Error("Google Play sync attempt is invalid.");
  }
}

function hasNewerGooglePlayAttempt(
  data: Record<string, unknown>,
  attempt: GooglePlaySubscriptionSyncAttempt
): boolean {
  const generation = storedSafeInteger(data, "generation");
  if (generation === null) return data.generation !== undefined;
  return generation > attempt.generation;
}

function storedSafeInteger(
  data: Record<string, unknown>,
  field: string
): number | null {
  const value = data[field];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function googlePlayTokenStatePatch(
  attempt: GooglePlaySubscriptionSyncAttempt,
  observation: "entitled" | "notEntitled"
) {
  return {
    generation: attempt.generation,
    observation,
    updatedAt: FieldValue.serverTimestamp()
  };
}

function googlePlaySyncCounterRef(userRef: DocumentReference) {
  return userRef.collection("subscriptionSync").doc("googlePlay");
}

function googlePlayTokenStateRef(
  userRef: DocumentReference,
  purchaseTokenHash: string
) {
  return googlePlaySyncCounterRef(userRef).collection("tokens").doc(purchaseTokenHash);
}

function isSha256Hash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isSha256HashValue(value: unknown): value is string {
  return typeof value === "string" && isSha256Hash(value);
}
