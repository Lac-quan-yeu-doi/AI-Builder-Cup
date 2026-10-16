import { createElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';

import { CurrentUserProvider } from '@/app/_providers/current-user-provider';

/**
 * Renders a subtree the way `app/(workspace)/layout.tsx` does — wrapped in
 * `CurrentUserProvider`, since any component under the workspace tree may
 * call `useCurrentUserId()`. `'local-user'` is an arbitrary but fixed stub
 * id; don't read meaning into it beyond "some signed-in user."
 *
 * Otherwise a thin wrapper over `render` that installs the browser APIs
 * jsdom does not implement and Radix reaches for on mount.
 */
export function installBrowserStubs(): void {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.DOMRect ??= class {
    constructor(
      readonly x = 0,
      readonly y = 0,
      readonly width = 0,
      readonly height = 0,
    ) {}
    readonly top = 0;
    readonly left = 0;
    readonly right = 0;
    readonly bottom = 0;
    toJSON() {
      return {};
    }
    static fromRect() {
      return new DOMRect();
    }
  } as unknown as typeof DOMRect;

  /*
   * Radix's popper layer drives its overlays through the Pointer Capture API and
   * scrolls the active item into view. jsdom implements neither, and an
   * unhandled TypeError inside a Radix effect surfaces as an unrelated render
   * failure several assertions later.
   */
  const element = window.HTMLElement.prototype;
  element.hasPointerCapture ??= () => false;
  element.setPointerCapture ??= () => {};
  element.releasePointerCapture ??= () => {};
  element.scrollIntoView ??= () => {};

  // The autosizing textarea re-measures once webfonts land. jsdom ships no
  // FontFaceSet, so give it one that never fires.
  if (document.fonts === undefined) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { addEventListener: () => {}, removeEventListener: () => {} },
    });
  }
}

function wrapped(node: ReactNode): ReactNode {
  return createElement(CurrentUserProvider, { userId: 'local-user' }, node);
}

export function renderUi(node: ReactNode): RenderResult {
  installBrowserStubs();
  const result = render(wrapped(node));
  // `RenderResult.rerender` re-renders at the same root with exactly the
  // node it's given — a caller doing `renderUi(x).rerender(y)` would render
  // `y` unwrapped, changing the root element type from `CurrentUserProvider`
  // to whatever `y` is and unmounting/remounting the whole tree (resetting
  // component state) instead of the update-in-place a rerender is supposed
  // to be. Re-wrapping here keeps every `rerender` call consistent with the
  // initial render without every call site needing to know that.
  return {
    ...result,
    rerender: (nextNode: ReactNode) => result.rerender(wrapped(nextNode)),
  };
}
