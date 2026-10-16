export interface CatalogTutorial {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly status: string;
}

/** Complete published metadata returned by the access-filtered catalog port. */
export interface PublishedCatalogTutorial {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

export interface CatalogViewState<TStatus extends string = string> {
  readonly search: string;
  readonly filters: readonly TStatus[];
  readonly scrollTop: number;
}

/** Resets every catalog view control to the beginning of the unfiltered list. */
export function clearCatalogViewState<TStatus extends string>(
  state: CatalogViewState<TStatus>,
): CatalogViewState<TStatus> {
  return {
    ...state,
    search: '',
    filters: [],
    scrollTop: 0,
  };
}

/** Removes surrounding whitespace while preserving the submitted letter case. */
export function normalizeSearchTerm(raw: string): string {
  return raw.trim();
}

/**
 * Filters tutorials by a case-insensitive metadata match and selected statuses.
 * Search and status filtering are conjunctive; selected statuses are alternatives
 * within the status filter. Empty search and status filters represent the clear
 * action and restore the original catalog in its original order.
 */
export function filterCatalog<T extends CatalogTutorial>(
  tutorials: readonly T[],
  searchTerm: string,
  statusFilters: readonly T['status'][],
): readonly T[] {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm).toLowerCase();

  if (normalizedSearchTerm.length === 0 && statusFilters.length === 0) {
    return tutorials;
  }

  const activeStatuses = new Set<string>(statusFilters);

  return tutorials.filter((tutorial) => {
    const matchesSearch =
      normalizedSearchTerm.length === 0 ||
      tutorial.title.toLowerCase().includes(normalizedSearchTerm) ||
      tutorial.summary.toLowerCase().includes(normalizedSearchTerm) ||
      tutorial.category.toLowerCase().includes(normalizedSearchTerm);
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(tutorial.status);

    return matchesSearch && matchesStatus;
  });
}
