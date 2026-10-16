import { createPublicKey } from "node:crypto";

const ISSUER = "celesnity-core";
const AUDIENCE = "minder-agent";
const MIN_REPLAY_CACHE_CAPACITY = 1_024;
const MAX_REPLAY_CACHE_CAPACITY = 1_000_000;

export interface MinderAuthConfig {
  readonly issuer: typeof ISSUER;
  readonly audience: typeof AUDIENCE;
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly replayCacheCapacity: number;
}

export class MinderAuthConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MinderAuthConfigError";
  }
}

/**
 * Loads the resource-server half of the Core/Minder trust boundary. The
 * configuration contains public verification material only; accepting a
 * private key here would make a compromised Minder capable of minting users.
 */
export function loadMinderAuthConfig(env: NodeJS.ProcessEnv): MinderAuthConfig {
  if (env.MINDER_AUTH_MODE !== "core-assertion") {
    throw new MinderAuthConfigError("MINDER_AUTH_MODE must be core-assertion.");
  }
  if (env.MINDER_ASSERTION_ISSUER !== ISSUER) {
    throw new MinderAuthConfigError(
      `MINDER_ASSERTION_ISSUER must be ${ISSUER}.`,
    );
  }
  if (env.MINDER_ASSERTION_AUDIENCE !== AUDIENCE) {
    throw new MinderAuthConfigError(
      `MINDER_ASSERTION_AUDIENCE must be ${AUDIENCE}.`,
    );
  }
  const publicKeys = parsePublicKeys(env.MINDER_ASSERTION_PUBLIC_KEYS_JSON);
  const replayCacheCapacity = parseCapacity(
    env.MINDER_ASSERTION_REPLAY_CACHE_CAPACITY,
  );
  return Object.freeze({
    issuer: ISSUER,
    audience: AUDIENCE,
    publicKeys,
    replayCacheCapacity,
  });
}

function parsePublicKeys(
  raw: string | undefined,
): Readonly<Record<string, string>> {
  if (raw?.trim() === "")
    throw new MinderAuthConfigError(
      "MINDER_ASSERTION_PUBLIC_KEYS_JSON is required.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    throw new MinderAuthConfigError(
      "MINDER_ASSERTION_PUBLIC_KEYS_JSON must be valid JSON.",
    );
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new MinderAuthConfigError(
      "MINDER_ASSERTION_PUBLIC_KEYS_JSON must be a non-empty object.",
    );
  }
  const keys: Record<string, string> = {};
  for (const [kid, value] of Object.entries(parsed)) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/u.test(kid) ||
      typeof value !== "string" ||
      value.trim() === ""
    ) {
      throw new MinderAuthConfigError(
        "MINDER_ASSERTION_PUBLIC_KEYS_JSON contains an invalid key.",
      );
    }
    if (/BEGIN (?:RSA |EC |ED25519 )?PRIVATE KEY/u.test(value)) {
      throw new MinderAuthConfigError(
        "MINDER_ASSERTION_PUBLIC_KEYS_JSON must not contain private key material.",
      );
    }
    try {
      if (createPublicKey(value).asymmetricKeyType !== "ed25519")
        throw new Error();
    } catch {
      throw new MinderAuthConfigError(
        "MINDER_ASSERTION_PUBLIC_KEYS_JSON keys must be Ed25519 public PEM values.",
      );
    }
    keys[kid] = value;
  }
  if (Object.keys(keys).length === 0) {
    throw new MinderAuthConfigError(
      "MINDER_ASSERTION_PUBLIC_KEYS_JSON must contain at least one key.",
    );
  }
  return Object.freeze(keys);
}

function parseCapacity(raw: string | undefined): number {
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < MIN_REPLAY_CACHE_CAPACITY ||
    value > MAX_REPLAY_CACHE_CAPACITY
  ) {
    throw new MinderAuthConfigError(
      `MINDER_ASSERTION_REPLAY_CACHE_CAPACITY must be an integer from ${MIN_REPLAY_CACHE_CAPACITY} through ${MAX_REPLAY_CACHE_CAPACITY}.`,
    );
  }
  return value;
}
