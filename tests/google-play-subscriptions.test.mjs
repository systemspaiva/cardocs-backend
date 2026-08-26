import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import {
  GooglePlaySubscriptionSyncService,
  googlePlayAccountIdForOwner,
  googlePlayPurchaseTokenHash
} from "../lib/application/subscriptions.js";
import { ExternalProviderError, ValidationError } from "../lib/application/errors.js";
import { GooglePlaySubscriptionVerifier } from "../lib/infrastructure/googlePlaySubscriptionVerifier.js";
import { FirebaseUserRepository } from "../lib/infrastructure/firebaseUserRepository.js";
import { syncGooglePlaySubscriptionSchema } from "../lib/interfaces/http/schemas.js";

const OWNER_ID = "firebase-owner-123";
const PACKAGE_NAME = "com.luhenpa.cardocs";
const PRODUCT_ID = "tarevisado_premium";
const BASE_PLAN_ID = "monthly";
const PURCHASE_TOKEN = "purchase-token-with-enough-entropy";
const LINKED_TOKEN = "previous-purchase-token-with-enough-entropy";
const NOW = new Date("2026-08-26T12:00:00.000Z");
const PRODUCTS = [
  { plan: "monthly", productId: PRODUCT_ID, basePlanId: BASE_PLAN_ID },
  { plan: "annual", productId: PRODUCT_ID, basePlanId: "annual" }
];

