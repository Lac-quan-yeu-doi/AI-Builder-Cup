import { validateTriggerFields } from '@application/automation-workflow/validate-trigger-fields';

describe('validateTriggerFields', () => {
  it('returns an empty array for undefined', () => {
    expect(validateTriggerFields(undefined)).toEqual([]);
  });

  it('returns an empty array for an empty array', () => {
    expect(validateTriggerFields([])).toEqual([]);
  });

  it('accepts each of the five supported types', () => {
    const raw = [
      { name: 'a', type: 'text' },
      { name: 'b', type: 'number' },
      { name: 'c', type: 'date' },
      { name: 'd', type: 'datetime' },
      { name: 'e', type: 'boolean' },
    ];
    expect(validateTriggerFields(raw)).toEqual([
      { name: 'a', type: 'text', required: true },
      { name: 'b', type: 'number', required: true },
      { name: 'c', type: 'date', required: true },
      { name: 'd', type: 'datetime', required: true },
      { name: 'e', type: 'boolean', required: true },
    ]);
  });

  it('defaults required to true when omitted', () => {
    expect(validateTriggerFields([{ name: 'run_date', type: 'date' }])).toEqual([
      { name: 'run_date', type: 'date', required: true },
    ]);
  });

  it('preserves an explicit required flag', () => {
    expect(validateTriggerFields([{ name: 'run_date', type: 'date', required: false }])).toEqual([
      { name: 'run_date', type: 'date', required: false },
    ]);
  });

  it('carries an optional label when provided', () => {
    expect(validateTriggerFields([{ name: 'run_date', type: 'date', label: 'Run date' }])).toEqual([
      { name: 'run_date', type: 'date', label: 'Run date', required: true },
    ]);
  });

  it('preserves field order', () => {
    const result = validateTriggerFields([
      { name: 'first', type: 'text' },
      { name: 'second', type: 'number' },
    ]);
    expect(result.map((field) => field.name)).toEqual(['first', 'second']);
  });

  it('rejects a non-array value', () => {
    expect(() => validateTriggerFields({ name: 'x', type: 'text' })).toThrow();
  });

  it('rejects an unknown type', () => {
    expect(() => validateTriggerFields([{ name: 'x', type: 'json' }])).toThrow(/type/i);
  });

  it('rejects a non-string name', () => {
    expect(() => validateTriggerFields([{ name: 42, type: 'text' }])).toThrow(/name/i);
  });

  it('rejects an empty name', () => {
    expect(() => validateTriggerFields([{ name: '   ', type: 'text' }])).toThrow(/name/i);
  });

  it('rejects duplicate names', () => {
    expect(() =>
      validateTriggerFields([
        { name: 'run_date', type: 'date' },
        { name: 'run_date', type: 'text' },
      ]),
    ).toThrow(/duplicate/i);
  });

  it('rejects a non-object item', () => {
    expect(() => validateTriggerFields(['not-an-object'])).toThrow();
  });
});
