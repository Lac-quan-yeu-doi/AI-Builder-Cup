import { Injectable } from '@nestjs/common';

import { ScriptAuthoringUseCases } from '@application/script-authoring/script-authoring.use-cases';
import type {
  IPublishedScriptProvider,
  PublishedScript,
} from '@application/script-authoring/interfaces/i-published-script-provider';

/**
 * Exposes Script Authoring to other contexts through
 * {@link IPublishedScriptProvider}.
 *
 * The port belongs to the consumers (execution orchestration and the worker),
 * not to Script Authoring, so having `ScriptAuthoringUseCases` implement it
 * directly made a use-case class answer to a foreign contract. This adapter
 * absorbs that coupling: the use case keeps `resolvePublishedVersion` as an
 * ordinary public method, and only this one class knows it also satisfies
 * somebody else's interface.
 *
 * It deliberately holds no logic. If a translation between the two shapes ever
 * becomes necessary, this is where it goes.
 */
@Injectable()
export class ScriptAuthoringPublishedScriptAdapter implements IPublishedScriptProvider {
  public constructor(private readonly useCases: ScriptAuthoringUseCases) {}

  public resolvePublishedVersion(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScript> {
    return this.useCases.resolvePublishedVersion(scriptId, versionNumber);
  }
}
