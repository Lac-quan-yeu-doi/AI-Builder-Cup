// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  rememberTutorialDestination,
  resolveTutorialDestination,
} from '@/app/_components/tutorials/tutorial-destination-memory';

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('tutorial destination memory', () => {
  it('resolves a database route template to the concrete route the member opened', () => {
    window.history.replaceState(null, '', '/databases/tests?tab=sources');
    rememberTutorialDestination('/databases/:database?tab=sources');

    expect(resolveTutorialDestination('/databases/:database?tab=sources')).toBe(
      '/databases/tests?tab=sources',
    );
  });

  it('remembers the destination of a source link before navigation occurs', () => {
    window.history.replaceState(null, '', '/databases/tests?tab=sources');
    rememberTutorialDestination(
      '/databases/:database/sources/:sourceId',
      '/databases/tests/sources/source-42?tab=connection',
    );

    expect(resolveTutorialDestination('/databases/:database/sources/:sourceId')).toBe(
      '/databases/tests/sources/source-42?tab=connection',
    );
  });

  it('never navigates to an unresolved literal route template', () => {
    expect(resolveTutorialDestination('/databases/:database?tab=sources')).toBe(
      '/catalog/databases',
    );
    expect(resolveTutorialDestination('/sql')).toBe('/sql');
  });
});
