import { describe, expect, it } from 'vitest';

import { describeTool, orbStateFor } from '@/app/_components/chat/tool-label';

describe('describeTool', () => {
  it('names a warehouse call after what it does and where', () => {
    expect(
      describeTool('mcp__trino__list_tables', { catalog: 'iceberg', schema: 'public' }),
    ).toEqual({
      labelKey: 'chat.tool.listTables',
      detail: 'iceberg.public',
      raw: 'mcp__trino__list_tables',
    });
    expect(
      describeTool('mcp__trino__describe_table', {
        catalog: 'iceberg',
        schema: 'demo',
        table: 'orders',
      }).detail,
    ).toBe('iceberg.demo.orders');
  });

  it('keeps a query on one line and cuts it short', () => {
    const sql = `SELECT customer_name,\n       SUM(amount) AS revenue\nFROM iceberg.demo.orders\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT ${'9'.repeat(40)}`;
    const described = describeTool('mcp__trino__run_query', { sql });

    expect(described.labelKey).toBe('chat.tool.runQuery');
    expect(described.detail).not.toContain('\n');
    expect(described.detail?.startsWith('SELECT customer_name, SUM(amount) AS revenue')).toBe(true);
    expect(described.detail?.length).toBeLessThanOrEqual(73);
    expect(described.detail?.endsWith('…')).toBe(true);
  });

  it('reads the built-in file tools and their aliases the same way', () => {
    expect(describeTool('Read', { file_path: 'scripts/clean.py' })).toMatchObject({
      labelKey: 'chat.tool.readFile',
      detail: 'scripts/clean.py',
    });
    expect(describeTool('read_file', { path: 'scripts/clean.py' })).toMatchObject({
      labelKey: 'chat.tool.readFile',
      detail: 'scripts/clean.py',
    });
    expect(describeTool('Grep', { pattern: 'TODO' })).toMatchObject({
      labelKey: 'chat.tool.searchFiles',
      detail: 'TODO',
    });
    expect(describeTool('Bash', { command: 'python scripts/clean.py' }).labelKey).toBe(
      'chat.tool.runCommand',
    );
  });

  it('folds the chart mutation variants into one label', () => {
    for (const name of ['set_chart_data', 'set_chart_encodings', 'patch_chart', 'move_chart']) {
      expect(describeTool(`mcp__chart__${name}`, {}).labelKey).toBe('chat.tool.updateChart');
    }
  });

  it('leaves out the detail when the argument is missing or blank', () => {
    expect(describeTool('mcp__trino__list_tables', {})).toEqual({
      labelKey: 'chat.tool.listTables',
      raw: 'mcp__trino__list_tables',
    });
    expect(describeTool('mcp__skill__get_skill', { name: '   ' }).detail).toBeUndefined();
    expect(describeTool('mcp__trino__list_catalogs', undefined).detail).toBeUndefined();
  });

  it('shows a step running as the kind of work it is', () => {
    expect(orbStateFor('chat.tool.listTables')).toBe('searching');
    expect(orbStateFor('chat.tool.runQuery')).toBe('searching');
    expect(orbStateFor('chat.tool.createChart')).toBe('composing');
    expect(orbStateFor('chat.tool.updateWorkflowStep')).toBe('weaving');
    expect(orbStateFor('chat.tool.writeFile')).toBe('shaping');
    expect(orbStateFor('chat.tool.httpRequest')).toBe('connecting');
    expect(orbStateFor('chat.tool.askUser')).toBe('listening');
    expect(orbStateFor('chat.tool.generic')).toBe('working');
  });

  it('falls back to a generic label with the tool name in words', () => {
    expect(describeTool('parse_spreadsheet', { file: 'q3.xlsx' })).toEqual({
      labelKey: 'chat.tool.generic',
      detail: 'Parse spreadsheet',
      raw: 'parse_spreadsheet',
    });
    expect(describeTool('mcp__weather__get_forecast', {}).detail).toBe('Get forecast');
  });
});
