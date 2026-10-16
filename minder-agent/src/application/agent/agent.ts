import {
  streamAutonomousTurn,
  streamInteractiveTurn,
} from "@application/agent";
import type {
  ChatCompletionGateway,
  LlmConfig,
  ToolContext,
  ToolRegistryPort,
} from "@application/shared/ports/index.js";
import type { AgentEvent, AgentRun, RunOutcome } from "@domain/shared";
import {
  InMemorySessionStore,
  type InteractiveSession,
  type SessionStore,
} from "@application/session";
import { EmptyToolRegistry } from "@application/shared/ports/index.js";
import {
  resolveProfile,
  type ProfileServices,
  type ResolveProfileInput,
  type ResolvedAgentProfile,
} from "./configuration/profile.js";

export class MinderAgent {
  private readonly gateway: ChatCompletionGateway;
  private readonly sessionStore: SessionStore;
  private readonly registry: ToolRegistryPort;
  private readonly autonomousRegistry: ToolRegistryPort;
  private readonly toolContext: ToolContext;
  private readonly profileServices: ProfileServices;

  constructor(
    config: LlmConfig,
    gateway?: ChatCompletionGateway,
    options: MinderAgentOptions = {},
  ) {
    if (gateway === undefined) throw new Error("A model gateway is required.");
    this.gateway = gateway;
    this.config = config;
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore();
    this.registry = options.registry ?? new EmptyToolRegistry();
    this.autonomousRegistry =
      options.autonomousRegistry ?? new EmptyToolRegistry();
    this.profileServices = {
      ...(options.agentConfigurations === undefined
        ? {}
        : { agentConfigurations: options.agentConfigurations }),
      ...(options.skills === undefined ? {} : { skills: options.skills }),
      ...(options.mcpDiscovery === undefined
        ? {}
        : { mcpDiscovery: options.mcpDiscovery }),
      ...(options.instructionResolver === undefined
        ? {}
        : { instructionResolver: options.instructionResolver }),
      projectRoot:
        options.projectRoot ?? options.workspaceRoot ?? process.cwd(),
    };
    this.toolContext = {
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
      workingDirectory:
        options.workingDirectory ?? options.workspaceRoot ?? process.cwd(),
      signal: new AbortController().signal,
    };
  }

  /**
   * Compose a caller-scoped execution profile (agent configuration, context
   * instructions, allowed skills) without issuing a model request.
   */
  resolveProfile(input: ResolveProfileInput): Promise<ResolvedAgentProfile> {
    return resolveProfile(this.profileServices, input);
  }

  private readonly config: LlmConfig;

  run(prompt: string): AgentRun {
    return this.startRun((signal) =>
      streamAutonomousTurn({
        config: this.config,
        gateway: this.gateway,
        prompt,
        signal,
        registry: this.autonomousRegistry,
        context: this.toolContext,
      }),
    );
  }

  createInteractiveSession(): InteractiveSession {
    return this.sessionStore.create();
  }

  getInteractiveSession(id: string): InteractiveSession | undefined {
    return this.sessionStore.get(id);
  }

  runInSession(id: string, prompt: string): AgentRun {
    const session = this.sessionStore.get(id);
    if (!session)
      return failedRun("invalid_input", "Interactive session was not found.");
    return this.startRun((signal) =>
      streamInteractiveTurn({
        config: this.config,
        gateway: this.gateway,
        session,
        sessionStore: this.sessionStore,
        registry: this.registry,
        context: { ...this.toolContext, signal },
        prompt,
        signal,
      }),
    );
  }

  private startRun(
    createGenerator: (
      signal: AbortSignal,
    ) => AsyncGenerator<AgentEvent, RunOutcome, void>,
  ): AgentRun {
    const controller = new AbortController();
    const queue = new AsyncQueue<AgentEvent>();
    let forwardedDone = false;

    const result = (async (): Promise<RunOutcome> => {
      try {
        const generator = createGenerator(controller.signal);
        while (true) {
          const next = await generator.next();
          if (next.done) return next.value;
          if (next.value.type === "done") forwardedDone = true;
          queue.push(next.value);
        }
      } catch (error) {
        if (!forwardedDone) {
          forwardedDone = true;
          queue.push({ type: "done", data: { response_text: "" } });
        }
        return {
          status: "failed",
          text: "",
          error: {
            code: "transport",
            message:
              error instanceof Error ? error.message : "Autonomous run failed.",
          },
        };
      } finally {
        queue.close();
      }
    })();

    return {
      result,
      interrupt: () => controller.abort(),
      [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator](),
    };
  }
}

export interface MinderAgentOptions {
  workspaceRoot?: string;
  workingDirectory?: string;
  projectRoot?: string;
  sessionStore?: SessionStore;
  registry?: ToolRegistryPort;
  autonomousRegistry?: ToolRegistryPort;
  agentConfigurations?: ProfileServices["agentConfigurations"];
  skills?: ProfileServices["skills"];
  mcpDiscovery?: ProfileServices["mcpDiscovery"];
  instructionResolver?: ProfileServices["instructionResolver"];
}

function failedRun(code: "invalid_input", message: string): AgentRun {
  const queue = new AsyncQueue<AgentEvent>();
  queue.push({ type: "done", data: { response_text: "" } });
  queue.close();
  return {
    result: Promise.resolve({
      status: "failed",
      text: "",
      error: { code, message },
    }),
    interrupt: () => undefined,
    [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator](),
  };
}

class AsyncQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;
  private consumed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()!({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) return Promise.resolve({ value, done: false });
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.consumed) {
      throw new Error("AgentRun events may be consumed only once.");
    }
    this.consumed = true;
    return this;
  }
}
