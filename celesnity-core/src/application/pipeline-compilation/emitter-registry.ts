import type { PipelineNodeEmitter } from '@application/pipeline-compilation/pipeline-ir';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';

export class PipelineEmitterRegistry {
  private readonly emitters: ReadonlyMap<string, PipelineNodeEmitter>;

  public constructor(emitters: readonly PipelineNodeEmitter[]) {
    const indexed = new Map<string, PipelineNodeEmitter>();
    for (const emitter of emitters) {
      const type = emitter.definitionType.trim().toUpperCase();
      if (indexed.has(type)) {
        throw new Error(`Duplicate pipeline emitter registration: ${type}`);
      }
      indexed.set(type, emitter);
    }
    this.emitters = indexed;
  }

  public require(type: string, nodeId: string): PipelineNodeEmitter {
    const emitter = this.emitters.get(type.trim().toUpperCase());
    if (emitter === undefined) {
      throw PipelineCompilationError.issue(
        'NODE_COMPILER_NOT_FOUND',
        `No PySpark compiler is registered for node type ${type}.`,
        { nodeId },
      );
    }
    return emitter;
  }
}
