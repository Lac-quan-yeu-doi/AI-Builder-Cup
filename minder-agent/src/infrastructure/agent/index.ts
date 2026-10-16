import { MinderAgent, type MinderAgentOptions } from "@application/agent";
import type {
  ChatCompletionGateway,
  LlmConfig,
} from "@application/shared/ports";
import { OpenAiCompatibleGateway } from "@infrastructure/http";
import {
  createAutonomousRegistry,
  createInteractiveRegistry,
} from "@infrastructure/tools/core";
import { createInstructionResolver } from "@infrastructure/context";

export { createManifestLoader } from "./manifest-loader.js";
export { createMemoryAgentConfigurationStore } from "./memory-configuration-store.js";
export { createLangChainAgentLoop } from "./langchain/loop.js";
export {
  createLangChainChatModel,
  createLangChainModelPort,
} from "./langchain/model.js";
export { toolPortsToLangChainTools } from "./langchain/tools.js";

export function createMinderAgent(
  config: LlmConfig,
  gateway?: ChatCompletionGateway,
  options: MinderAgentOptions = {},
): MinderAgent {
  return new MinderAgent(
    config,
    gateway ?? new OpenAiCompatibleGateway(config),
    {
      ...options,
      registry: options.registry ?? createInteractiveRegistry(),
      autonomousRegistry:
        options.autonomousRegistry ?? createAutonomousRegistry(),
      instructionResolver:
        options.instructionResolver ?? createInstructionResolver(),
    },
  );
}
