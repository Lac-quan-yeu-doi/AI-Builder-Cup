import {
  classifyColumnKind,
  quoteIdentifier,
} from '@infrastructure/trino/catalog-exploration/trino-catalog.reader';

describe('classifyColumnKind', () => {
  it.each([
    ['varchar', 'string'],
    ['varchar(255)', 'string'],
    ['char(10)', 'string'],
  ])('classifies %s as %s', (dataType, expected) => {
    expect(classifyColumnKind(dataType)).toBe(expected);
  });

  it.each([
    ['integer', 'numeric'],
    ['bigint', 'numeric'],
    ['smallint', 'numeric'],
    ['tinyint', 'numeric'],
    ['double', 'numeric'],
    ['real', 'numeric'],
    ['decimal(10,2)', 'numeric'],
  ])('classifies %s as %s', (dataType, expected) => {
    expect(classifyColumnKind(dataType)).toBe(expected);
  });

  it.each([
    ['boolean', 'other'],
    ['date', 'other'],
    ['timestamp(6)', 'other'],
    ['array(varchar)', 'other'],
    ['row(a integer, b varchar)', 'other'],
    ['map(varchar, integer)', 'other'],
  ])('classifies %s as other (no stats computed)', (dataType, expected) => {
    expect(classifyColumnKind(dataType)).toBe(expected);
  });
});

describe('quoteIdentifier', () => {
  it('wraps a plain identifier in double quotes', () => {
    expect(quoteIdentifier('status')).toBe('"status"');
  });

  it('escapes an embedded double quote by doubling it', () => {
    expect(quoteIdentifier('weird"column')).toBe('"weird""column"');
  });
});
