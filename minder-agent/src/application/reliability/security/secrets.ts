import { createSecretRedactor } from "./redaction.js";
import type { SecretRedactor } from "../evidence/contracts.js";

export interface TenantSecretStore {
  get(owner: string, secretRef: string): Promise<string | undefined>;
}

export interface TenantSecretResolver {
  redactor(input: {
    readonly owner: string;
    readonly secretRefs: readonly string[];
  }): Promise<SecretRedactor>;
  resolve(input: {
    readonly owner: string;
    readonly secretRef: string;
  }): Promise<string | undefined>;
}

export function createTenantSecretResolver(input: {
  readonly store: TenantSecretStore;
}): TenantSecretResolver {
  return {
    async resolve({ owner, secretRef }) {
      if (!owner.trim() || !validSecretRef(secretRef)) return undefined;
      return input.store.get(owner, secretRef);
    },
    async redactor({ owner, secretRefs }) {
      const secrets = await Promise.all(
        [...new Set(secretRefs)].map(async (secretRef) => {
          if (!validSecretRef(secretRef)) return undefined;
          return input.store.get(owner, secretRef);
        }),
      );
      return createSecretRedactor(
        secrets.filter((secret): secret is string => secret !== undefined),
      );
    },
  };
}

export function createMemoryTenantSecretStore(
  values: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): TenantSecretStore {
  const entries = new Map(
    Object.entries(values).map(([owner, secrets]) => [
      owner,
      new Map(Object.entries(secrets)),
    ]),
  );
  return {
    get(owner, secretRef) {
      return Promise.resolve(entries.get(owner)?.get(secretRef));
    },
  };
}

function validSecretRef(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/u.test(value);
}
