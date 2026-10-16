/**
 * A minimal three-state async wrapper used by every catalog panel and tree
 * node. `undefined` (outside this type) is reserved for "not requested yet".
 */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'loaded'; readonly data: T };
