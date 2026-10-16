interface WorkspaceSectionProps {
  readonly description: string;
  readonly eyebrow: string;
  readonly nextActions: readonly string[];
  readonly title: string;
}

export function WorkspaceSection({
  description,
  eyebrow,
  nextActions,
  title,
}: WorkspaceSectionProps) {
  return (
    <section className="grid gap-9">
      <div className="max-w-[760px]">
        <span className="mb-[13px] block text-caption font-[750] tracking-[0.12em] text-primary uppercase">
          {eyebrow}
        </span>
        <h1 className="m-0 text-[clamp(2.5rem,5vw,4.7rem)] leading-[0.98] font-medium tracking-[-0.045em]">
          {title}
        </h1>
        <p className="mt-6 max-w-[660px] text-body-md leading-[1.7] text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="max-w-[720px] rounded-2xl border border-border bg-card px-7 py-[26px] shadow-300">
        <div>
          <span
            className="mr-2 inline-block size-2 rounded-full bg-primary ring-4 ring-primary/10"
            aria-hidden="true"
          />
          <span className="text-body-sm font-[750] tracking-[0.06em] text-primary uppercase">
            Foundation ready
          </span>
        </div>
        <p className="mt-5 mb-3 text-muted-foreground">
          The domain boundary is in place. The next vertical slice will add:
        </p>
        <ul className="m-0 list-disc pl-5 leading-[1.9]">
          {nextActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
