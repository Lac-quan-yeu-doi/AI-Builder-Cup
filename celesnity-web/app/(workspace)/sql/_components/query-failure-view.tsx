'use client';

import type { QueryFailure } from '@/src/entities/models/query';

interface QueryFailureViewProps {
  readonly failure: QueryFailure;
}

export function QueryFailureView({ failure }: QueryFailureViewProps) {
  return (
    <section
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-[18px] text-destructive"
      role="alert"
      aria-labelledby="query-failure-heading"
    >
      <div className="mb-[14px] flex items-center gap-3">
        <span
          className="grid size-[30px] flex-none place-items-center rounded-md bg-destructive/15 text-body-md font-semibold text-destructive"
          aria-hidden="true"
        >
          !
        </span>
        <div>
          <h3 className="m-0 text-body-md" id="query-failure-heading">
            Query failed
          </h3>
          <span className="mt-[3px] inline-block font-mono text-micro font-[750] tracking-[0.02em]">
            {failure.code}
          </span>
        </div>
      </div>
      <pre className="m-0 max-h-[260px] overflow-auto rounded-md bg-card px-[14px] py-3 font-mono text-caption leading-[1.55] break-words whitespace-pre-wrap text-destructive">
        {failure.message}
      </pre>
      {failure.location ? (
        <p className="mt-3 mb-0 text-caption font-[650]">
          Source location: line {failure.location.line}, column {failure.location.column}
        </p>
      ) : null}
    </section>
  );
}