describe("GooglePlaySubscriptionVerifier", () => {
  test("validates package, product, base plan and account before granting", async () => {
    const client = new FakePublisherClient([activePurchase({ linkedPurchaseToken: LINKED_TOKEN })]);
    const verifier = createVerifier(client);

    const result = await verifier.verify(syncInput(), OWNER_ID);

    assert.equal(result.status, "entitled");
    const verified = result.purchase;
    assert.deepEqual(verified.subscription, {
      plan: "monthly",
      productId: PRODUCT_ID,
      expiresAt: "2026-09-26T12:00:00.000Z",
      transactionId: googlePlayPurchaseTokenHash(PURCHASE_TOKEN),
      originalTransactionId: googlePlayPurchaseTokenHash(LINKED_TOKEN)
    });
    assert.deepEqual(verified.metadata, {
      store: "googlePlay",
      purchaseTokenHash: googlePlayPurchaseTokenHash(PURCHASE_TOKEN),
      linkedPurchaseTokenHash: googlePlayPurchaseTokenHash(LINKED_TOKEN),
      purchaseTokenLineageHashes: [googlePlayPurchaseTokenHash(LINKED_TOKEN)],
      packageName: PACKAGE_NAME,
      basePlanId: BASE_PLAN_ID,
      offerId: "intro"
    });
    assert.equal(verified.needsAcknowledgement, true);
    assert.equal(JSON.stringify(verified.metadata).includes(PURCHASE_TOKEN), false);
    assert.deepEqual(client.getCalls, [{ packageName: PACKAGE_NAME, purchaseToken: PURCHASE_TOKEN }]);
  });

  test("rejects an unexpected package or product before calling Google", async () => {
    const client = new FakePublisherClient([activePurchase()]);
    const verifier = createVerifier(client);

    await assert.rejects(
      verifier.verify(syncInput({ packageName: "com.attacker.app" }), OWNER_ID),
      ValidationError
    );
    await assert.rejects(
      verifier.verify(syncInput({ productId: "unauthorized_product" }), OWNER_ID),
      ValidationError
    );
    assert.equal(client.getCalls.length, 0);
  });

  test("rejects account and base-plan mismatches", async () => {
    const wrongAccountClient = new FakePublisherClient([
      activePurchase({
        externalAccountIdentifiers: { obfuscatedExternalAccountId: "another-account" }
      })
    ]);
    await assert.rejects(
      createVerifier(wrongAccountClient).verify(syncInput(), OWNER_ID),
      ValidationError
    );

    const wrongPlanClient = new FakePublisherClient([
      activePurchase({
        lineItems: [lineItem({ basePlanId: "not-configured" })]
      })
    ]);
    await assert.rejects(
      createVerifier(wrongPlanClient).verify(syncInput(), OWNER_ID),
      ValidationError
    );
  });

  for (const state of [
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"
  ]) {
    test(`returns a revocation result for ${state}`, async () => {
      const client = new FakePublisherClient([
        activePurchase({
          subscriptionState: state,
          lineItems: [lineItem({ expiryTime: "2026-07-01T00:00:00.000Z" })]
        })
      ]);

      const result = await createVerifier(client).verify(syncInput(), OWNER_ID);

      assert.deepEqual(result, {
        status: "notEntitled",
        purchaseTokenHash: googlePlayPurchaseTokenHash(PURCHASE_TOKEN)
      });
    });
  }

  for (const state of [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  ]) {
    test(`keeps future entitlement for ${state}`, async () => {
      const client = new FakePublisherClient([activePurchase({ subscriptionState: state })]);

      const result = await createVerifier(client).verify(syncInput(), OWNER_ID);

      assert.equal(result.status, "entitled");
    });
  }

  test("rejects unknown states, invalid acknowledgement and expired active line item", async () => {
    await assert.rejects(
      createVerifier(new FakePublisherClient([
        activePurchase({ subscriptionState: "SUBSCRIPTION_STATE_FUTURE" })
      ])).verify(syncInput(), OWNER_ID),
      ValidationError
    );
    await assert.rejects(
      createVerifier(new FakePublisherClient([
        activePurchase({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_UNSPECIFIED" })
      ])).verify(syncInput(), OWNER_ID),
      ValidationError
    );
    await assert.rejects(
      createVerifier(new FakePublisherClient([
        activePurchase({
          lineItems: [lineItem({ expiryTime: "2026-08-26T12:00:00.000Z" })]
        })
      ])).verify(syncInput(), OWNER_ID),
      ValidationError
    );
  });

  test("maps invalid tokens to validation errors and outages to provider errors", async () => {
    const invalid = Object.assign(new Error("gone"), { response: { status: 410 } });
    await assert.rejects(
      createVerifier(new FakePublisherClient([invalid])).verify(syncInput(), OWNER_ID),
      ValidationError
    );

    await assert.rejects(
      createVerifier(new FakePublisherClient([new Error("timeout")])).verify(syncInput(), OWNER_ID),
      ExternalProviderError
    );
  });

  test("acknowledges pending purchases and treats a concurrent acknowledgement as success", async () => {
    const client = new FakePublisherClient([
      activePurchase(),
      activePurchase({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" })
    ]);
    client.acknowledgeError = new Error("already acknowledged concurrently");
    const verifier = createVerifier(client);
    const result = await verifier.verify(syncInput(), OWNER_ID);
    assert.equal(result.status, "entitled");

    await verifier.acknowledge(result.purchase);

    assert.equal(client.acknowledgeCalls.length, 1);
    assert.equal(client.getCalls.length, 2);
  });

  test("skips already acknowledged purchases and surfaces unresolved acknowledgement failures", async () => {
    const acknowledgedClient = new FakePublisherClient([
      activePurchase({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" })
    ]);
    const acknowledgedVerifier = createVerifier(acknowledgedClient);
    const acknowledged = await acknowledgedVerifier.verify(syncInput(), OWNER_ID);
    assert.equal(acknowledged.status, "entitled");
    await acknowledgedVerifier.acknowledge(acknowledged.purchase);
    assert.equal(acknowledgedClient.acknowledgeCalls.length, 0);

    const failingClient = new FakePublisherClient([activePurchase(), activePurchase()]);
    failingClient.acknowledgeError = new Error("timeout");
    const failingVerifier = createVerifier(failingClient);
    const pending = await failingVerifier.verify(syncInput(), OWNER_ID);
    assert.equal(pending.status, "entitled");
    await assert.rejects(
      failingVerifier.acknowledge(pending.purchase),
      ExternalProviderError
    );
  });

  test("fails closed for empty or ambiguous server product configuration", () => {
    assert.throws(() => new GooglePlaySubscriptionVerifier(
      new FakePublisherClient([]),
      PACKAGE_NAME,
      [],
      () => NOW
    ));
    assert.throws(() => new GooglePlaySubscriptionVerifier(
      new FakePublisherClient([]),
      PACKAGE_NAME,
      [PRODUCTS[0], { ...PRODUCTS[0], plan: "annual" }],
      () => NOW
    ));
  });
});

describe("GooglePlaySubscriptionSyncService", () => {
  test("persists a verified entitlement before acknowledging it", async () => {
    const events = [];
    const purchase = verifiedPurchase();
    const verifier = {
      async verify() {
        events.push("verify");
        return { status: "entitled", purchase };
      },
      async acknowledge(received) {
        assert.equal(received, purchase);
        events.push("acknowledge");
      }
    };
    const store = fakeStore(events);

    const result = await new GooglePlaySubscriptionSyncService(verifier, store)
      .sync(syncInput(), OWNER_ID);

    assert.equal(result, "granted");
    assert.deepEqual(events, ["begin", "verify", "persist", "acknowledge"]);
  });

  test("never acknowledges when persistence fails", async () => {
    const events = [];
    const verifier = {
      async verify() {
        events.push("verify");
        return { status: "entitled", purchase: verifiedPurchase() };
      },
      async acknowledge() {
        events.push("acknowledge");
      }
    };
    const store = fakeStore(events, { persistenceError: new Error("firestore unavailable") });

    await assert.rejects(
      new GooglePlaySubscriptionSyncService(verifier, store).sync(syncInput(), OWNER_ID),
      /firestore unavailable/
    );
    assert.deepEqual(events, ["begin", "verify", "persist"]);
  });

  test("never acknowledges a stale purchase that persistence ignored", async () => {
    const events = [];
    const verifier = {
      async verify() {
        events.push("verify");
        return { status: "entitled", purchase: verifiedPurchase() };
      },
      async acknowledge() {
        events.push("acknowledge");
      }
    };
    const store = fakeStore(events, { persistenceResult: "ignoredStale" });

    const result = await new GooglePlaySubscriptionSyncService(verifier, store)
      .sync(syncInput(), OWNER_ID);

    assert.equal(result, "unchanged");
    assert.deepEqual(events, ["begin", "verify", "persist"]);
  });

  test("conditionally revokes only the verified inactive purchase and never acknowledges it", async () => {
    const events = [];
    const purchaseTokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const verifier = {
      async verify() {
        events.push("verify");
        return { status: "notEntitled", purchaseTokenHash };
      },
      async acknowledge() {
        events.push("acknowledge");
      }
    };
    const store = fakeStore(events);

    const result = await new GooglePlaySubscriptionSyncService(verifier, store)
      .sync(syncInput(), OWNER_ID);

    assert.equal(result, "revoked");
    assert.deepEqual(events, ["begin", "verify", `revoke:${OWNER_ID}:${purchaseTokenHash}`]);
  });
});

describe("Google Play HTTP schema", () => {
  test("uses the documented lowercase SHA-256 account identifier contract", () => {
    assert.equal(
      googlePlayAccountIdForOwner(OWNER_ID),
      "e081eaa37a9583b9ccb337de082bc9ebc9d3f7e99e9d2480df2e3d8fceee9b7f"
    );
  });

  test("accepts the exact Android contract and rejects malformed or extra fields", () => {
    assert.deepEqual(syncGooglePlaySubscriptionSchema.parse(syncInput()), syncInput());
    assert.throws(() => syncGooglePlaySubscriptionSchema.parse(syncInput({ purchaseToken: "short" })));
    assert.throws(() => syncGooglePlaySubscriptionSchema.parse(syncInput({ packageName: "invalid" })));
    assert.throws(() => syncGooglePlaySubscriptionSchema.parse({ ...syncInput(), ownerId: OWNER_ID }));
  });
});

describe("FirebaseUserRepository Google Play persistence", () => {
  test("migrates the current and linked token lineage and never persists the raw token", async () => {
    const linkedHash = googlePlayPurchaseTokenHash(LINKED_TOKEN);
    const previousSubscription = storedGoogleSubscription({
      purchaseTokenHash: linkedHash,
      originalTransactionId: linkedHash
    });
    const firestore = new FakeFirestore({
      queryDocuments: {
        "subscription.transactionId": ["previous-owner"],
        "subscription.originalTransactionId": ["previous-owner"]
      },
      documents: {
        "previous-owner": {
          subscription: previousSubscription,
          subscriptions: { googlePlay: previousSubscription }
        }
      }
    });
    const repository = new FirebaseUserRepository(firestore);
    const purchase = verifiedPurchase();
    purchase.metadata.linkedPurchaseTokenHash = linkedHash;
    purchase.metadata.purchaseTokenLineageHashes = [linkedHash];
    purchase.subscription.originalTransactionId = purchase.metadata.linkedPurchaseTokenHash;

    await repository.syncSubscription(
      OWNER_ID,
      purchase.subscription,
      purchase.metadata,
      googleAttempt(purchase.metadata.purchaseTokenHash)
    );

    const previousOwnerWrites = firestore.writes.filter((write) =>
      write.ref.id === "previous-owner"
    );
    assert.equal(previousOwnerWrites.length, 1);
    assert.equal(Object.hasOwn(previousOwnerWrites[0].data, "subscription"), true);

    const ownerWrite = firestore.writes.find((write) => write.ref.id === OWNER_ID);
    assert.ok(ownerWrite);
    assert.deepEqual(ownerWrite.data.subscription.verification, purchase.metadata);
    const tokenStateWrite = firestore.writes.find((write) =>
      write.ref.path === googlePlayTokenStatePath(purchase.metadata.purchaseTokenHash)
    );
    assert.equal(tokenStateWrite.data.observation, "entitled");
    assert.equal(tokenStateWrite.data.generation, 1);
    assert.equal(JSON.stringify(ownerWrite.data).includes(PURCHASE_TOKEN), false);
    assert.deepEqual(
      firestore.queries.map((query) => query.values),
      [
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId],
        [purchase.subscription.transactionId, purchase.subscription.originalTransactionId]
      ]
    );
  });

  test("preserves the lineage root and ignores stale predecessors across owners", async () => {
    const firstHash = googlePlayPurchaseTokenHash("first-purchase-token-0001");
    const secondHash = googlePlayPurchaseTokenHash("second-purchase-token-0002");
    const thirdHash = googlePlayPurchaseTokenHash("third-purchase-token-0003");
    const second = storedGoogleSubscription({
      purchaseTokenHash: secondHash,
      linkedPurchaseTokenHash: firstHash,
      lineage: [firstHash],
      originalTransactionId: firstHash,
      expiresAt: "2026-10-01T00:00:00.000Z"
    });
    const successorFirestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: second,
          subscriptions: { googlePlay: second }
        }
      },
      queryDocuments: {
        "subscriptions.googlePlay.transactionId": [OWNER_ID]
      }
    });
    const thirdMetadata = googleMetadata({
      purchaseTokenHash: thirdHash,
      linkedPurchaseTokenHash: secondHash,
      lineage: [secondHash]
    });

    assert.equal(
      await new FirebaseUserRepository(successorFirestore).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: thirdHash,
          originalTransactionId: secondHash,
          expiresAt: "2026-11-01T00:00:00.000Z"
        }),
        thirdMetadata,
        googleAttempt(thirdHash)
      ),
      "stored"
    );
    const successorWrite = successorFirestore.writes.find((write) => write.ref.id === OWNER_ID);
    assert.equal(successorWrite.data.subscription.originalTransactionId, firstHash);
    assert.deepEqual(
      successorWrite.data.subscription.verification.purchaseTokenLineageHashes,
      [firstHash, secondHash]
    );

    const third = successorWrite.data.subscription;
    const staleFirestore = new FakeFirestore({
      documents: {
        "new-owner": {
          subscription: third,
          subscriptions: { googlePlay: third }
        }
      },
      queryDocuments: {
        "subscriptions.googlePlay.originalTransactionId": ["new-owner"]
      }
    });
    const staleMetadata = googleMetadata({ purchaseTokenHash: firstHash });
    assert.equal(
      await new FirebaseUserRepository(staleFirestore).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: firstHash,
          originalTransactionId: firstHash,
          expiresAt: "2026-12-01T00:00:00.000Z"
        }),
        staleMetadata,
        googleAttempt(firstHash)
      ),
      "ignoredStale"
    );
    assert.equal(userDocumentWrites(staleFirestore).length, 0);
  });

  test("keeps ancestor tombstones after a successor is granted and later revoked", async () => {
    const successorOwner = "successor-owner";
    const replayOwner = "replay-owner";
    const firstHash = googlePlayPurchaseTokenHash("first-purchase-token-0001");
    const secondHash = googlePlayPurchaseTokenHash("second-purchase-token-0002");
    const first = storedGoogleSubscription({
      purchaseTokenHash: firstHash,
      originalTransactionId: firstHash,
      expiresAt: "2026-10-01T00:00:00.000Z"
    });
    const grantFirestore = new FakeFirestore({
      documents: {
        [successorOwner]: {
          subscription: first,
          subscriptions: { googlePlay: first }
        }
      }
    });
    const secondMetadata = googleMetadata({
      purchaseTokenHash: secondHash,
      linkedPurchaseTokenHash: firstHash,
      lineage: [firstHash]
    });

    assert.equal(
      await new FirebaseUserRepository(grantFirestore).syncSubscription(
        successorOwner,
        subscriptionInput({
          transactionId: secondHash,
          originalTransactionId: firstHash,
          expiresAt: "2026-11-01T00:00:00.000Z"
        }),
        secondMetadata,
        googleAttempt(secondHash, 2)
      ),
      "stored"
    );
    const grantWrite = userDocumentWrites(grantFirestore, successorOwner)[0];
    const second = grantWrite.data.subscriptions.googlePlay;
    assert.equal(
      grantWrite.data.subscriptionHistory.googlePlay.latest,
      second
    );
    assert.deepEqual(
      grantWrite.data.subscriptionHistory.googlePlay.supersededPurchaseTokenHashes,
      [firstHash]
    );

    const revokeFirestore = new FakeFirestore({
      documents: {
        [successorOwner]: {
          subscription: second,
          subscriptions: { googlePlay: second },
          subscriptionHistory: grantWrite.data.subscriptionHistory
        },
        [googlePlayTokenStatePath(secondHash, successorOwner)]: {
          generation: 2,
          observation: "entitled"
        }
      }
    });
    assert.equal(
      await new FirebaseUserRepository(revokeFirestore).clearGooglePlaySubscription(
        successorOwner,
        googleAttempt(secondHash, 3)
      ),
      "cleared"
    );
    const revokeWrite = userDocumentWrites(revokeFirestore, successorOwner)[0];
    assert.equal(
      revokeWrite.data.subscriptionHistory.googlePlay.latest,
      second
    );
    assert.deepEqual(
      revokeWrite.data.subscriptionHistory.googlePlay.supersededPurchaseTokenHashes,
      [firstHash]
    );

    const staleReplay = new FakeFirestore({
      documents: {
        [successorOwner]: {
          subscriptionHistory: revokeWrite.data.subscriptionHistory
        }
      },
      queryDocuments: {
        "subscriptionHistory.googlePlay.supersededPurchaseTokenHashes": [
          successorOwner
        ]
      }
    });
    assert.equal(
      await new FirebaseUserRepository(staleReplay).syncSubscription(
        replayOwner,
        subscriptionInput({
          transactionId: firstHash,
          originalTransactionId: firstHash,
          expiresAt: "2026-12-01T00:00:00.000Z"
        }),
        googleMetadata({ purchaseTokenHash: firstHash }),
        googleAttempt(firstHash)
      ),
      "ignoredStale"
    );
    assert.equal(userDocumentWrites(staleReplay, replayOwner).length, 0);
  });

  test("rejects an intermediate predecessor found only in a successor lineage", async () => {
    const firstHash = googlePlayPurchaseTokenHash("first-purchase-token-0001");
    const secondHash = googlePlayPurchaseTokenHash("second-purchase-token-0002");
    const thirdHash = googlePlayPurchaseTokenHash("third-purchase-token-0003");
    const fourthHash = googlePlayPurchaseTokenHash("fourth-purchase-token-0004");
    const fourth = storedGoogleSubscription({
      purchaseTokenHash: fourthHash,
      linkedPurchaseTokenHash: thirdHash,
      lineage: [firstHash, secondHash, thirdHash],
      originalTransactionId: firstHash,
      expiresAt: "2027-01-01T00:00:00.000Z"
    });
    const firestore = new FakeFirestore({
      documents: {
        "latest-owner": {
          subscription: fourth,
          subscriptions: { googlePlay: fourth }
        }
      },
      queryDocuments: {
        "subscriptions.googlePlay.verification.purchaseTokenLineageHashes": ["latest-owner"]
      }
    });

    assert.equal(
      await new FirebaseUserRepository(firestore).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: thirdHash,
          originalTransactionId: secondHash,
          expiresAt: "2027-02-01T00:00:00.000Z"
        }),
        googleMetadata({
          purchaseTokenHash: thirdHash,
          linkedPurchaseTokenHash: secondHash,
          lineage: [firstHash, secondHash]
        }),
        googleAttempt(thirdHash)
      ),
      "ignoredStale"
    );
    assert.equal(userDocumentWrites(firestore).length, 0);
  });

  test("does not regress the expiry of the same purchase token", async () => {
    const tokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const current = storedGoogleSubscription({
      purchaseTokenHash: tokenHash,
      originalTransactionId: tokenHash,
      expiresAt: "2026-11-01T00:00:00.000Z"
    });
    const firestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: current,
          subscriptions: { googlePlay: current }
        }
      }
    });

    assert.equal(
      await new FirebaseUserRepository(firestore).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: tokenHash,
          originalTransactionId: tokenHash,
          expiresAt: "2026-10-01T00:00:00.000Z"
        }),
        googleMetadata({ purchaseTokenHash: tokenHash }),
        googleAttempt(tokenHash)
      ),
      "ignoredStale"
    );
    assert.equal(userDocumentWrites(firestore).length, 0);
  });

  test("does not mark the current token as its own superseded ancestor", async () => {
    const firstHash = googlePlayPurchaseTokenHash("first-purchase-token-0001");
    const currentHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const current = storedGoogleSubscription({
      purchaseTokenHash: currentHash,
      linkedPurchaseTokenHash: firstHash,
      lineage: [firstHash],
      originalTransactionId: firstHash,
      expiresAt: "2026-11-01T00:00:00.000Z"
    });
    const firestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: current,
          subscriptions: { googlePlay: current },
          subscriptionHistory: {
            googlePlay: {
              latest: current,
              supersededPurchaseTokenHashes: [firstHash]
            }
          }
        },
        [googlePlayTokenStatePath(currentHash)]: {
          generation: 1,
          observation: "entitled"
        }
      }
    });

    assert.equal(
      await new FirebaseUserRepository(firestore).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: currentHash,
          originalTransactionId: firstHash,
          expiresAt: "2026-11-01T00:00:00.000Z"
        }),
        googleMetadata({
          purchaseTokenHash: currentHash,
          linkedPurchaseTokenHash: firstHash,
          lineage: [firstHash]
        }),
        googleAttempt(currentHash, 2)
      ),
      "stored"
    );
    const write = userDocumentWrites(firestore)[0];
    assert.deepEqual(
      write.data.subscription.verification.purchaseTokenLineageHashes,
      [firstHash]
    );
    assert.deepEqual(
      write.data.subscriptionHistory.googlePlay.supersededPurchaseTokenHashes,
      [firstHash]
    );
  });

  test("allocates a monotonic per-user generation before Google Play verification", async () => {
    const tokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const firestore = new FakeFirestore({
      documents: {
        [googlePlayCounterPath()]: { generation: 8 }
      }
    });

    assert.deepEqual(
      await new FirebaseUserRepository(firestore)
        .beginGooglePlaySubscriptionSync(OWNER_ID, tokenHash),
      googleAttempt(tokenHash, 9)
    );
    const counterWrite = firestore.writes.find((write) =>
      write.ref.path === googlePlayCounterPath()
    );
    assert.equal(counterWrite.data.generation, 9);
  });

  test("prevents older active and inactive results from winning either race order", async () => {
    const tokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const current = storedGoogleSubscription({
      purchaseTokenHash: tokenHash,
      originalTransactionId: tokenHash,
      expiresAt: "2026-11-01T00:00:00.000Z"
    });
    const tokenState = { generation: 2, observation: "entitled" };
    const olderActive = new FakeFirestore({
      documents: {
        [googlePlayTokenStatePath(tokenHash)]: {
          generation: 2,
          observation: "notEntitled"
        }
      }
    });

    assert.equal(
      await new FirebaseUserRepository(olderActive).syncSubscription(
        OWNER_ID,
        subscriptionInput({
          transactionId: tokenHash,
          originalTransactionId: tokenHash,
          expiresAt: "2026-12-01T00:00:00.000Z"
        }),
        googleMetadata({ purchaseTokenHash: tokenHash }),
        googleAttempt(tokenHash, 1)
      ),
      "ignoredStale"
    );
    assert.equal(olderActive.writes.length, 0);

    const olderInactive = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: current,
          subscriptions: { googlePlay: current }
        },
        [googlePlayTokenStatePath(tokenHash)]: tokenState
      }
    });
    assert.equal(
      await new FirebaseUserRepository(olderInactive).clearGooglePlaySubscription(
        OWNER_ID,
        googleAttempt(tokenHash, 1)
      ),
      "ignoredStale"
    );
    assert.equal(olderInactive.writes.length, 0);
  });

  test("keeps independent store entitlements and falls back when Google Play is revoked", async () => {
    const appStore = storedAppStoreSubscription({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const firestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: appStore,
          subscriptions: { appStore }
        }
      }
    });
    const purchase = verifiedPurchase();

    await new FirebaseUserRepository(firestore)
      .syncSubscription(
        OWNER_ID,
        purchase.subscription,
        purchase.metadata,
        googleAttempt(purchase.metadata.purchaseTokenHash)
      );

    const write = firestore.writes.find((candidate) => candidate.ref.id === OWNER_ID);
    assert.equal(write.data.subscriptions.appStore, appStore);
    assert.equal(write.data.subscriptions.googlePlay.verification.store, "googlePlay");
    assert.equal(write.data.subscription, appStore);

    const withBothStores = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: appStore,
          subscriptions: {
            appStore,
            googlePlay: write.data.subscriptions.googlePlay
          }
        }
      }
    });
    assert.equal(
      await new FirebaseUserRepository(withBothStores).clearGooglePlaySubscription(
        OWNER_ID,
        googleAttempt(purchase.metadata.purchaseTokenHash)
      ),
      "cleared"
    );
    const googleClearWrite = userDocumentWrites(withBothStores)[0];
    assert.equal(googleClearWrite.data.subscription, appStore);
    assert.equal(googleClearWrite.data.subscriptions.appStore, appStore);
    assert.equal(
      googleClearWrite.data.subscriptions.googlePlay.isEqual(FieldValue.delete()),
      true
    );

    const clearAppStoreFirestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: appStore,
          subscriptions: {
            appStore,
            googlePlay: write.data.subscriptions.googlePlay
          }
        }
      }
    });
    await new FirebaseUserRepository(clearAppStoreFirestore).clearSubscription(OWNER_ID);
    const appStoreClearWrite = userDocumentWrites(clearAppStoreFirestore)[0];
    assert.equal(
      appStoreClearWrite.data.subscription,
      write.data.subscriptions.googlePlay
    );
    assert.equal(
      appStoreClearWrite.data.subscriptions.appStore.isEqual(FieldValue.delete()),
      true
    );
    assert.equal(
      appStoreClearWrite.data.subscriptions.googlePlay,
      write.data.subscriptions.googlePlay
    );
  });

  test("conditionally clears only a matching Google Play token", async () => {
    const tokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
    const matchingFirestore = new FakeFirestore({
      documents: {
        [OWNER_ID]: {
          subscription: {
            verification: { store: "googlePlay", purchaseTokenHash: tokenHash }
          }
        }
      }
    });
    assert.equal(
      await new FirebaseUserRepository(matchingFirestore)
        .clearGooglePlaySubscription(OWNER_ID, googleAttempt(tokenHash)),
      "cleared"
    );
    assert.equal(userDocumentWrites(matchingFirestore).length, 1);
    const tokenStateWrite = matchingFirestore.writes.find((write) =>
      write.ref.path === googlePlayTokenStatePath(tokenHash)
    );
    assert.equal(tokenStateWrite.data.observation, "notEntitled");
    assert.equal(tokenStateWrite.data.generation, 1);

    for (const verification of [
      { store: "googlePlay", purchaseTokenHash: "another-token" },
      { store: "appStore", purchaseTokenHash: tokenHash },
      null
    ]) {
      const firestore = new FakeFirestore({
        documents: {
          [OWNER_ID]: { subscription: verification ? { verification } : null }
        }
      });
      assert.equal(
        await new FirebaseUserRepository(firestore)
          .clearGooglePlaySubscription(OWNER_ID, googleAttempt(tokenHash)),
        "unchanged"
      );
      assert.equal(userDocumentWrites(firestore).length, 0);
    }
  });
});

