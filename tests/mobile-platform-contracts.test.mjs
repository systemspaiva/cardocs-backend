import assert from "node:assert/strict";
import test from "node:test";

import { decodeStoredPushDeviceToken } from "../lib/infrastructure/firebasePushDeviceTokenStore.js";
import {
  pushDeviceTokenRegistrationSchema,
  syncUserProfileSchema
} from "../lib/interfaces/http/schemas.js";

const legalAcceptance = {
  termsVersion: "terms-2026-05-13",
  privacyVersion: "privacy-2026-05-13",
  acceptedAt: "2026-08-26T18:00:00.000Z"
};

test("legal acceptance accepts exactly the supported mobile sources", () => {
  for (const source of ["ios", "android"]) {
    const result = syncUserProfileSchema.parse({
      legalAcceptance: { ...legalAcceptance, source }
    });

    assert.equal(result.legalAcceptance?.source, source);
  }

  assert.equal(
    syncUserProfileSchema.safeParse({
      legalAcceptance: { ...legalAcceptance, source: "web" }
    }).success,
    false
  );
});

test("push registration accepts exactly the supported mobile platforms", () => {
  for (const platform of ["ios", "android"]) {
    const result = pushDeviceTokenRegistrationSchema.parse({
      token: "fcm-token-1234567890",
      platform
    });

    assert.equal(result.platform, platform);
  }

  assert.equal(
    pushDeviceTokenRegistrationSchema.safeParse({
      token: "fcm-token-1234567890",
      platform: "web"
    }).success,
    false
  );
});

test("stored push token decoder preserves both supported platforms", () => {
  for (const platform of ["ios", "android"]) {
    assert.deepEqual(
      decodeStoredPushDeviceToken("token-id", {
        token: "fcm-token-1234567890",
        platform
      }),
      {
        id: "token-id",
        token: "fcm-token-1234567890",
        platform
      }
    );
  }

  assert.equal(
    decodeStoredPushDeviceToken("token-id", {
      token: "fcm-token-1234567890",
      platform: "web"
    }),
    null
  );
});
