import { applyInputTemplate } from '@application/automation/apply-input-template';

describe('applyInputTemplate', () => {
  it('resolves simple $.payload.field paths into strings', () => {
    const result = applyInputTemplate(
      { message: '$.payload.summary' },
      { payload: { summary: 'crawl finished' } },
    );
    expect(result).toEqual({ message: 'crawl finished' });
  });

  it('stringifies numeric values', () => {
    const result = applyInputTemplate(
      { count: '$.payload.rowCount' },
      { payload: { rowCount: 42 } },
    );
    expect(result).toEqual({ count: '42' });
  });

  it('returns undefined when a path does not resolve', () => {
    const result = applyInputTemplate({ message: '$.payload.missing' }, { payload: {} });
    expect(result).toBeUndefined();
  });

  it('returns undefined when the payload is not an object', () => {
    expect(applyInputTemplate({ message: '$.payload.summary' }, null)).toBeUndefined();
  });

  it('passes through a value with no $. prefix as a literal, ignoring the payload', () => {
    const result = applyInputTemplate({ message: 'Run the daily report' }, { payload: {} });
    expect(result).toEqual({ message: 'Run the daily report' });
  });

  it('mixes literal and payload-derived values in one template', () => {
    const result = applyInputTemplate(
      { label: 'Daily digest', summary: '$.payload.summary' },
      { payload: { summary: 'crawl finished' } },
    );
    expect(result).toEqual({ label: 'Daily digest', summary: 'crawl finished' });
  });

  it('still returns undefined for an unresolved $. path even when other fields are literal', () => {
    const result = applyInputTemplate(
      { label: 'Daily digest', summary: '$.payload.missing' },
      { payload: {} },
    );
    expect(result).toBeUndefined();
  });

  it('resolves $. paths embedded inside a larger sentence, matching the demo automation templates', () => {
    const result = applyInputTemplate(
      { message: 'A new demo order just came in from $.customer_name for $.amount.' },
      { customer_name: 'Acme Corp', amount: '4820.00' },
    );
    expect(result).toEqual({
      message: 'A new demo order just came in from Acme Corp for 4820.00.',
    });
  });

  it('resolves the same embedded path appearing more than once', () => {
    const result = applyInputTemplate(
      { message: '$.name said hello. $.name also said goodbye.' },
      { name: 'Bob' },
    );
    expect(result).toEqual({ message: 'Bob said hello. Bob also said goodbye.' });
  });

  it('returns undefined when an embedded path does not resolve', () => {
    const result = applyInputTemplate(
      { message: 'Order from $.customer_name for $.amount.' },
      { customer_name: 'Acme Corp' },
    );
    expect(result).toBeUndefined();
  });
});
