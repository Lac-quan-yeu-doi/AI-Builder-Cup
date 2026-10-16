import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { CloudFileError } from '@application/cloud-file/errors/cloud-file.error';
import type { CloudFileUseCases } from '@application/cloud-file/cloud-file.use-cases';
import type { CloudFileKind } from '@application/cloud-file/interfaces/i-cloud-file-source';
import { OAuthConnectionError } from '@application/oauth-connection/errors/oauth-connection.error';
import type { NewSheetContent } from '@application/spreadsheet/interfaces/i-spreadsheet-writer';
import type { CellValue } from '@application/spreadsheet/interfaces/spreadsheet.models';
import type { SpreadsheetUseCases } from '@application/spreadsheet/spreadsheet.use-cases';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError, toolResult } from '@presentation/mcp/mcp-tool-server';

export interface CloudFileMcpToolDependencies {
  readonly files: CloudFileUseCases;
  readonly spreadsheets: SpreadsheetUseCases;
  readonly providers: readonly string[];
  readonly identityId: () => string;
}

const KINDS: readonly CloudFileKind[] = ['spreadsheet', 'document', 'presentation', 'pdf', 'folder', 'other'];

export function buildCloudFileMcpTools(deps: CloudFileMcpToolDependencies): readonly McpToolHandler[] {
  const providerProperty = {
    type: 'string',
    enum: deps.providers,
    default: deps.providers[0],
    description: 'Connected storage to use. Defaults to the first connected provider.',
  };
  const provider = (args: Record<string, unknown>): string =>
    optionalString(args, 'provider') ?? deps.providers[0] ?? '';

  return [
    {
      tool: {
        name: 'search_files',
        description:
          "Search the user's connected cloud storage by file name. Returns file ids, names, kinds, modified times and links, newest first. Use this to resolve a file the user names before reading it.",
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            provider: providerProperty,
            query: { type: 'string', description: 'Text contained in the file name.' },
            kind: { type: 'string', enum: KINDS },
            folder_id: { type: 'string', description: 'Only files directly inside this folder.' },
            modified_after: { type: 'string', format: 'date-time' },
            page_size: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            page_token: { type: 'string' },
          },
        }),
      },
      call: (args) =>
        run(async () => {
          const modifiedAfter = optionalString(args, 'modified_after');
          return deps.files.search(deps.identityId(), provider(args), {
            text: optionalString(args, 'query'),
            kind: optionalString(args, 'kind') as CloudFileKind | undefined,
            parentId: optionalString(args, 'folder_id'),
            modifiedAfter: modifiedAfter === undefined ? undefined : new Date(modifiedAfter),
            pageSize: optionalInteger(args, 'page_size') ?? 20,
            pageToken: optionalString(args, 'page_token'),
          });
        }),
    },
    {
      tool: {
        name: 'get_file',
        description:
          'Get one file’s metadata: name, kind, size, modified time, revision, link, and whether the platform created it.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: { provider: providerProperty, file_id: { type: 'string' } },
          required: ['file_id'],
        }),
      },
      call: (args) =>
        run(() => deps.files.get(deps.identityId(), provider(args), requireString(args, 'file_id'))),
    },
    {
      tool: {
        name: 'get_spreadsheet_overview',
        description:
          'Understand a spreadsheet (Google Sheet, xlsx or csv) before reading it: every sheet with its used size, header row, and a few sample rows. Call this first, then read only the ranges you need.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            provider: providerProperty,
            file_id: { type: 'string' },
            sample_rows: { type: 'integer', minimum: 0, maximum: 20, default: 5 },
          },
          required: ['file_id'],
        }),
      },
      call: (args) =>
        run(() =>
          deps.spreadsheets.overview(
            deps.identityId(),
            provider(args),
            requireString(args, 'file_id'),
            optionalInteger(args, 'sample_rows') ?? 5,
          ),
        ),
    },
    {
      tool: {
        name: 'read_spreadsheet_range',
        description:
          'Read computed cell values from one sheet, optionally limited to an A1 range such as "A1:F200" (no sheet name). Results are paged; pass next_offset back as offset to continue.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            provider: providerProperty,
            file_id: { type: 'string' },
            sheet: { type: 'string', description: 'Sheet name exactly as in the overview.' },
            range: { type: 'string' },
            offset: { type: 'integer', minimum: 0, default: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          },
          required: ['file_id', 'sheet'],
        }),
      },
      call: (args) =>
        run(() =>
          deps.spreadsheets.readRange(deps.identityId(), provider(args), requireString(args, 'file_id'), {
            sheet: requireString(args, 'sheet'),
            range: optionalString(args, 'range'),
            offset: optionalInteger(args, 'offset') ?? 0,
            limit: optionalInteger(args, 'limit') ?? 200,
          }),
        ),
    },
    {
      tool: {
        name: 'create_spreadsheet',
        description:
          'Create a NEW spreadsheet. With source_file_id, the source is copied first and only the copy is written, so the original is never changed. Each sheet is either replaced with the given rows or has them appended after its last row. Existing files can never be edited.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            provider: providerProperty,
            name: { type: 'string', description: 'Name of the new file.' },
            source_file_id: { type: 'string', description: 'Existing spreadsheet to start from.' },
            folder_id: { type: 'string', description: 'Folder for the new file.' },
            sheets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  mode: { type: 'string', enum: ['replace', 'append'], default: 'replace' },
                  rows: {
                    type: 'array',
                    items: {
                      type: 'array',
                      items: { type: ['string', 'number', 'boolean', 'null'] },
                    },
                  },
                },
                required: ['name', 'rows'],
              },
            },
          },
          required: ['name', 'sheets'],
        }),
      },
      call: (args) =>
        run(() =>
          deps.spreadsheets.create(deps.identityId(), provider(args), {
            name: requireString(args, 'name'),
            sourceFileId: optionalString(args, 'source_file_id'),
            parentId: optionalString(args, 'folder_id'),
            sheets: sheetsArgument(args),
          }),
        ),
    },
  ];
}

async function run(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(JSON.stringify(await operation(), null, 2));
  } catch (error) {
    if (OAuthConnectionError.is(error) || CloudFileError.is(error)) {
      return toolError(`${error.code}: ${error.message}`);
    }
    if (error instanceof ArgumentError) return toolError(error.message);
    throw error;
  }
}

class ArgumentError extends Error {}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key);
  if (value === undefined) throw new ArgumentError(`Missing required argument: ${key}`);
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function sheetsArgument(args: Record<string, unknown>): readonly NewSheetContent[] {
  const sheets = args['sheets'];
  if (!Array.isArray(sheets)) throw new ArgumentError('Missing required argument: sheets');
  return sheets.map((sheet: { name?: unknown; mode?: unknown; rows?: unknown }) => {
    if (typeof sheet.name !== 'string' || !Array.isArray(sheet.rows)) {
      throw new ArgumentError('Each sheet needs a name and rows.');
    }
    return {
      name: sheet.name,
      mode: sheet.mode === 'append' ? 'append' : 'replace',
      rows: sheet.rows as CellValue[][],
    };
  });
}
