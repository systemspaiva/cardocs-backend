import assert from "node:assert/strict";
import test from "node:test";

import { verifyAuthenticatedFirebaseIdToken } from "../lib/interfaces/http/routes.js";

test("Firebase ID token verification always requests the revocation check", async () => {
  const calls = [];
  const decodedToken = { uid: "firebase-user" };
  const verifier = {
    async verifyIdToken(idToken, checkRevoked) {
      calls.push({ idToken, checkRevoked });
      return decodedToken;
    }
  };

  const result = await verifyAuthenticatedFirebaseIdToken("header.payload.signature", verifier);

  assert.equal(result, decodedToken);
  assert.deepEqual(calls, [{ idToken: "header.payload.signature", checkRevoked: true }]);
});

test("Firebase authentication rejects malformed bearer tokens before calling Firebase", async () => {
  let called = false;
  const verifier = {
    async verifyIdToken() {
      called = true;
      throw new Error("unexpected verifier call");
    }
  };

  await assert.rejects(
    verifyAuthenticatedFirebaseIdToken("not-a-jwt", verifier),
    (error) => error.statusCode === 401 && error.code === "unauthorized"
  );
  assert.equal(called, false);
});

test("Firebase authentication maps revoked-token failures to an unauthorized response", async () => {
  const verifier = {
    async verifyIdToken(_idToken, checkRevoked) {
      assert.equal(checkRevoked, true);
      throw Object.assign(new Error("The Firebase ID token has been revoked."), {
        code: "auth/id-token-revoked"
      });
    }
  };

  await assert.rejects(
    verifyAuthenticatedFirebaseIdToken("header.payload.signature", verifier),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "unauthorized");
      assert.match(error.message, /revogado/);
      return true;
    }
  );
});

test("Firebase authentication preserves operational failures for a server error", async () => {
  const operationalFailure = Object.assign(new Error("Firebase Auth timed out"), {
    code: "auth/internal-error"
  });
  const verifier = {
    async verifyIdToken(_idToken, checkRevoked) {
      assert.equal(checkRevoked, true);
      throw operationalFailure;
    }
  };

  await assert.rejects(
    verifyAuthenticatedFirebaseIdToken("header.payload.signature", verifier),
    (error) => error === operationalFailure
  );
});
