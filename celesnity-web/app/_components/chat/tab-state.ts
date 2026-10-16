/**
 * The states an async, lazily-loaded panel section moves through — shared by
 * the run inspector's tabs and the run-files browser (in both the chat run
 * inspector and the automation-workflow run details). App-wide so a single
 * route segment doesn't own a type another route legitimately reuses.
 */
export type TabState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly data: T }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string };
