import { describe, expect, it } from 'vitest';

import { applicationStateArtifact } from '@/app/(workspace)/chat/_components/stage/table-pane';
import { createTranslator } from '@/app/_i18n/translate';

const t = createTranslator('en');

describe('applicationStateArtifact', () => {
  it('is a stable singleton artifact', () => {
    expect(applicationStateArtifact(t)).toEqual({
      id: 'table:application-state',
      kind: 'table',
      title: 'Application state',
      meta: 'Table',
    });
  });

  it('keeps its id when the locale changes', () => {
    expect(applicationStateArtifact(createTranslator('vi')).id).toBe(
      applicationStateArtifact(t).id,
    );
  });
});
