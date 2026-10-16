import type { ChatCompletionGateway } from "@application/shared/ports/index.js";
import type { JsonObject } from "@domain/shared";
import type { DebugLog } from "./debug-log.js";
import { runtimeErrorFields, writeRuntimeLog } from "./runtime-log.js";

/** Observe each model stream without recording messages or tool payloads. */
export function observeGateway(
  gateway: ChatCompletionGateway,
  log: DebugLog | undefined,
  context: JsonObject,
  secrets: readonly string[],
): ChatCompletionGateway {
  let requestNumber = 0;
  return {
    async *stream(request, signal) {
      const started = performance.now();
      const fields = {
        ...context,
        providerRequestNumber: ++requestNumber,
        model: request.model,
        messageCount: request.messages.length,
        toolCount: request.tools?.length ?? 0,
      };
      writeRuntimeLog(log, "agent_provider_request_started", fields);
      let chunks = 0;
      let firstChunkMs: number | undefined;
      let completed = false;
      let failed = false;
      try {
        for await (const chunk of gateway.stream(request, signal)) {
          firstChunkMs ??= Math.round(performance.now() - started);
          chunks += 1;
          yield chunk;
        }
        completed = true;
      } catch (error) {
        failed = true;
        writeRuntimeLog(
          log,
          "agent_provider_request_failed",
          {
            ...fields,
            ...runtimeErrorFields(error),
            durationMs: Math.round(performance.now() - started),
            chunks,
            aborted: signal.aborted,
          },
          signal.aborted ? "info" : "error",
          secrets,
        );
        throw error;
      } finally {
        if (!failed)
          writeRuntimeLog(log, "agent_provider_request_completed", {
            ...fields,
            durationMs: Math.round(performance.now() - started),
            chunks,
            ...(firstChunkMs === undefined ? {} : { firstChunkMs }),
            closeReason: completed ? "completed" : "consumer_closed",
            aborted: signal.aborted,
          });
      }
    },
  };
}
