import { describe, expect, it } from 'vitest';

import { extractSuggestions, stripSuggestionTags } from '@/src/entities/models/suggestion';

describe('extractSuggestions', () => {
  it('extracts each suggestion in document order', () => {
    const content =
      'Revenue grew 8%. <suggestion>Break this down by region?</suggestion> ' +
      '<suggestion>Compare to last quarter?</suggestion>';

    expect(extractSuggestions(content)).toEqual([
      'Break this down by region?',
      'Compare to last quarter?',
    ]);
  });

  it('de-duplicates an identical suggestion repeated in the same message', () => {
    const content =
      '<suggestion>Break this down by region?</suggestion> Some text. ' +
      '<suggestion>Break this down by region?</suggestion>';

    expect(extractSuggestions(content)).toEqual(['Break this down by region?']);
  });

  it('trims surrounding whitespace from the suggestion text', () => {
    const content = '<suggestion>  Break this down by region?  </suggestion>';

    expect(extractSuggestions(content)).toEqual(['Break this down by region?']);
  });

  it('returns an empty list when the message has no suggestion tags', () => {
    expect(extractSuggestions('Just a plain reply.')).toEqual([]);
  });

  it('ignores an empty suggestion tag', () => {
    expect(extractSuggestions('<suggestion></suggestion>')).toEqual([]);
  });
});

describe('stripSuggestionTags', () => {
  it('removes suggestion tags but keeps the surrounding prose', () => {
    const content = 'Revenue grew 8%. <suggestion>Break this down by region?</suggestion>';

    expect(stripSuggestionTags(content)).toBe('Revenue grew 8%.');
  });

  it('collapses the blank lines a removed tag leaves behind', () => {
    const content =
      'Revenue grew 8%.\n\n<suggestion>Break this down by region?</suggestion>\n\nDone.';

    expect(stripSuggestionTags(content)).toBe('Revenue grew 8%.\n\nDone.');
  });

  it('returns the content unchanged when there are no suggestion tags', () => {
    expect(stripSuggestionTags('Just a plain reply.')).toBe('Just a plain reply.');
  });

  it('removes the bullets a removed tag leaves empty', () => {
    // How the assistant actually writes its next steps: a bullet list with one
    // suggestion per item. Removing only the tags left the markers, and the
    // reply rendered a run of empty bullets under the heading.
    const content =
      'Ten tables found.\n\nNext steps\n\n- <suggestion>List tables</suggestion>\n- <suggestion>Search for orders</suggestion>\n';

    expect(stripSuggestionTags(content)).toBe('Ten tables found.\n\nNext steps');
  });

  it('keeps a bullet that still has prose of its own', () => {
    const content = '- Revenue grew 8%. <suggestion>Break it down</suggestion>\n- Costs held flat.';

    expect(stripSuggestionTags(content)).toBe('- Revenue grew 8%. \n- Costs held flat.');
  });

  it('leaves a numbered list alone when its items keep their text', () => {
    expect(stripSuggestionTags('1. First\n2. Second')).toBe('1. First\n2. Second');
  });

  it('keeps the lead-in when the chips are rendered under it', () => {
    const content = 'Two catalogs.\n\nSuggested next steps: <suggestion>List tables</suggestion>';

    expect(stripSuggestionTags(content, true)).toBe('Two catalogs.\n\nSuggested next steps:');
  });

  it('drops the lead-in when there are no chips to follow it', () => {
    // Every reply but the newest. The lead-in reads correctly above chips and
    // reads as a bug without them — a finished answer ending on a bare
    // "Suggested next steps:".
    const content = 'Two catalogs.\n\nSuggested next steps: <suggestion>List tables</suggestion>';

    expect(stripSuggestionTags(content, false)).toBe('Two catalogs.');
  });

  it('drops an unpunctuated heading left over a removed list', () => {
    const content = 'Ten tables.\n\nNext steps\n\n- <suggestion>List tables</suggestion>';

    expect(stripSuggestionTags(content, false)).toBe('Ten tables.');
  });

  it('keeps prose that merely happens to precede a suggestion', () => {
    const content = 'Revenue grew 8%. <suggestion>Break it down</suggestion>';

    expect(stripSuggestionTags(content, false)).toBe('Revenue grew 8%.');
  });
});
