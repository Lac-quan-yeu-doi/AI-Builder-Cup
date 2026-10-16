import { describe, expect, it, vi } from "vitest";
import {
  createCoreMcpTransportFactory,
  createCoreWorkloadIdentityFetch,
  isTrustedCoreMcpUrl,
} from "@infrastructure/mcp";

const environment = {
  NODE_ENV: "production",
  CELESNITY_CORE_URL: "http://core:3001",
  CELESNITY_CORE_AUDIENCE: "core-audience",
};

describe("Core MCP workload identity", () => {
  it.each([
    "https://third-party.example/api/v1/chart-mcp",
    "http://core:3001/untrusted",
    "http://core:3001/api/v1/chart-mcp/extra",
    "http://core:3001/api/v1/chart-mcp?redirect=evil",
  ])("never allowlists %s for workload credentials", (url) => {
    expect(
      isTrustedCoreMcpUrl(url, new URL(environment.CELESNITY_CORE_URL)),
    ).toBe(false);
  });

  it("allowlists only an exact configured Core MCP endpoint", () => {
    expect(
      isTrustedCoreMcpUrl(
        "http://core:3001/api/v1/chart-mcp",
        new URL(environment.CELESNITY_CORE_URL),
      ),
    ).toBe(true);
  });

  it("gets a credential per request and removes the static secret", async () => {
    let issued = 0;
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        const requestUrl = url instanceof Request ? url.url : url.toString();
        if (requestUrl.startsWith("http://metadata.google.internal/")) {
          expect(new URL(requestUrl).searchParams.get("audience")).toBe(
            "core-audience",
          );
          expect(new Headers(init?.headers).get("Metadata-Flavor")).toBe(
            "Google",
          );
          return new Response(`token-${++issued}`);
        }
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(`Bearer token-${issued}`);
        expect(headers.has("x-mcp-shared-secret")).toBe(false);
        expect(init?.redirect).toBe("error");
        return new Response("ok");
      });
    const authenticatedFetch = createCoreWorkloadIdentityFetch(
      "core-audience",
      request,
    );

    for (let attempt = 0; attempt < 2; attempt += 1)
      await authenticatedFetch("http://core:3001/api/v1/chart-mcp", {
        headers: { "x-mcp-shared-secret": "old-secret" },
      });

    expect(issued).toBe(2);
  });

  it("does not send a Core request when credential acquisition fails", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 503 }));
    const authenticatedFetch = createCoreWorkloadIdentityFetch(
      "core-audience",
      request,
    );

    await expect(
      authenticatedFetch("http://core:3001/api/v1/document-mcp"),
    ).rejects.toThrow("credential unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails startup when production workload identity is incomplete", () => {
    expect(() =>
      createCoreMcpTransportFactory({ NODE_ENV: "production" }),
    ).toThrow("requires Core URL and audience");
  });
});
