// @vitest-environment jsdom

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadAuthors,
  loadChangelog,
  type ChangelogEntry,
  type ChangelogPerson,
} from '@/app/internal/_components/changelog-loader';
import { ChangelogTimeline } from '@/app/internal/_components/changelog-timeline';
import {
  guideItems,
  loadGuidePage,
  loadGuideSidebar,
} from '@/app/internal/_components/guide-loader';
import { GuideSidebar } from '@/app/internal/_components/guide-sidebar';
import { renderUi } from '@/tests/support/render-ui';

const temporaryDirectories: string[] = [];

afterEach(() => {
  cleanup();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

const TEST_PERSON: ChangelogPerson = { name: 'Test Author', emails: ['test@example.com'] };

/** A throwaway data folder with a roster, so month files can be dropped in. */
function scratch(people: readonly ChangelogPerson[] = [TEST_PERSON]): string {
  const directory = mkdtempSync(join(tmpdir(), 'celesnity-internal-'));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, 'authors.json'), JSON.stringify({ people }));
  return directory;
}

function entry(overrides: Partial<ChangelogEntry> & { id: string; date: string }): ChangelogEntry {
  return {
    areas: ['web'],
    kind: 'feature',
    authors: ['Test Author'],
    title: { vi: `Tiêu đề ${overrides.id}`, en: `Title ${overrides.id}` },
    summary: { vi: `Tóm tắt ${overrides.id}`, en: `Summary ${overrides.id}` },
    ...overrides,
  };
}

/*
 * The changelog and the user guide are what the product says about itself at
 * handover. Both are many small files read at build time, so the only thing
 * that keeps them honest is a test that reads them the way the pages do.
 */
describe('changelog data', () => {
  it('validates every file shipped in data/changelogs and orders it newest first', () => {
    const months = loadChangelog();

    expect(months.length).toBeGreaterThan(0);
    const monthKeys = months.map((month) => month.month);
    expect(monthKeys).toEqual([...monthKeys].sort().reverse());
    for (const month of months) {
      expect(month.entries.length).toBeGreaterThan(0);
      const dates = month.entries.map((item) => item.date);
      expect(dates).toEqual([...dates].sort().reverse());
      for (const item of month.entries) {
        expect(item.date.startsWith(month.month)).toBe(true);
        expect(item.title.vi).not.toBe(item.title.en);
      }
    }
  });

  it('credits every shipped entry to a person on the roster', () => {
    const names = new Set(loadAuthors().map((person) => person.name));

    expect(names.size).toBeGreaterThan(0);
    for (const month of loadChangelog()) {
      for (const item of month.entries) {
        for (const author of item.authors) {
          expect(names.has(author), `${item.id} credits "${author}"`).toBe(true);
        }
      }
    }
  });

  it('merges several month files, newest month and newest entry first', () => {
    const directory = scratch();
    writeFileSync(
      join(directory, '2026-08.json'),
      JSON.stringify({ month: '2026-08', entries: [entry({ id: 'aug', date: '2026-08-15' })] }),
    );
    writeFileSync(
      join(directory, '2026-09.json'),
      JSON.stringify({
        month: '2026-09',
        entries: [
          entry({ id: 'early', date: '2026-09-02' }),
          entry({ id: 'late', date: '2026-09-27' }),
        ],
      }),
    );

    const months = loadChangelog(directory);

    expect(months.map((month) => month.month)).toEqual(['2026-09', '2026-08']);
    expect(months[0]?.entries.map((item) => item.id)).toEqual(['late', 'early']);
  });

  it('names the file and the problem when a file is wrong', () => {
    const directory = scratch();
    writeFileSync(
      join(directory, '2026-09.json'),
      JSON.stringify({ month: '2026-09', entries: [entry({ id: 'x', date: '2026-10-01' })] }),
    );
    expect(() => loadChangelog(directory)).toThrow(/2026-09\.json: entry "x" is dated 2026-10-01/u);

    writeFileSync(
      join(directory, '2026-09.json'),
      JSON.stringify({ month: '2026-09', entries: [{ id: 'x', date: '2026-09-01' }] }),
    );
    expect(() => loadChangelog(directory)).toThrow(/2026-09\.json: .*areas/u);

    writeFileSync(
      join(directory, '2026-09.json'),
      JSON.stringify({ month: '2026-09', entries: [entry({ id: 'dup', date: '2026-09-01' })] }),
    );
    writeFileSync(
      join(directory, '2026-10.json'),
      JSON.stringify({ month: '2026-10', entries: [entry({ id: 'dup', date: '2026-10-01' })] }),
    );
    expect(() => loadChangelog(directory)).toThrow(/id "dup" is used twice/u);
  });

  it('refuses an entry credited to someone the roster does not know', () => {
    const directory = scratch();
    writeFileSync(
      join(directory, '2026-09.json'),
      JSON.stringify({
        month: '2026-09',
        entries: [entry({ id: 'x', date: '2026-09-01', authors: ['Nobody'] })],
      }),
    );

    expect(() => loadChangelog(directory)).toThrow(
      /entry "x" names "Nobody", who is not in data\/changelogs\/authors\.json/u,
    );
  });

  it('refuses a roster that lists a name or an email twice', () => {
    const sameName = scratch([TEST_PERSON, { name: 'Test Author', emails: ['b@example.com'] }]);
    expect(() => loadAuthors(sameName)).toThrow(/"Test Author" is listed twice/u);

    const sameEmail = scratch([
      TEST_PERSON,
      { name: 'Someone Else', emails: ['test@example.com'] },
    ]);
    expect(() => loadAuthors(sameEmail)).toThrow(/test@example\.com belongs to two people/u);
  });

  it('draws the timeline in the active language with kind and area labels', () => {
    renderUi(
      createElement(ChangelogTimeline, {
        people: [{ ...TEST_PERSON, github: 'test-author' }],
        months: [
          {
            month: '2026-09',
            entries: [
              entry({
                id: 'one',
                date: '2026-09-27',
                areas: ['web', 'agent'],
                kind: 'fix',
                version: '0.5.0',
                authors: ['Test Author', 'Test Pair'],
                details: { vi: ['Chi tiết'], en: ['A detail'] },
              }),
            ],
          },
        ],
      }),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'What changed' })).toBeTruthy();
    expect(screen.getByText('Title one')).toBeTruthy();
    expect(screen.getByText('Summary one')).toBeTruthy();
    expect(screen.getByText('A detail')).toBeTruthy();
    expect(screen.getByText('Fixed')).toBeTruthy();
    expect(screen.getByText('Web app')).toBeTruthy();
    expect(screen.getByText('Assistant')).toBeTruthy();
    expect(screen.getByText('Version 0.5.0')).toBeTruthy();
    expect(screen.queryByText('Tiêu đề one')).toBeNull();

    // A person the roster knows links to their profile; anyone else is plain text.
    const author = screen.getByRole('link', { name: 'Test Author' });
    expect(author.getAttribute('href')).toBe('https://github.com/test-author');
    expect(author.parentElement?.textContent).toBe('By Test Author, Test Pair');
    expect(screen.getByText('Test Pair').tagName).toBe('SPAN');
  });
});

