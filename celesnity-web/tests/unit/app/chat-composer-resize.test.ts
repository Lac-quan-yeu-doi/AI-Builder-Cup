// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '@/app/_components/chat/chat-composer';
import { renderUi as render } from '@/tests/support/render-ui';

/* jsdom lays nothing out; pretend the field is as tall as its text. */
const SINGLE_LINE = 40;
const PASTED = 132;

beforeEach(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return this.value.includes('\n') ? PASTED : SINGLE_LINE;
    },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
});

/*
 * Pasting a paragraph grew the field, and sending it left the field that
 * tall with nothing inside: the resize measured the DOM before React had
 * cleared it. The field now shrinks back once the value is gone.
 */
describe('ChatComposer field height', () => {
  it('grows with pasted lines and returns to its designed size after sending', () => {
    const onSubmit = vi.fn();
    render(createElement(ChatComposer, { onSubmit }));
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(field.style.height).toBe('');

    fireEvent.change(field, { target: { value: 'first line\nsecond line\nthird line' } });
    expect(field.style.height).toBe(`${PASTED}px`);

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('first line\nsecond line\nthird line');
    expect(field.value).toBe('');
    expect(field.style.height).toBe('');
  });

  it('returns to its designed size when the text is deleted', () => {
    render(createElement(ChatComposer, { onSubmit: vi.fn() }));
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(field, { target: { value: 'a\nb' } });
    expect(field.style.height).toBe(`${PASTED}px`);

    fireEvent.change(field, { target: { value: '' } });
    expect(field.style.height).toBe('');
  });
});
