import type { JsonObject } from "@domain/shared";

export interface MessageBlockPublishInput {
  readonly roomId: string;
  readonly runId: string;
  readonly block: JsonObject;
}

export interface MessageBlockPublisher {
  publish(input: MessageBlockPublishInput): Promise<void>;
}

export interface HttpMessageBlockPublisherOptions {
  readonly coreUrl: string;
  readonly sharedSecret?: string;
  readonly audience?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/**
 * Publishes structured UI blocks produced by MCP tools into Core's durable,
 * room-scoped message-block projection. Workload identity is preferred when
 * configured; the local shared secret remains a development fallback because
 * Docker has no Google metadata server.
 */
export function createHttpMessageBlockPublisher(
  options: HttpMessageBlockPublisherOptions,
): MessageBlockPublisher {
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const coreUrl = options.coreUrl.replace(/\/+$/, "");
  const sharedSecret = options.sharedSecret?.trim();
  const audience = options.audience?.trim();

  return {
    async publish(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (audience) {
          const token = await googleIdentityToken(request, audience);
          if (token) headers.authorization = `Bearer ${token}`;
          else if (sharedSecret) headers["x-mcp-shared-secret"] = sharedSecret;
          else throw new Error("message_block_authentication_unavailable");
        } else if (sharedSecret) {
          headers["x-mcp-shared-secret"] = sharedSecret;
        } else {
          throw new Error("message_block_authentication_unavailable");
        }

        const blockType = input.block.type;
        const payload = input.block.payload;
        const fallbackText = input.block.fallback_text;
        if (
          typeof blockType !== "string" ||
          !isJsonObject(payload) ||
          typeof fallbackText !== "string"
        ) {
          throw new Error("message_block_metadata_invalid");
        }
        const version = input.block.version;
        const body = {
          block_type: blockType,
          ...(typeof version === "number" ? { version } : {}),
          payload,
          fallback_text: fallbackText,
          run_id: input.runId,
        };
        const response = await request(
          `${coreUrl}/api/v1/rooms/${encodeURIComponent(input.roomId)}/message-blocks`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(`message_block_publish_http_${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

async function googleIdentityToken(
  request: typeof fetch,
  audience: string,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  try {
    const url = new URL(METADATA_IDENTITY_URL);
    url.searchParams.set("audience", audience);
    url.searchParams.set("format", "full");
    const response = await request(url, {
      headers: { "metadata-flavor": "Google" },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const token = (await response.text()).trim();
    return token.length === 0 ? undefined : token;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
