import { agentConfigurationHash } from "@domain/index.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  AgentConfigurationRecord,
  AgentConfigurationStore,
} from "@application/agent/configuration/configuration-service.js";
import type { PrismaService } from "../prisma.service.js";
import {
  agentFromRow,
  agentRecordFromRevision,
  jsonInput,
} from "../mappers/repositories.js";

export class PrismaAgentConfigurationStore implements AgentConfigurationStore {
  constructor(private readonly prisma: PrismaService) {}

  async archive(
    owner: string,
    id: string,
  ): Promise<AgentConfigurationRecord | undefined> {
    const current = await this.get(owner, id);
    if (!current) return undefined;
    const agent = { ...current.agent, archivedAt: new Date().toISOString() };
    const record = {
      agent,
      hash: agentConfigurationHash(agent, sha256),
      version: current.version + 1,
    };
    await this.save(owner, record);
    return record;
  }

  async get(
    owner: string,
    id: string,
  ): Promise<AgentConfigurationRecord | undefined> {
    const agent = await this.prisma.agent.findFirst({ where: { owner, id } });
    if (!agent) return undefined;
    const revision = await this.prisma.agentRevision.findFirst({
      where: { owner, agentId: id },
      orderBy: { version: "desc" },
    });
    return revision
      ? agentRecordFromRevision(revision)
      : { agent: agentFromRow(agent), hash: agent.configHash, version: 1 };
  }

  async history(
    owner: string,
    id: string,
  ): Promise<readonly AgentConfigurationRecord[]> {
    const revisions = await this.prisma.agentRevision.findMany({
      where: { owner, agentId: id },
      orderBy: { version: "asc" },
    });
    return revisions.map(agentRecordFromRevision);
  }

  async list(owner: string): Promise<readonly AgentConfigurationRecord[]> {
    const agents = await this.prisma.agent.findMany({
      where: { owner },
      orderBy: { name: "asc" },
    });
    if (agents.length === 0) return [];
    const revisions = await this.prisma.agentRevision.findMany({
      where: { owner, agentId: { in: agents.map((agent) => agent.id) } },
      orderBy: [{ agentId: "asc" }, { version: "desc" }],
    });
    const latestByAgent = new Map<string, (typeof revisions)[number]>();
    for (const revision of revisions)
      if (!latestByAgent.has(revision.agentId))
        latestByAgent.set(revision.agentId, revision);
    return agents.map((agent) => {
      const revision = latestByAgent.get(agent.id);
      return revision
        ? agentRecordFromRevision(revision)
        : { agent: agentFromRow(agent), hash: agent.configHash, version: 1 };
    });
  }

  async create(
    owner: string,
    record: AgentConfigurationRecord,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.agent.create({ data: agentData(owner, record) });
        await tx.agentRevision.create({
          data: {
            owner,
            agentId: record.agent.id,
            version: record.version,
            snapshot: jsonInput(record.agent),
            configHash: record.hash,
          },
        });
      });
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      )
        return false;
      throw error;
    }
  }

  async save(owner: string, record: AgentConfigurationRecord): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.agent.upsert({
        where: { owner_id: { owner, id: record.agent.id } },
        create: agentData(owner, record),
        update: agentData(owner, record),
      });
      await tx.agentRevision.create({
        data: {
          owner,
          agentId: record.agent.id,
          version: record.version,
          snapshot: jsonInput(record.agent),
          configHash: record.hash,
        },
      });
    });
  }
}

function agentData(owner: string, record: AgentConfigurationRecord) {
  return {
    owner,
    id: record.agent.id,
    name: record.agent.name,
    displayName: record.agent.displayName ?? null,
    systemPrompt: record.agent.systemPrompt ?? null,
    model: record.agent.model ?? null,
    toolAllowlist: jsonInput(record.agent.toolAllowlist),
    skills: jsonInput(record.agent.skills),
    maxSteps: record.agent.maxSteps ?? null,
    executionStrategy: record.agent.executionStrategy,
    configHash: record.hash,
    archivedAt:
      record.agent.archivedAt === undefined
        ? null
        : new Date(record.agent.archivedAt),
  };
}
