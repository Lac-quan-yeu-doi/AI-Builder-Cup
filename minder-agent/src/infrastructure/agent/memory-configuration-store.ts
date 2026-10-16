import { agentConfigurationHash } from "@domain/index.js";
import type { Sha256 } from "@application/shared/ports/index.js";
import type {
  AgentConfigurationRecord,
  AgentConfigurationStore,
} from "@application/agent/configuration/configuration-service.js";

export function createMemoryAgentConfigurationStore(
  sha256: Sha256,
): AgentConfigurationStore {
  const records = new Map<string, AgentConfigurationRecord>();
  const revisions = new Map<string, AgentConfigurationRecord[]>();
  const key = (owner: string, id: string): string => `${owner}\u0000${id}`;
  return {
    create(owner, record) {
      const recordKey = key(owner, record.agent.id);
      if (
        records.has(recordKey) ||
        [...records.entries()].some(
          ([existingKey, existing]) =>
            existingKey.startsWith(`${owner}\u0000`) &&
            existing.agent.name === record.agent.name,
        )
      )
        return Promise.resolve(false);
      records.set(recordKey, record);
      revisions.set(recordKey, [record]);
      return Promise.resolve(true);
    },
    async archive(owner, id) {
      await Promise.resolve();
      const current = records.get(key(owner, id));
      if (!current) return undefined;
      const agent = { ...current.agent, archivedAt: new Date().toISOString() };
      const record = {
        agent,
        hash: agentConfigurationHash(agent, sha256),
        version: current.version + 1,
      };
      records.set(key(owner, id), record);
      revisions.set(key(owner, id), [
        ...(revisions.get(key(owner, id)) ?? []),
        record,
      ]);
      return record;
    },
    async get(owner, id) {
      await Promise.resolve();
      return records.get(key(owner, id));
    },
    async history(owner, id) {
      await Promise.resolve();
      return revisions.get(key(owner, id)) ?? [];
    },
    async list(owner) {
      await Promise.resolve();
      return [...records.entries()]
        .filter(([recordKey]) => recordKey.startsWith(`${owner}\u0000`))
        .map(([, record]) => record);
    },
    async save(owner, record) {
      await Promise.resolve();
      records.set(key(owner, record.agent.id), record);
      const recordKey = key(owner, record.agent.id);
      const prior = revisions.get(recordKey) ?? [];
      if (prior.at(-1)?.version !== record.version)
        revisions.set(recordKey, [...prior, record]);
    },
  };
}
