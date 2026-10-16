// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseTutorialSampleFile } from '@/app/(workspace)/chat/_components/tutorial-sample-file';

const expectedHeaders = ['date', 'region', 'product', 'units', 'revenue'];

function sampleFile(bytes: Uint8Array, name: string): File {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    name,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => buffer,
  } as File;
}

describe('tutorial sample file parser', () => {
  it('parses the bundled CSV and XLSX into equivalent rows', async () => {
    const csvBytes = await readFile(resolve('public/tutorial-samples/retail-orders.csv'));
    const xlsxBytes = await readFile(resolve('public/tutorial-samples/retail-orders.xlsx'));
    const csv = await parseTutorialSampleFile(sampleFile(csvBytes, 'retail-orders.csv'));
    const xlsx = await parseTutorialSampleFile(sampleFile(xlsxBytes, 'retail-orders.xlsx'));

    expect(csv.headers).toEqual(expectedHeaders);
    expect(xlsx).toEqual(csv);
    expect(csv.rows.length).toBeGreaterThan(0);
  });

  it('rejects renamed, unsupported, empty, and oversized files', async () => {
    const invalidFiles = [
      sampleFile(new TextEncoder().encode('date,region,product,units,revenue'), 'orders.csv'),
      sampleFile(new TextEncoder().encode('x'), 'retail-orders.txt'),
      sampleFile(new Uint8Array(), 'retail-orders.csv'),
      sampleFile(new Uint8Array(1_000_001), 'retail-orders.xlsx'),
    ];

    for (const file of invalidFiles) {
      await expect(parseTutorialSampleFile(file)).rejects.toThrow('invalid_tutorial_sample');
    }
  });
});
