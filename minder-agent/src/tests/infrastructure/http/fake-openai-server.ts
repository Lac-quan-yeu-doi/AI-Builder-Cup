import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export interface FakeOpenAiRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: Record<string, unknown>;
}

export interface FakeOpenAiResponse {
  writeHead(status: number, headers?: Record<string, string>): void;
  write(chunk: string): void;
  end(chunk?: string): void;
}

export type FakeOpenAiHandler = (
  response: FakeOpenAiResponse,
  request: FakeOpenAiRequest,
) => void | Promise<void>;

export interface FakeOpenAiServer {
  readonly url: string;
  readonly requests: FakeOpenAiRequest[];
  readonly fetch: typeof fetch;
  respond(handler: FakeOpenAiHandler): void;
  listen(): Promise<string>;
  close(): Promise<void>;
}

export async function createFakeOpenAiServer(): Promise<FakeOpenAiServer> {
  let handler: FakeOpenAiHandler = normalResponse;
  const requests: FakeOpenAiRequest[] = [];
  const url = "http://fake-openai.test";
  let networkServer: ReturnType<typeof createServer> | undefined;
  let networkUrl: string | undefined;

  return {
    url,
    requests,
    fetch: async (input, init) => {
      const request = await readRequest(input, init);
      requests.push(request);
      return new Promise<Response>((resolve, reject) => {
        let status = 200;
        const headers: Record<string, string> = {};
        let body = "";
        let ended = false;
        const finish = (error?: unknown): void => {
          if (ended) return;
          ended = true;
          init?.signal?.removeEventListener("abort", onAbort);
          if (error !== undefined) {
            reject(
              error instanceof Error
                ? error
                : new Error(
                    typeof error === "string" ? error : "Fake provider failed.",
                  ),
            );
            return;
          }
          resolve(new Response(body, { status, headers }));
        };
        const onAbort = (): void =>
          finish(new DOMException("The operation was aborted.", "AbortError"));
        init?.signal?.addEventListener("abort", onAbort, { once: true });
        const response: FakeOpenAiResponse = {
          writeHead(nextStatus, nextHeaders = {}) {
            status = nextStatus;
            Object.assign(headers, nextHeaders);
          },
          write(chunk) {
            body += chunk;
          },
          end(chunk = "") {
            body += chunk;
            finish();
          },
        };
        void Promise.resolve(handler(response, request)).catch(finish);
      });
    },
    respond(next) {
      handler = next;
    },
    async listen() {
      if (networkUrl !== undefined) return networkUrl;
      networkServer = createServer((request, response) => {
        void handleNetworkRequest(request, response);
      });
      await new Promise<void>((resolve, reject) => {
        const server = networkServer;
        if (server === undefined) return reject(new Error("server_missing"));
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      const address = networkServer.address();
      if (address === null || typeof address === "string")
        throw new Error("fake provider did not expose a TCP address");
      networkUrl = `http://127.0.0.1:${address.port}`;
      return networkUrl;
    },
    async close() {
      const server = networkServer;
      networkServer = undefined;
      networkUrl = undefined;
      if (server === undefined) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };

  async function handleNetworkRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await readNetworkBody(request);
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );
    const captured: FakeOpenAiRequest = {
      method: request.method ?? "GET",
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: Object.fromEntries(
        new Headers(request.headers as Record<string, string>).entries(),
      ),
      body: JSON.parse(body || "{}") as Record<string, unknown>,
    };
    requests.push(captured);
    let ended = false;
    const finish = (): void => {
      if (ended) return;
      ended = true;
      response.end();
    };
    try {
      await handler(
        {
          writeHead(status, headers = {}) {
            response.writeHead(status, headers);
          },
          write(chunk) {
            response.write(chunk);
          },
          end(chunk = "") {
            if (ended) return;
            ended = true;
            response.end(chunk);
          },
        },
        captured,
      );
      finish();
    } catch {
      if (!ended) response.destroy();
    }
  }
}

function readNetworkBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readRequest(
  input: string | URL | Request,
  init: RequestInit | undefined,
): Promise<FakeOpenAiRequest> {
  const requestUrl = new URL(
    input instanceof Request ? input.url : input.toString(),
  );
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  const rawBody = typeof init?.body === "string" ? init.body : "{}";
  return {
    method: init?.method ?? "GET",
    path: `${requestUrl.pathname}${requestUrl.search}`,
    headers,
    body: JSON.parse(rawBody) as Record<string, unknown>,
  };
}

function normalResponse(response: FakeOpenAiResponse): void {
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(
    'data: {"choices":[{"delta":{"reasoning_content":"inspect first"}}]}\n\n',
  );
  response.write(
    'data: {"choices":[{"delta":{"content":"final answer"}}]}\n\n',
  );
  response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
  response.write(
    'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
  );
  response.end("data: [DONE]\n\n");
}
