import { describe, expect, it } from 'vitest';

import { chartsArtifact } from '@/app/(workspace)/chat/_components/stage/chart-pane';
import { createTranslator } from '@/app/_i18n/translate';

const t = createTranslator('en');

describe('chartsArtifact', () => {
  it('is a stable singleton artifact', () => {
    expect(chartsArtifact(t)).toEqual({
      id: 'chart:list',
      kind: 'chart',
      title: 'Charts',
      meta: 'Chart',
    });
  });

  it('keeps its id when the locale changes', () => {
    expect(chartsArtifact(createTranslator('vi')).id).toBe(chartsArtifact(t).id);
  });
});
