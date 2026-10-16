export interface MonitoringSseFrame {
  readonly id?: string;
  readonly eventType?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Reads the long-lived anomaly room stream without stopping at one run.
 * Room lifecycle events are journaled; text deltas are live-only.
 */
export async function parseMonitoringSseStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onFrame: (frame: MonitoringSseFrame) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const frame = parseFrame(block);
        if (frame) onFrame(frame);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(block: string): MonitoringSseFrame | null {
  if (!block.trim()) return null;

  let id: string | undefined;
  let eventType: string | undefined;
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    } else if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5);
    }
  }

  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return { id, eventType, payload: parsed as Readonly<Record<string, unknown>> };
  } catch {
    return null;
  }
}
