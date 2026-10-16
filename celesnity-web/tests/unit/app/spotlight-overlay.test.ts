// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SpotlightOverlay,
  type SpotlightTargetStatusChange,
} from '@/app/_components/tutorials/spotlight-overlay';
import { renderUi as render } from '@/tests/support/render-ui';
function rect(values: {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}): DOMRect {
  return {
    ...values,
    right: values.left + values.width,
    bottom: values.top + values.height,
    x: values.left,
    y: values.top,
    toJSON: () => ({}),
  };
}
class ResizeObserverTestDouble {
  static instances: ResizeObserverTestDouble[] = [];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverTestDouble.instances.push(this);
  }
  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}
const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;
function setReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
function observedBy(element: Element): ResizeObserverTestDouble | undefined {
  return ResizeObserverTestDouble.instances.find((observer) =>
    observer.observe.mock.calls.some(([observed]) => observed === element),
  );
}
beforeEach(() => {
  document.body.replaceChildren();
  ResizeObserverTestDouble.instances = [];
  globalThis.ResizeObserver = ResizeObserverTestDouble as unknown as typeof ResizeObserver;
  setReducedMotion(false);
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});
describe('SpotlightOverlay', () => {
  it('omits all page dimming when the step has no target', () => {
    const { container } = render(
      createElement(SpotlightOverlay, {
        targetSelector: null,
        targetDescription: '',
      }),
    );
    expect(container.querySelector('[data-spotlight-overlay]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('dims the workspace around an operable target like a guided cloud walkthrough', async () => {
    const target = document.createElement('button');
    target.id = 'run-query';
    target.setAttribute('aria-describedby', 'existing-help');
    const activate = vi.fn();
    target.addEventListener('click', activate);
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn() });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 120, left: 160, width: 180, height: 44 }),
    );
    document.body.append(target);
    const { container, unmount } = render(
      createElement(SpotlightOverlay, {
        targetSelector: '#run-query',
        targetDescription: 'Run query button highlighted',
      }),
    );
    await waitFor(() => expect(container.querySelector('[data-spotlight-overlay]')).not.toBeNull());
    const overlay = container.querySelector('[data-spotlight-overlay]');
    const targetCutout = container.querySelector('[data-spotlight-cutout="target"]');
    expect(overlay?.classList.contains('pointer-events-none')).toBe(true);
    expect(overlay?.classList.contains('z-40')).toBe(true);
    expect(container.querySelector('[data-spotlight-dimmer]')).not.toBeNull();
    expect(targetCutout?.getAttribute('x')).toBe('156');
    expect(targetCutout?.getAttribute('y')).toBe('116');
    expect(targetCutout?.getAttribute('width')).toBe('188');
    expect(targetCutout?.getAttribute('height')).toBe('52');
    expect(screen.getByRole('status').textContent).toBe('Run query button highlighted');
    expect(target.getAttribute('aria-describedby')).toMatch(/^existing-help spotlight-/);
    fireEvent.click(target);
    expect(activate).toHaveBeenCalledOnce();
    expect(target.parentElement).toBe(document.body);
    unmount();
    expect(target.getAttribute('aria-describedby')).toBe('existing-help');
  });
  it('realigns from target ResizeObserver measurements', async () => {
    const target = document.createElement('button');
    target.id = 'moving-target';
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn() });
    const getTargetRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rect({ top: 40, left: 30, width: 100, height: 32 }));
    document.body.append(target);
    const { container } = render(
      createElement(SpotlightOverlay, {
        targetSelector: '#moving-target',
        targetDescription: 'Moving target highlighted',
      }),
    );
    await waitFor(() =>
      expect(container.querySelector('[data-spotlight-cutout="target"]')?.getAttribute('x')).toBe(
        '26',
      ),
    );
    getTargetRect.mockReturnValue(rect({ top: 88, left: 72, width: 150, height: 36 }));
    act(() => observedBy(target)?.emit());
    await waitFor(() => {
      const cutout = container.querySelector('[data-spotlight-cutout="target"]');
      expect(cutout?.getAttribute('x')).toBe('68');
      expect(cutout?.getAttribute('y')).toBe('84');
      expect(cutout?.getAttribute('width')).toBe('158');
    });
  });
  it('uses immediate scrolling and transition overrides for reduced motion', async () => {
    setReducedMotion(true);
    const target = document.createElement('button');
    target.id = 'offscreen-target';
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 1_200, left: 20, width: 120, height: 40 }),
    );
    document.body.append(target);
    const { container } = render(
      createElement(SpotlightOverlay, {
        targetSelector: '#offscreen-target',
        targetDescription: 'Offscreen target highlighted',
      }),
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'center',
    });
    const overlay = container.querySelector('[data-spotlight-overlay]');
    expect(overlay?.classList.contains('motion-reduce:transition-none')).toBe(true);
    expect(overlay?.classList.contains('motion-reduce:duration-0')).toBe(true);
  });
  it('reports a missing target and supplies retry without applying dimming', async () => {
    const onTargetStatusChange = vi.fn<SpotlightTargetStatusChange>();
    const { container } = render(
      createElement(SpotlightOverlay, {
        onTargetStatusChange,
        targetDescription: 'Missing target',
        targetSelector: '#does-not-exist',
        targetTimeoutMs: 0,
      }),
    );
    await waitFor(() =>
      expect(onTargetStatusChange).toHaveBeenCalledWith('not-found', expect.any(Function)),
    );
    expect(container.querySelector('[data-spotlight-overlay]')).toBeNull();
  });
});

describe('SpotlightOverlay viewport integration', () => {
  it('realigns the complete target cutout after a captured workspace scroll', async () => {
    const target = document.createElement('button');
    target.id = 'scrolling-target';
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn() });
    const getTargetRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rect({ top: 160, left: 120, width: 140, height: 48 }));
    document.body.append(target);

    const { container } = render(
      createElement(SpotlightOverlay, {
        targetSelector: '#scrolling-target',
        targetDescription: 'Scrolling target highlighted',
      }),
    );
    await waitFor(() =>
      expect(container.querySelector('[data-spotlight-cutout="target"]')?.getAttribute('y')).toBe(
        '156',
      ),
    );

    getTargetRect.mockReturnValue(rect({ top: 72, left: 84, width: 140, height: 48 }));
    act(() => window.dispatchEvent(new Event('scroll')));

    await waitFor(() => {
      const cutout = container.querySelector('[data-spotlight-cutout="target"]');
      expect(cutout?.getAttribute('x')).toBe('80');
      expect(cutout?.getAttribute('y')).toBe('68');
      expect(cutout?.getAttribute('width')).toBe('148');
      expect(cutout?.getAttribute('height')).toBe('56');
    });
  });

  it('uses smooth scrolling when motion is allowed', async () => {
    const target = document.createElement('button');
    target.id = 'animated-offscreen-target';
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 1_200, left: 20, width: 120, height: 40 }),
    );
    document.body.append(target);

    render(
      createElement(SpotlightOverlay, {
        targetSelector: '#animated-offscreen-target',
        targetDescription: 'Animated target highlighted',
      }),
    );

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      }),
    );
  });
});
