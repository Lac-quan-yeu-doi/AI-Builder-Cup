import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { loadMinderAuthConfig } from "@infrastructure/configuration/index.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const privateKeyPem = privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();

describe("loadMinderAuthConfig", () => {
  it("loads only a Core issuer, the fixed Minder audience, and public verification keys", () => {
    expect(loadMinderAuthConfig(validEnvironment())).toEqual({
      issuer: "celesnity-core",
      audience: "minder-agent",
      publicKeys: { "core-test-2026": publicKeyPem },
      replayCacheCapacity: 1_024,
    });
  });

  it.each([
    ["malformed key JSON", { MINDER_ASSERTION_PUBLIC_KEYS_JSON: "{" }],
    [
      "private key material",
      {
        MINDER_ASSERTION_PUBLIC_KEYS_JSON: JSON.stringify({
          "core-test-2026": privateKeyPem,
        }),
      },
    ],
    [
      "under-sized replay cache",
      { MINDER_ASSERTION_REPLAY_CACHE_CAPACITY: "1023" },
    ],
    ["wrong issuer", { MINDER_ASSERTION_ISSUER: "another-service" }],
    ["wrong audience", { MINDER_ASSERTION_AUDIENCE: "another-service" }],
  ])("rejects %s before the HTTP host can bind", (_label, override) => {
    expect(() =>
      loadMinderAuthConfig({ ...validEnvironment(), ...override }),
    ).toThrow();
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    MINDER_AUTH_MODE: "core-assertion",
    MINDER_ASSERTION_ISSUER: "celesnity-core",
    MINDER_ASSERTION_AUDIENCE: "minder-agent",
    MINDER_ASSERTION_PUBLIC_KEYS_JSON: JSON.stringify({
      "core-test-2026": publicKeyPem,
    }),
    MINDER_ASSERTION_REPLAY_CACHE_CAPACITY: "1024",
  };
}
