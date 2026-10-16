import {
  agentConfigurationHash,
  validateAgentConfiguration,
  type AgentConfigurationInput,
  type AgentDefinition,
} from "@domain/index.js";
import type { Sha256 } from "@application/shared/ports/index.js";

export interface AgentConfigurationRecord {
  readonly agent: AgentDefinition;
  readonly version: number;
  readonly hash: string;
}

export interface AgentConfigurationStore {
  archive(
    owner: string,
    id: string,
  ): Promise<AgentConfigurationRecord | undefined>;
  create(owner: string, record: AgentConfigurationRecord): Promise<boolean>;
  get(owner: string, id: string): Promise<AgentConfigurationRecord | undefined>;
  history(
    owner: string,
    id: string,
  ): Promise<readonly AgentConfigurationRecord[]>;
  list(owner: string): Promise<readonly AgentConfigurationRecord[]>;
  save(owner: string, record: AgentConfigurationRecord): Promise<void>;
}

export function createAgentConfigurationService(input: {
  readonly owner: string;
  readonly store: AgentConfigurationStore;
  readonly sha256: Sha256;
}) {
  const build = (
    value: AgentConfigurationInput,
    version: number,
  ): AgentConfigurationRecord => {
    const agent = validateAgentConfiguration(value);
    return {
      agent,
      hash: agentConfigurationHash(agent, input.sha256),
      version,
    };
  };
  return {
    async create(
      value: AgentConfigurationInput,
    ): Promise<AgentConfigurationRecord> {
      const record = build(value, 1);
      if (!(await input.store.create(input.owner, record)))
        throw new Error("agent_name_conflict");
      return record;
    },
    async get(id: string): Promise<AgentConfigurationRecord | undefined> {
      return input.store.get(input.owner, id);
    },
    async list(): Promise<readonly AgentConfigurationRecord[]> {
      return (await input.store.list(input.owner)).filter(
        (record) => record.agent.archivedAt === undefined,
      );
    },
    async update(
      id: string,
      patch: Partial<AgentConfigurationInput>,
    ): Promise<AgentConfigurationRecord> {
      const current = await input.store.get(input.owner, id);
      if (!current) throw new Error("agent_not_found");
      const next = build(
        {
          ...current.agent,
          ...patch,
          id: current.agent.id,
          skills: patch.skills ?? current.agent.skills,
          toolAllowlist: patch.toolAllowlist ?? current.agent.toolAllowlist,
        },
        current.version + 1,
      );
      if (next.hash === current.hash) return current;
      await input.store.save(input.owner, next);
      return next;
    },
    async archive(id: string): Promise<AgentConfigurationRecord> {
      const record = await input.store.archive(input.owner, id);
      if (!record) throw new Error("agent_not_found");
      return record;
    },
    async history(id: string): Promise<readonly AgentConfigurationRecord[]> {
      if (!(await input.store.get(input.owner, id)))
        throw new Error("agent_not_found");
      return input.store.history(input.owner, id);
    },
    async diff(
      id: string,
      from: number,
      to: number,
    ): Promise<
      readonly {
        readonly path: string;
        readonly from: unknown;
        readonly to: unknown;
      }[]
    > {
      const history = await input.store.history(input.owner, id);
      const left = history.find((record) => record.version === from);
      const right = history.find((record) => record.version === to);
      if (!left || !right) throw new Error("agent_revision_not_found");
      return Object.keys({ ...left.agent, ...right.agent })
        .sort()
        .flatMap((path) => {
          const before = (left.agent as unknown as Record<string, unknown>)[
            path
          ];
          const after = (right.agent as unknown as Record<string, unknown>)[
            path
          ];
          return JSON.stringify(before) === JSON.stringify(after)
            ? []
            : [{ path, from: before, to: after }];
        });
    },
    async rollback(
      id: string,
      version: number,
    ): Promise<AgentConfigurationRecord> {
      const history = await input.store.history(input.owner, id);
      const target = history.find((record) => record.version === version);
      const current = await input.store.get(input.owner, id);
      if (!target || !current) throw new Error("agent_revision_not_found");
      const { archivedAt, ...agent } = target.agent;
      void archivedAt;
      const record = {
        agent,
        hash: agentConfigurationHash(agent, input.sha256),
        version: current.version + 1,
      };
      await input.store.save(input.owner, record);
      return record;
    },
  };
}

export type AgentConfigurationService = ReturnType<
  typeof createAgentConfigurationService
>;
