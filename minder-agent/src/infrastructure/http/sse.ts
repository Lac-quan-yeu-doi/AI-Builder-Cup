import type { ReadableStream } from "node:stream/web";

export async function* parseSse(
  body: ReadableStream<unknown>,
): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";

  const decode = (chunk: unknown, stream: boolean): void => {
    if (chunk !== undefined && !(chunk instanceof Uint8Array))
      throw new Error("Malformed SSE frame: response body is not bytes.");
    try {
      buffer += decoder.decode(chunk, { stream });
    } catch {
      throw new Error("Malformed SSE frame: invalid UTF-8.");
    }
  };

  const frames = async function* (): AsyncGenerator<string, void, void> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decode(value, true);

      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const record = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = dataPayload(record);
        if (data) yield data;
        boundary = buffer.indexOf("\n\n");
      }
    }

    decode(undefined, false);
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim()) {
      throw new Error("Malformed SSE frame: unterminated event.");
    }
  };

  yield* frames();
}

function dataPayload(record: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of record.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
    dataLines.push(payload);
  }
  const data = dataLines.join("\n");
  return data.length > 0 ? data : undefined;
}
