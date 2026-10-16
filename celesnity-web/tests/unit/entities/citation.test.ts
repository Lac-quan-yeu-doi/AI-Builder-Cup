import { describe, expect, it } from 'vitest';

import {
  citationKey,
  extractCitationRefs,
  parseCitationHref,
  rewriteCitationTags,
} from '@/src/entities/models/citation';

describe('extractCitationRefs', () => {
  it('extracts a chart citation with no page', () => {
    const refs = extractCitationRefs(
      'See <citation><type>chart</type><id>chart-1</id></citation> for the trend.',
    );
    expect(refs).toEqual([{ type: 'chart', id: 'chart-1' }]);
  });

  it('extracts a document citation with a page', () => {
    const refs = extractCitationRefs(
      'Per <citation><type>document</type><id>doc-1</id><page>3</page></citation>.',
    );
    expect(refs).toEqual([{ type: 'document', id: 'doc-1', page: 3 }]);
  });

  it('de-duplicates repeated citations of the same chart/document/page', () => {
    const content =
      '<citation><type>chart</type><id>chart-1</id></citation> and again ' +
      '<citation><type>chart</type><id>chart-1</id></citation>';
    expect(extractCitationRefs(content)).toEqual([{ type: 'chart', id: 'chart-1' }]);
  });

  it('treats the same document id at different pages as distinct citations', () => {
    const content =
      '<citation><type>document</type><id>doc-1</id><page>1</page></citation> ' +
      '<citation><type>document</type><id>doc-1</id><page>2</page></citation>';
    expect(extractCitationRefs(content)).toEqual([
      { type: 'document', id: 'doc-1', page: 1 },
      { type: 'document', id: 'doc-1', page: 2 },
    ]);
  });

  it('returns nothing for content with no citation tags', () => {
    expect(extractCitationRefs('Just plain text.')).toEqual([]);
  });
});

describe('rewriteCitationTags', () => {
  it('rewrites a chart citation into a citation:// markdown link', () => {
    expect(
      rewriteCitationTags('See <citation><type>chart</type><id>chart-1</id></citation>.'),
    ).toBe('See [cite](citation://chart/chart-1).');
  });

  it('rewrites a document citation with a page into a query param', () => {
    expect(
      rewriteCitationTags('<citation><type>document</type><id>doc-1</id><page>3</page></citation>'),
    ).toBe('[cite](citation://document/doc-1?page=3)');
  });

  it('percent-encodes ids that contain URI-unsafe characters', () => {
    expect(
      rewriteCitationTags('<citation><type>chart</type><id>chart/weird id</id></citation>'),
    ).toBe('[cite](citation://chart/chart%2Fweird%20id)');
  });

  it('leaves content with no citation tags untouched', () => {
    expect(rewriteCitationTags('Nothing to see here.')).toBe('Nothing to see here.');
  });

  it('survives being wrapped mid-sentence and in bold text', () => {
    expect(
      rewriteCitationTags(
        'The trend is up **<citation><type>chart</type><id>c1</id></citation>** this quarter.',
      ),
    ).toBe('The trend is up **[cite](citation://chart/c1)** this quarter.');
  });
});

describe('parseCitationHref', () => {
  it('parses a chart citation href with no page', () => {
    expect(parseCitationHref('citation://chart/chart-1')).toEqual({
      type: 'chart',
      id: 'chart-1',
    });
  });

  it('parses a document citation href with a page', () => {
    expect(parseCitationHref('citation://document/doc-1?page=3')).toEqual({
      type: 'document',
      id: 'doc-1',
      page: 3,
    });
  });

  it('decodes a percent-encoded id', () => {
    expect(parseCitationHref('citation://chart/chart%2Fweird%20id')).toEqual({
      type: 'chart',
      id: 'chart/weird id',
    });
  });

  it('returns null for a non-citation href', () => {
    expect(parseCitationHref('https://example.com')).toBeNull();
  });

  it('round-trips through rewriteCitationTags for every extracted ref', () => {
    const content = '<citation><type>document</type><id>doc-9</id><page>2</page></citation>';
    const [ref] = extractCitationRefs(content);
    const rewritten = rewriteCitationTags(content);
    const match = /\(([^)]+)\)/.exec(rewritten);
    expect(match).not.toBeNull();
    const parsed = parseCitationHref(match?.[1] ?? '');
    expect(parsed && ref && citationKey(parsed)).toBe(ref && citationKey(ref));
  });
});