function createVerifier(client) {
  return new GooglePlaySubscriptionVerifier(client, PACKAGE_NAME, PRODUCTS, () => NOW);
}

function syncInput(overrides = {}) {
  return {
    packageName: PACKAGE_NAME,
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    ...overrides
  };
}

function activePurchase(overrides = {}) {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: googlePlayAccountIdForOwner(OWNER_ID)
    },
    lineItems: [lineItem()],
    ...overrides
  };
}

function lineItem(overrides = {}) {
  const { basePlanId = BASE_PLAN_ID, ...rest } = overrides;
  return {
    productId: PRODUCT_ID,
    expiryTime: "2026-09-26T12:00:00.000Z",
    offerDetails: { basePlanId, offerId: "intro" },
    ...rest
  };
}

function verifiedPurchase() {
  const purchaseTokenHash = googlePlayPurchaseTokenHash(PURCHASE_TOKEN);
  return {
    subscription: {
      plan: "monthly",
      productId: PRODUCT_ID,
      expiresAt: "2026-09-26T12:00:00.000Z",
      transactionId: purchaseTokenHash,
      originalTransactionId: purchaseTokenHash
    },
    metadata: {
      store: "googlePlay",
      purchaseTokenHash,
      linkedPurchaseTokenHash: null,
      purchaseTokenLineageHashes: [],
      packageName: PACKAGE_NAME,
      basePlanId: BASE_PLAN_ID,
      offerId: null
    },
    packageName: PACKAGE_NAME,
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    needsAcknowledgement: true
  };
}

