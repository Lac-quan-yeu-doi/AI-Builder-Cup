import { ReadableStream } from "node:stream/web";
import { describe, expect, it } from "vitest";
import { parseSse } from "@infrastructure/http/sse.js";

const encoder = new TextEncoder();

describe("parseSse", () => {
  it("preserves UTF-8 and event order across arbitrary chunk boundaries", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"n":"r'));
        controller.enqueue(encoder.encode('éason"}\n\n:data comment\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    await expect(Array.fromAsync(parseSse(body))).resolves.toEqual([
      '{"n":"réason"}',
      "[DONE]",
    ]);
  });
});
