import type { Prisma } from "@prisma/client";
import {
  agentId,
  skillName,
  type AgentDefinition,
  type SkillDefinition,
} from "@domain/index.js";
import type { AgentConfigurationRecord } from "@application/agent/configuration/configuration-service.js";
import type {
  ApprovalRecord,
  ApprovalStatus,
} from "@application/runtime/governance/approvals.js";

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function agentFromRow(row: {
  id: string;
  name: string;
  displayName: string | null;
  systemPrompt: string | null;
  model: string | null;
  toolAllowlist: Prisma.JsonValue;
  skills: Prisma.JsonValue;
  maxSteps: number | null;
  executionStrategy: string;
  archivedAt: Date | null;
}): AgentDefinition {
  return {
    id: agentId(row.id),
    name: row.name,
    ...(row.displayName === null ? {} : { displayName: row.displayName }),
    ...(row.systemPrompt === null ? {} : { systemPrompt: row.systemPrompt }),
    ...(row.model === null ? {} : { model: row.model }),
    toolAllowlist: structuredClone(row.toolAllowlist as string[]),
    skills: (row.skills as string[]).map(skillName),
    ...(row.maxSteps === null ? {} : { maxSteps: row.maxSteps }),
    executionStrategy:
      row.executionStrategy as AgentDefinition["executionStrategy"],
    ...(row.archivedAt === null
      ? {}
      : { archivedAt: row.archivedAt.toISOString() }),
  };
}

export function agentFromSnapshot(snapshot: Prisma.JsonValue): AgentDefinition {
  const value = snapshot as Record<string, unknown>;
  const displayName = optionalString(value.displayName);
  const systemPrompt = optionalString(value.systemPrompt);
  const model = optionalString(value.model);
  const archivedAt = optionalString(value.archivedAt);
  return {
    id: agentId(String(value.id)),
    name: String(value.name),
    ...(displayName === undefined ? {} : { displayName }),
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(model === undefined ? {} : { model }),
    toolAllowlist: structuredClone(value.toolAllowlist as string[]),
    skills: (value.skills as string[]).map(skillName),
    ...(value.maxSteps == null ? {} : { maxSteps: Number(value.maxSteps) }),
    executionStrategy: String(
      value.executionStrategy,
    ) as AgentDefinition["executionStrategy"],
    ...(archivedAt === undefined ? {} : { archivedAt }),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function agentRecordFromRevision(row: {
  snapshot: Prisma.JsonValue;
  configHash: string;
  version: number;
}): AgentConfigurationRecord {
  return {
    agent: agentFromSnapshot(row.snapshot),
    hash: row.configHash,
    version: row.version,
  };
}

export function approvalFromRow(row: {
  id: string;
  owner: string;
  runId: string;
  toolCallId: string;
  action: string;
  argumentsHash: string;
  preview: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  decidedAt: Date | null;
}): ApprovalRecord {
  return {
    id: row.id,
    owner: row.owner,
    runId: row.runId,
    toolCallId: row.toolCallId,
    action: row.action,
    argumentsHash: row.argumentsHash,
    preview: row.preview,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.decidedAt === null
      ? {}
      : { decidedAt: row.decidedAt.toISOString() }),
  };
}

export function skillFromRow(row: {
  name: string;
  description: string | null;
  namespace: string;
  body: string;
  hash: string;
  source: string;
  readOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SkillDefinition {
  return {
    name: skillName(row.name),
    ...(row.description === null ? {} : { description: row.description }),
    namespace: row.namespace,
    body: row.body,
    hash: row.hash,
    source: row.source as SkillDefinition["source"],
    readOnly: row.readOnly,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