describe('user guide data', () => {
  it('has both language files for every page the sidebar lists', () => {
    const sidebar = loadGuideSidebar();
    const items = guideItems(sidebar);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const page = loadGuidePage(item.slug, undefined, sidebar);
      expect(page, item.slug).not.toBeNull();
      expect(page?.body.vi.trim().startsWith('# '), `${item.slug} (vi) starts with a title`).toBe(
        true,
      );
      expect(page?.body.en.trim().startsWith('# '), `${item.slug} (en) starts with a title`).toBe(
        true,
      );
      expect(page?.body.vi).not.toBe(page?.body.en);
    }
  });

  it('returns null for a slug the sidebar does not know', () => {
    expect(loadGuidePage('not-a-page')).toBeNull();
  });

  it('refuses a page that exists in one language only', () => {
    const directory = scratch();
    mkdirSync(join(directory, 'vi'));
    mkdirSync(join(directory, 'en'));
    writeFileSync(
      join(directory, '_sidebar.json'),
      JSON.stringify({
        sections: [
          {
            title: { vi: 'Bắt đầu', en: 'Start' },
            items: [{ slug: 'one', file: '01-one.md', title: { vi: 'Một', en: 'One' } }],
          },
        ],
      }),
    );
    writeFileSync(join(directory, 'vi', '01-one.md'), '# Một\n');

    expect(() => loadGuidePage('one', directory)).toThrow(/en\/01-one\.md is missing/u);
  });

  it('marks the open page in the table of contents', () => {
    renderUi(
      createElement(GuideSidebar, {
        activeSlug: 'two',
        sidebar: {
          sections: [
            {
              title: { vi: 'Nhóm', en: 'Group' },
              items: [
                { slug: 'one', file: '01-one.md', title: { vi: 'Một', en: 'One' } },
                { slug: 'two', file: '02-two.md', title: { vi: 'Hai', en: 'Two' } },
              ],
            },
          ],
        },
      }),
    );

    const current = screen.getByRole('link', { name: 'Two' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('href')).toBe('/_internal/user-guide/two');
    expect(screen.getByRole('link', { name: 'One' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Guide sections' })).toBeTruthy();
  });
});
