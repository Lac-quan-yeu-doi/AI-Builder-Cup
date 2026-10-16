import { z } from 'zod';

import type { ChartEncodingSuggestionRepository } from '@/src/application/repositories/chart-encoding-suggestion.repository.interface';
import { CHART_TYPES } from '@/src/entities/models/chart';
import type {
  ChartEncodingSuggestion,
  ChartEncodingSuggestionInput,
} from '@/src/entities/models/chart-encoding-suggestion';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

// The agent's response is untrusted free text parsed as JSON — validated
// strictly so a malformed or hallucinated shape throws here rather than
// silently patching a chart with garbage encodings.
const encodingSchema = z.object({
  field: z.string().min(1),
  type: z.enum(['quantitative', 'temporal', 'ordinal', 'nominal']).optional(),
  title: z.string().optional(),
});

const responseSchema = z.object({
  chart_type: z.enum(CHART_TYPES),
  encodings: z.object({
    x: encodingSchema,
    y: encodingSchema,
    color: encodingSchema.optional(),
  }),
});

const AGENT_NAME = 'chart-encoding-inference';
const SAMPLE_ROW_LIMIT = 5;

interface BlockingRunDto {
  readonly status: string;
  readonly response_text?: string | null;
  readonly error?: string;
}

/**
 * Talks to minder-agent's plain (non-room) `POST /runs` — a
 * stateless, tool-less agent run that returns its final answer text in one
 * response. Used for a single-shot classification call, not a conversation:
 * a fresh, random `session_key` per call keeps every inference isolated with
 * no carried-over context (see `chart-encoding-inference.yaml`).
 */
export class AgentApiChartEncodingSuggestionRepository implements ChartEncodingSuggestionRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async suggest(input: ChartEncodingSuggestionInput): Promise<ChartEncodingSuggestion> {
    let dto: BlockingRunDto;
    try {
      dto = await this.transport.request<BlockingRunDto>('/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Caller-Id': input.userId },
        body: JSON.stringify({
          session_key: `chart-encodings-${crypto.randomUUID()}`,
          agent: AGENT_NAME,
          input: buildPrompt(input),
          wait_ms: 60_000,
        }),
      });
    } catch (error) {
      throw translateCoreApiError(error);
    }

    if (
      dto.status !== 'completed' ||
      typeof dto.response_text !== 'string' ||
      dto.response_text.trim() === ''
    ) {
      throw new Error(`chart-encoding-inference run did not complete: ${dto.error ?? dto.status}`);
    }

    return parseSuggestion(dto.response_text);
  }
}

function buildPrompt(input: ChartEncodingSuggestionInput): string {
  const sample = input.sampleRows.slice(0, SAMPLE_ROW_LIMIT);
  return [
    `Chart title: ${input.title}`,
    `Current chart type: ${input.chartType}`,
    `Columns: ${input.columns.join(', ')}`,
    `Sample rows (JSON): ${JSON.stringify(sample)}`,
  ].join('\n');
}

/** Strips a ```json fence the model may add despite being told not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function parseSuggestion(output: string): ChartEncodingSuggestion {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(output));
  } catch (error) {
    throw new Error(`chart-encoding-inference returned non-JSON output: ${String(error)}`);
  }

  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`chart-encoding-inference returned an invalid shape: ${parsed.error.message}`);
  }

  return {
    chartType: parsed.data.chart_type,
    encodings: {
      x: parsed.data.encodings.x,
      y: parsed.data.encodings.y,
      ...(parsed.data.encodings.color ? { color: parsed.data.encodings.color } : {}),
    },
  };
}
