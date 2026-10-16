import { suggestValueCorrections } from '@domain/query-workbench/policies/value-suggestion.linter';
import { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

function stringProfile(name: string, topValues: readonly string[]): ColumnProfile {
  return ColumnProfile.create({
    name,
    dataType: 'varchar',
    kind: 'string',
    topValues,
    computedAt: '2026-09-03T00:00:00.000Z',
  });
}

function numericProfile(name: string): ColumnProfile {
  return ColumnProfile.create({
    name,
    dataType: 'integer',
    kind: 'numeric',
    min: 0,
    max: 100,
    avg: 50,
    computedAt: '2026-09-03T00:00:00.000Z',
  });
}

const REGION_PROFILE = stringProfile('region', ['California', 'Texas', 'Nevada']);
const STATUS_PROFILE = stringProfile('status', ['done', 'complete', 'pending']);

describe('suggestValueCorrections — misspelled literal', () => {
  it('flags a misspelled value close to a known one and suggests the real value', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'Calfornia'", [
      REGION_PROFILE,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('California');
  });

  it('does not flag an exact match', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'California'", [
      REGION_PROFILE,
    ]);
    expect(findings).toHaveLength(0);
  });

  it('flags a case-only mismatch, since Trino string equality is case-sensitive', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'california'", [
      REGION_PROFILE,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('California');
  });

  it('does not flag a value with no close match, to avoid noisy false positives', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'Mars'", [
      REGION_PROFILE,
    ]);
    expect(findings).toHaveLength(0);
  });

  it('does not flag a column with no matching profile', () => {
    const findings = suggestValueCorrections(
      "SELECT * FROM orders WHERE nonexistent_column = 'Calfornia'",
      [REGION_PROFILE],
    );
    expect(findings).toHaveLength(0);
  });

  it('does not flag a numeric column profile even if the name collides', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'Calfornia'", [
      numericProfile('region'),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('returns no findings when no profiles are supplied', () => {
    const findings = suggestValueCorrections("SELECT * FROM orders WHERE region = 'Calfornia'", []);
    expect(findings).toHaveLength(0);
  });
});

describe('suggestValueCorrections — IN lists', () => {
  it('flags only the misspelled member of an IN list', () => {
    const findings = suggestValueCorrections(
      "SELECT * FROM orders WHERE status IN ('done', 'compelte')",
      [STATUS_PROFILE],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('complete');
    expect(findings[0]?.message).not.toContain('done');
  });

  it('flags multiple distinct misspelled literals across a query', () => {
    const findings = suggestValueCorrections(
      "SELECT * FROM orders WHERE region = 'Calfornia' OR status = 'compelte'",
      [REGION_PROFILE, STATUS_PROFILE],
    );
    expect(findings).toHaveLength(2);
  });
});
