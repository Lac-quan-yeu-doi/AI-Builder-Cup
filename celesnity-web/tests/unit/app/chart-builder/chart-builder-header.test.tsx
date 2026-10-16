// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { ChartBuilderHeader } from '@/app/(workspace)/charts/_components/chart-builder-header';

afterEach(cleanup);

describe('ChartBuilderHeader', () => {
  it('disables save when the current draft is not saveable while keeping preview available', () => {
    const onPreview = vi.fn();
    const onSave = vi.fn();

    renderUi(<ChartBuilderHeader canSave={false} onPreview={onPreview} onSave={onSave} />);

    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /run preview/i }).hasAttribute('disabled')).toBe(
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: /run preview/i }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
