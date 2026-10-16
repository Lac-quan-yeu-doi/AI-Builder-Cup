import { describe, expect, it } from 'vitest';

import { runArtifact } from '@/app/(workspace)/chat/_components/stage/terminal-pane';
import { createTranslator } from '@/app/_i18n/translate';

const t = createTranslator('en');

describe('runArtifact', () => {
  it('builds a stable, namespaced artifact id from the run id', () => {
    expect(runArtifact('run-418', t)).toEqual({
      id: 'terminal:run-418',
      kind: 'terminal',
      title: 'Run run-418',
      meta: 'Logs',
    });
  });

  it('keeps its id when the locale changes', () => {
    expect(runArtifact('run-418', createTranslator('vi')).id).toBe('terminal:run-418');
  });
});