function googleMetadata({
  purchaseTokenHash,
  linkedPurchaseTokenHash = null,
  lineage = []
}) {
  return {
    store: "googlePlay",
    purchaseTokenHash,
    linkedPurchaseTokenHash,
    purchaseTokenLineageHashes: lineage,
    packageName: PACKAGE_NAME,
    basePlanId: BASE_PLAN_ID,
    offerId: null
  };
}

function subscriptionInput(overrides = {}) {
  return {
    plan: "monthly",
    productId: PRODUCT_ID,
    expiresAt: "2026-09-26T12:00:00.000Z",
    transactionId: googlePlayPurchaseTokenHash(PURCHASE_TOKEN),
    originalTransactionId: googlePlayPurchaseTokenHash(PURCHASE_TOKEN),
    ...overrides
  };
}

function storedGoogleSubscription({
  purchaseTokenHash,
  linkedPurchaseTokenHash = null,
  lineage = [],
  originalTransactionId,
  expiresAt = "2026-09-26T12:00:00.000Z"
}) {
  return {
    ...subscriptionInput({
      transactionId: purchaseTokenHash,
      originalTransactionId,
      expiresAt
    }),
    syncedAt: new Date("2026-08-26T12:00:00.000Z"),
    verification: googleMetadata({
      purchaseTokenHash,
      linkedPurchaseTokenHash,
      lineage
    })
  };
}

