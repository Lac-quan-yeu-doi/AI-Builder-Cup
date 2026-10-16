import { Workbook } from 'exceljs';

import { CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import { ExcelJsSpreadsheetParser } from '@infrastructure/spreadsheet/exceljs-spreadsheet-parser';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function xlsx(build: (workbook: Workbook) => void): Promise<Uint8Array> {
  const workbook = new Workbook();
  build(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('ExcelJsSpreadsheetParser', () => {
  const parser = new ExcelJsSpreadsheetParser(1_000);

  it('supports only xlsx', () => {
    expect(parser.supports(XLSX)).toBe(true);
    expect(parser.supports('application/vnd.ms-excel')).toBe(false);
  });

  it('reads computed values, repeats merged values, and trims empty edges', async () => {
    const bytes = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet('Output');
      sheet.getCell('A1').value = 'Line';
      sheet.getCell('B1').value = 'Units';
      sheet.getCell('A2').value = 'L1';
      sheet.getCell('B2').value = { formula: '100+20', result: 120 };
      sheet.getCell('A3').value = 'L2';
      sheet.getCell('B3').value = { richText: [{ text: 'nine' }, { text: 'ty' }] };
      sheet.mergeCells('A2:A3');
      sheet.getCell('D10').value = '';
      workbook.addWorksheet('Hidden', { state: 'hidden' }).getCell('A1').value = true;
    });

    const parsed = await parser.parse(bytes);

    expect(parsed.sheets).toEqual([
      {
        name: 'Output',
        hidden: false,
        rows: [
          ['Line', 'Units'],
          ['L1', 120],
          ['L1', 'ninety'],
        ],
      },
      { name: 'Hidden', hidden: true, rows: [[true]] },
    ]);
  });

  it('returns dates as ISO strings', async () => {
    const bytes = await xlsx((workbook) => {
      workbook.addWorksheet('S').getCell('A1').value = new Date('2026-09-25T00:00:00Z');
    });

    expect((await parser.parse(bytes)).sheets[0]?.rows).toEqual([['2026-09-25T00:00:00.000Z']]);
  });

  it('returns time-only cells as clock times, marking times past midnight', async () => {
    const bytes = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet('S');
      sheet.getCell('A1').value = new Date('1899-12-30T22:00:00Z');
      sheet.getCell('B1').value = new Date('1899-12-31T04:00:00Z');
      sheet.getCell('C1').value = new Date('1899-12-30T07:15:30Z');
    });

    expect((await parser.parse(bytes)).sheets[0]?.rows).toEqual([['22:00', '04:00 (+1d)', '07:15:30']]);
  });

  it('reads an unreadable date cell as empty instead of failing the workbook', async () => {
    const bytes = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet('S');
      sheet.getCell('A1').value = 'ok';
      sheet.getCell('B1').value = new Date(Number.NaN);
    });

    expect((await parser.parse(bytes)).sheets[0]?.rows).toEqual([['ok']]);
  });

  it('rejects workbooks above the cell limit', async () => {
    const bytes = await xlsx((workbook) => {
      workbook.addWorksheet('S').getCell('AAA100').value = 1;
    });

    await expect(parser.parse(bytes)).rejects.toMatchObject({ code: CloudFileErrorCode.TOO_LARGE });
  });

  it('reports corrupt bytes as an unsupported format', async () => {
    await expect(parser.parse(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: CloudFileErrorCode.UNSUPPORTED_FORMAT,
    });
  });
});
