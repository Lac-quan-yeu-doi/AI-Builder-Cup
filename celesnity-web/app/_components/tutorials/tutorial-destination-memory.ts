const STORAGE_PREFIX = 'celesnity:tutorial-destination:';

function hasDynamicSegment(destinationHref: string): boolean {
  try {
    return new URL(destinationHref, window.location.href).pathname
      .split('/')
      .some((segment) => segment.startsWith(':'));
  } catch {
    return false;
  }
}

function matchesPattern(patternHref: string, concreteHref: string): boolean {
  try {
    const pattern = new URL(patternHref, window.location.href);
    const concrete = new URL(concreteHref, window.location.href);
    const patternSegments = pattern.pathname.replace(/\/+$/, '').split('/');
    const concreteSegments = concrete.pathname.replace(/\/+$/, '').split('/');

    return (
      pattern.origin === concrete.origin &&
      patternSegments.length === concreteSegments.length &&
      patternSegments.every((segment, index) => {
        const concreteSegment = concreteSegments[index] ?? '';
        return segment.startsWith(':')
          ? concreteSegment.length > 0 && !concreteSegment.startsWith(':')
          : segment === concreteSegment;
      }) &&
      (pattern.search.length === 0 || pattern.search === concrete.search)
    );
  } catch {
    return false;
  }
}

function storageKey(destinationHref: string): string {
  return `${STORAGE_PREFIX}${destinationHref}`;
}

/** Remembers the real resource route represented by a published route template. */
export function rememberTutorialDestination(
  destinationHref: string,
  concreteHref = window.location.href,
): void {
  if (!hasDynamicSegment(destinationHref) || !matchesPattern(destinationHref, concreteHref)) return;

  try {
    const concrete = new URL(concreteHref, window.location.href);
    window.localStorage.setItem(
      storageKey(destinationHref),
      `${concrete.pathname}${concrete.search}${concrete.hash}`,
    );
  } catch {
    // Route memory improves resume behavior but cannot be allowed to interrupt
    // an otherwise valid Workspace navigation when storage is unavailable.
  }
}

/** Resolves a route template without ever navigating to a literal `:segment`. */
export function resolveTutorialDestination(destinationHref: string): string {
  if (!hasDynamicSegment(destinationHref)) return destinationHref;

  try {
    const remembered = window.localStorage.getItem(storageKey(destinationHref));
    return remembered !== null && matchesPattern(destinationHref, remembered)
      ? remembered
      : '/catalog/databases';
  } catch {
    return '/catalog/databases';
  }
}