function storedAppStoreSubscription({ expiresAt }) {
  return {
    plan: "annual",
    productId: "com.paivaapps.tarevisado.premium.annual",
    expiresAt: new Date(expiresAt),
    transactionId: "app-store-transaction",
    originalTransactionId: "app-store-original",
    syncedAt: new Date("2026-08-26T12:00:00.000Z"),
    verification: {
      store: "appStore",
      purchaseTokenHash: null,
      linkedPurchaseTokenHash: null,
      purchaseTokenLineageHashes: [],
      packageName: null,
      basePlanId: null,
      offerId: null
    }
  };
}

function googleAttempt(purchaseTokenHash, generation = 1) {
  return { purchaseTokenHash, generation };
}

function googlePlayCounterPath(ownerId = OWNER_ID) {
  return `users/${ownerId}/subscriptionSync/googlePlay`;
}

function googlePlayTokenStatePath(purchaseTokenHash, ownerId = OWNER_ID) {
  return `${googlePlayCounterPath(ownerId)}/tokens/${purchaseTokenHash}`;
}

function userDocumentWrites(firestore, ownerId = OWNER_ID) {
  return firestore.writes.filter((write) => write.ref.path === `users/${ownerId}`);
}

function fakeStore(
  events,
  {
    persistenceError = null,
    persistenceResult = "stored",
    revocationResult = "cleared"
  } = {}
) {
  const attempt = googleAttempt(googlePlayPurchaseTokenHash(PURCHASE_TOKEN), 7);
  return {
    async beginGooglePlaySubscriptionSync(userId, purchaseTokenHash) {
      assert.equal(userId, OWNER_ID);
      assert.equal(purchaseTokenHash, attempt.purchaseTokenHash);
      events.push("begin");
      return attempt;
    },
    async syncSubscription(userId, subscription, metadata, receivedAttempt) {
      assert.equal(userId, OWNER_ID);
      assert.deepEqual(subscription, verifiedPurchase().subscription);
      assert.deepEqual(metadata, verifiedPurchase().metadata);
      assert.deepEqual(receivedAttempt, attempt);
      events.push("persist");
      if (persistenceError) throw persistenceError;
      return persistenceResult;
    },
    async clearGooglePlaySubscription(userId, receivedAttempt) {
      assert.deepEqual(receivedAttempt, attempt);
      events.push(`revoke:${userId}:${receivedAttempt.purchaseTokenHash}`);
      return revocationResult;
    }
  };
}

