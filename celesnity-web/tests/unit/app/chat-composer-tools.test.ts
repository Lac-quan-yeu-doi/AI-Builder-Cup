// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer, type ComposerTool } from '@/app/_components/chat/chat-composer';

afterEach(cleanup);

function tool(onSelect = vi.fn()): ComposerTool {
  return { id: 'charts', label: 'Open charts', icon: null, onSelect };
}

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add to message' }));
}

describe('the compact composer row', () => {
  /*
   * The field used to be forced to 40px while its line box is 21.7px, so every
   * pixel of slack landed under the text and the placeholder floated above the
   * `+` beside it. Height belongs to the row; the field sizes to its own line.
   */
  it('gives the row its height rather than the field', () => {
    const { container } = render(createElement(ChatComposer, { compact: true, onSubmit: vi.fn() }));
    const field = container.querySelector('textarea');
    /* The mention highlighter wraps the field in a positioned box so its mirror
       can sit behind it; that box takes no height of its own either. */
    const wrapper = field?.parentElement;
    const row = wrapper?.parentElement;

    expect(row?.className).toMatch(/\bmin-h-10\b/u);
    expect(wrapper?.className).toMatch(/\bmin-h-0\b/u);
    expect(wrapper?.className).not.toMatch(/\bmin-h-10\b/u);
    expect(field?.className).not.toMatch(/\bh-10\b/u);
    expect(field?.className).toMatch(/\bmin-h-0\b/u);
  });

  it('pads the field evenly, so its line sits in the middle of it', () => {
    const { container } = render(createElement(ChatComposer, { compact: true, onSubmit: vi.fn() }));
    const field = container.querySelector('textarea');

    /* One `py-*`, not a `pt`/`pb` pair that could drift apart. */
    expect(field?.className).toMatch(/\bpy-2\b/u);
    expect(field?.className).not.toMatch(/\bp[tb]-\d/u);
  });
});

describe('the composer add menu', () => {
  /*
   * The compact and wide composers used to carry their own copy of this menu,
   * and the copies had drifted: the workspace panels reached only the wide one,
   * so the follow-up composer in a running conversation could open none of
   * them. Both variants are checked here for that reason.
   */
  for (const compact of [false, true]) {
    const variant = compact ? 'compact' : 'wide';

    it(`offers the same items in the ${variant} composer`, () => {
      render(createElement(ChatComposer, { compact, onSubmit: vi.fn(), tools: [tool()] }));
      openMenu();

      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Attach a file',
        'Open charts',
      ]);
    });

    it(`opens a panel from the ${variant} composer while a reply streams`, () => {
      const onSelect = vi.fn();
      render(
        createElement(ChatComposer, {
          compact,
          disabled: true,
          onSubmit: vi.fn(),
          tools: [tool(onSelect)],
        }),
      );
      openMenu();

      /* Attaching a file is message content, so a streaming reply gates it. */
      expect(screen.getByRole('menuitem', { name: 'Attach a file' })).toHaveProperty(
        'disabled',
        true,
      );

      /* A workspace panel is navigation, so it stays reachable. */
      fireEvent.click(screen.getByRole('menuitem', { name: 'Open charts' }));
      expect(onSelect).toHaveBeenCalledOnce();
    });
  }

  it('shows only the attach item when the surface has no panels to open', () => {
    render(createElement(ChatComposer, { onSubmit: vi.fn(), onFileAttach: vi.fn() }));
    openMenu();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Attach a file',
    ]);
  });

  it('can keep file attachment available while prompt entry is disabled', () => {
    render(
      createElement(ChatComposer, {
        disabled: true,
        fileAttachmentDisabled: false,
        onFileAttach: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );
    openMenu();

    expect(screen.getByRole('menuitem', { name: 'Attach a file' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
  });

  it('closes the menu once a panel is chosen', () => {
    render(createElement(ChatComposer, { onSubmit: vi.fn(), tools: [tool()] }));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open charts' }));

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});
