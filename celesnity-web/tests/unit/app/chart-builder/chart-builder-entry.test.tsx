// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { ChartBuilderEntry } from '@/app/(workspace)/charts/_components/chart-builder-entry';

afterEach(cleanup);

describe('ChartBuilderEntry', () => {
  it('starts a guided question or native SQL workflow', () => {
    const onQuestion = vi.fn();
    const onNative = vi.fn();

    renderUi(<ChartBuilderEntry onQuestion={onQuestion} onNative={onNative} />);

    fireEvent.click(screen.getByRole('button', { name: /new question/i }));
    expect(onQuestion).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /new sql query/i }));
    expect(onNative).toHaveBeenCalledOnce();
  });
});