class FakePublisherClient {
  constructor(responses) {
    this.responses = [...responses];
    this.getCalls = [];
    this.acknowledgeCalls = [];
    this.acknowledgeError = null;
  }

  async getSubscription(packageName, purchaseToken) {
    this.getCalls.push({ packageName, purchaseToken });
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("No fake Google Play response configured.");
    return response;
  }

  async acknowledgeSubscription(packageName, productId, purchaseToken) {
    this.acknowledgeCalls.push({ packageName, productId, purchaseToken });
    if (this.acknowledgeError) throw this.acknowledgeError;
  }
}

class FakeFirestore {
  constructor({ queryDocuments = {}, documents = {} } = {}) {
    this.queryDocuments = queryDocuments;
    this.documents = documents;
    this.queries = [];
    this.writes = [];
  }

  collection(name) {
    assert.equal(name, "users");
    return {
      doc: (id) => fakeDocumentReference(`users/${id}`, id),
      where: (field, operator, values) => {
        assert.ok(["in", "array-contains-any"].includes(operator));
        const query = { kind: "query", field, operator, values };
        this.queries.push(query);
        return query;
      }
    };
  }

  async runTransaction(callback) {
    const transaction = {
      get: async (target) => {
        if (target.kind === "query") {
          return {
            docs: (this.queryDocuments[target.field] ?? []).map((id) => ({
              id,
              ref: fakeDocumentReference(`users/${id}`, id),
              data: () => this.documents[id]
            }))
          };
        }
        const data = this.documents[target.path] ?? this.documents[target.id];
        return {
          exists: data !== undefined,
          ref: target,
          data: () => data
        };
      },
      set: (ref, data, options) => {
        this.writes.push({ ref, data, options });
      }
    };
    return callback(transaction);
  }
}

function fakeDocumentReference(path, id) {
  return {
    kind: "document",
    id,
    path,
    collection: (name) => ({
      doc: (childId) => fakeDocumentReference(`${path}/${name}/${childId}`, childId)
    })
  };
}
