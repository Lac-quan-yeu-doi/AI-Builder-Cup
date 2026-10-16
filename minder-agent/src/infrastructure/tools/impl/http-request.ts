import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface HttpFetchResponse {
  readonly status: number;
  readonly body: string;
}

export interface HttpRequestClient {
  readonly allowedHosts: readonly string[];
  fetch(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<HttpFetchResponse>;
}

const descriptor: ToolDescriptor = {
  name: "HttpRequest",
  description: "Perform an allowlisted outbound HTTP request.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string" },
      body: { type: "string" },
    },
    required: ["url"],
  },
  category: "web",
  readOnly: false,
  destructive: false,
  aliases: [],
};

/**
 * Executable HttpRequest tool. Requests are restricted to an allowlist of hosts
 * and never sent when the caller policy denies the tool. Non-allowlisted hosts
 * fail with a stable error before any network contact.
 */
export function createHttpRequestTool(
  client: HttpRequestClient,
  policy: ToolPolicy = allowAll,
) {
  const allowed = new Set(client.allowedHosts);
  return executableTool(descriptor, policy, async (args) => {
    const url = requiredStringArgument(args, "url");
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error("HttpRequest url is not a valid URL.");
    }
    if (!allowed.has(host))
      throw new Error(`HttpRequest host is not allowlisted: ${host}`);
    const response = await client.fetch(url, {
      method: typeof args.method === "string" ? args.method : "GET",
      ...(typeof args.body === "string" ? { body: args.body } : {}),
    });
    return {
      success: response.status >= 200 && response.status < 400,
      content: response.body,
      metadata: { status: response.status },
    };
  });
}
