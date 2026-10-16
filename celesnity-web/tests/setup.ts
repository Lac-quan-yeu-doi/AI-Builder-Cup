import { createElement } from 'react';
import { vi } from 'vitest';

vi.mock('@atomic-editor/editor', () => ({
  AtomicCodeMirrorEditor: ({
    markdownSource,
    readOnly,
  }: {
    readonly markdownSource: string;
    readonly readOnly?: boolean;
  }) =>
    createElement(
      'div',
      {
        'aria-label': 'Markdown reading surface',
        'data-editor': 'atomic',
        'data-read-only': readOnly ? 'true' : undefined,
      },
      markdownSource,
    ),
}));

// jsdom has no canvas. The thinking orb asks for a 2D context in an effect and
// correctly draws nothing when it gets none, but jsdom also logs "not
// implemented" for every ask, one line per orb per render. Answer quietly.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}
