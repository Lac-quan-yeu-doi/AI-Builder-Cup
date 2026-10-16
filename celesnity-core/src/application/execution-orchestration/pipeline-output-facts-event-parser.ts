import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
  ExecutionTargetOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';
import { validateExecutionOutputFacts } from '@domain/execution-orchestration/models/execution-output-facts';

const EVENT_PREFIX = 'CELESNITY_EVENT ';
const FACT_EVENT = 'PIPELINE_OUTPUT_FACTS';
const MAX_EVENT_LINE_LENGTH = 64 * 1024;

/** Parses only bounded result-fact event lines from the Spark stream. */
export class PipelineOutputFactsEventParser {
  private readonly expectedBranches = new Map<string, ReadonlySet<string>>();
  private readonly received = new Map<string, ExecutionTargetOutputFacts>();
  private pendingLine = '';
  private discardUntilNewline = false;

  public constructor(
    private readonly executionId: string,
    private readonly plan: ExecutionOutputConditionPlan,
  ) {
    for (const target of plan.targets) {
      this.expectedBranches.set(
        target.targetNodeId,
        new Set(target.predicates.map((predicate) => predicate.branchId)),
      );
    }
  }

  public consume(chunk: string): void {
    for (const character of chunk) {
      if (character === '\n') {
        if (!this.discardUntilNewline) this.consumeLine(this.pendingLine.replace(/\r$/u, ''));
        this.pendingLine = '';
        this.discardUntilNewline = false;
        continue;
      }
      if (this.discardUntilNewline) continue;
      this.pendingLine += character;
      if (this.pendingLine.length > MAX_EVENT_LINE_LENGTH) {
        if (this.pendingLine.startsWith(EVENT_PREFIX)) {
          throw new Error('Result-fact event exceeded the supported size bound.');
        }
        this.pendingLine = '';
        this.discardUntilNewline = true;
      }
    }
  }

  public finish(): ExecutionOutputFacts {
    if (!this.discardUntilNewline && this.pendingLine !== '') {
      this.consumeLine(this.pendingLine.replace(/\r$/u, ''));
    }
    const targets: ExecutionTargetOutputFacts[] = [];
    for (const targetNodeId of this.expectedBranches.keys()) {
      const fact = this.received.get(targetNodeId);
      if (fact === undefined) {
        throw new Error('Spark completed without all requested target result facts.');
      }
      targets.push(fact);
    }
    return validateExecutionOutputFacts(this.plan, this.executionId, {
      executionId: this.executionId,
      targets,
    });
  }

  private consumeLine(line: string): void {
    if (!line.startsWith(EVENT_PREFIX)) return;
    const json = line.slice(EVENT_PREFIX.length);
    let payload: unknown;
    try {
      payload = JSON.parse(json) as unknown;
    } catch {
      throw new Error('Spark emitted a malformed structured result event.');
    }
    if (!isRecord(payload)) throw new Error('Spark emitted an invalid structured result event.');
    if (payload.event !== FACT_EVENT) return;
    const allowedKeys = new Set([
      'event',
      'pipelineId',
      'pipelineVersion',
      'executionId',
      'targetNodeId',
      'totalRows',
      'matchesByBranchId',
    ]);
    if (
      Object.keys(payload).some((key) => !allowedKeys.has(key)) ||
      typeof payload.pipelineId !== 'string' ||
      payload.pipelineId.trim() === '' ||
      !Number.isSafeInteger(payload.pipelineVersion) ||
      (payload.pipelineVersion as number) < 1 ||
      payload.executionId !== this.executionId ||
      typeof payload.targetNodeId !== 'string' ||
      !Number.isSafeInteger(payload.totalRows) ||
      (payload.totalRows as number) < 0 ||
      !isRecord(payload.matchesByBranchId)
    ) {
      throw new Error('Spark emitted result facts with an invalid or mismatched execution identity.');
    }
    const targetNodeId = payload.targetNodeId;
    const expected = this.expectedBranches.get(targetNodeId);
    if (expected === undefined) {
      throw new Error('Spark emitted result facts for an unrequested target.');
    }
    if (this.received.has(targetNodeId)) {
      throw new Error('Spark emitted duplicate result facts for a requested target.');
    }
    const branchIds = Object.keys(payload.matchesByBranchId).sort();
    const expectedBranchIds = [...expected].sort();
    if (
      branchIds.length !== expectedBranchIds.length ||
      expectedBranchIds.some((branchId, index) => branchId !== branchIds[index])
    ) {
      throw new Error('Spark result facts do not match the requested branches.');
    }
    const matchesByBranchId: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const branchId of expectedBranchIds) {
      const count = payload.matchesByBranchId[branchId];
      if (
        !Number.isSafeInteger(count) ||
        (count as number) < 0 ||
        (count as number) > (payload.totalRows as number)
      ) {
        throw new Error('Spark result facts contain an invalid matching row count.');
      }
      matchesByBranchId[branchId] = count as number;
    }
    this.received.set(targetNodeId, {
      targetNodeId,
      totalRows: payload.totalRows as number,
      matchesByBranchId,
    });
  }

}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
