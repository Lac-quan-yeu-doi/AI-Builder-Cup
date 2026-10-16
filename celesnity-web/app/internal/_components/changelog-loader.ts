import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * The changelog is many small files, not one: `data/changelogs/<YYYY-MM>.json`,
 * one per month, so a release adds a file or a few lines to the current one and
 * never rewrites history. Next to them, `authors.json` is the roster: the name
 * each person is credited under and the git emails they commit with, so an
 * entry written by hand or by a coding agent names the same person the same
 * way every time. This reads every file, checks it, and hands the timeline
 * back newest first. A malformed file names itself in the error so the person
 * (or agent) who wrote it can fix it without a search.
 */
export const CHANGELOG_DIRECTORY = join(process.cwd(), 'data', 'changelogs');
export const AUTHORS_FILE = 'authors.json';

const MONTH_FILE = /^\d{4}-\d{2}\.json$/u;

export const changelogAreas = ['web', 'core', 'agent', 'all'] as const;
export const changelogKinds = ['feature', 'improvement', 'fix'] as const;

export type ChangelogArea = (typeof changelogAreas)[number];
export type ChangelogKind = (typeof changelogKinds)[number];

const personSchema = z.object({
  /** Shown on the page; every entry's `authors` uses exactly this spelling. */
  name: z.string().min(1),
  /** GitHub login, when the person has one; the page links to the profile. */
  github: z
    .string()
    .regex(/^[A-Za-z0-9-]+$/u)
    .optional(),
  /** Every email the person commits with, as `git config user.email` prints it. */
  emails: z.array(z.string().regex(/^[^\s@]+@[^\s@]+$/u)).min(1),
});

const authorsSchema = z.object({ people: z.array(personSchema).min(1) });

const localizedText = z.object({ vi: z.string().min(1), en: z.string().min(1) });
const localizedList = z.object({
  vi: z.array(z.string().min(1)),
  en: z.array(z.string().min(1)),
});

const entrySchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  areas: z.array(z.enum(changelogAreas)).min(1),
  kind: z.enum(changelogKinds),
  version: z.string().min(1).optional(),
  /** The people who made the change, by their `name` in `authors.json`. */
  authors: z.array(z.string().min(1)).min(1),
  title: localizedText,
  summary: localizedText,
  details: localizedList.optional(),
});

const fileSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/u),
  entries: z.array(entrySchema),
});

export type ChangelogPerson = z.infer<typeof personSchema>;
export type ChangelogEntry = z.infer<typeof entrySchema>;

export interface ChangelogMonth {
  readonly month: string;
  /** Newest first. */
  readonly entries: readonly ChangelogEntry[];
}

function issuesOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

function readJson(directory: string, name: string): unknown {
  return JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown;
}

/**
 * The roster of people a change can be credited to. Names and emails are
 * unique across it, so an email resolves to one person and a name to one
 * profile.
 */
export function loadAuthors(directory = CHANGELOG_DIRECTORY): readonly ChangelogPerson[] {
  const parsed = authorsSchema.safeParse(readJson(directory, AUTHORS_FILE));
  if (!parsed.success) {
    throw new Error(`data/changelogs/${AUTHORS_FILE}: ${issuesOf(parsed.error)}`);
  }
  const names = new Set<string>();
  const emails = new Set<string>();
  for (const person of parsed.data.people) {
    if (names.has(person.name)) {
      throw new Error(`data/changelogs/${AUTHORS_FILE}: "${person.name}" is listed twice`);
    }
    names.add(person.name);
    for (const email of person.emails) {
      if (emails.has(email)) {
        throw new Error(`data/changelogs/${AUTHORS_FILE}: ${email} belongs to two people`);
      }
      emails.add(email);
    }
  }
  return parsed.data.people;
}

export function loadChangelog(directory = CHANGELOG_DIRECTORY): readonly ChangelogMonth[] {
  const knownAuthors = new Set(loadAuthors(directory).map((person) => person.name));
  const files = readdirSync(directory).filter((name) => MONTH_FILE.test(name));
  const seenIds = new Set<string>();

  const months = files.map((name): ChangelogMonth => {
    const parsed = fileSchema.safeParse(readJson(directory, name));
    if (!parsed.success) {
      throw new Error(`data/changelogs/${name}: ${issuesOf(parsed.error)}`);
    }
    const { month, entries } = parsed.data;
    if (name !== `${month}.json`) {
      throw new Error(
        `data/changelogs/${name}: "month" is ${month}; the file must be named ${month}.json`,
      );
    }
    for (const entry of entries) {
      if (!entry.date.startsWith(month)) {
        throw new Error(
          `data/changelogs/${name}: entry "${entry.id}" is dated ${entry.date}, outside ${month}`,
        );
      }
      if (seenIds.has(entry.id)) {
        throw new Error(`data/changelogs/${name}: entry id "${entry.id}" is used twice`);
      }
      seenIds.add(entry.id);
      for (const author of entry.authors) {
        if (!knownAuthors.has(author)) {
          throw new Error(
            `data/changelogs/${name}: entry "${entry.id}" names "${author}", who is not in data/changelogs/${AUTHORS_FILE}`,
          );
        }
      }
    }
    return { month, entries: [...entries].sort((a, b) => b.date.localeCompare(a.date)) };
  });

  return months.sort((a, b) => b.month.localeCompare(a.month));
}
