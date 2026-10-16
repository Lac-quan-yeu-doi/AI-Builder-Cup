'use client';

import { TriangleAlertIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';

export interface SkillIndexPreviewProps {
  readonly name: string;
  readonly description: string;
}

/**
 * What the agent actually sees.
 *
 * `build_index()` in `celesnity-agent/.../minder-skills/src/loader.rs` composes
 * the agent's entire view of the library as one line per skill:
 *
 * ```rust
 * lines.push(format!("- **{}**{}", skill.name, desc));   // desc = " — {description}"
 * ```
 *
 * That line is the whole basis for whether a skill gets loaded. The body never
 * enters the decision. Showing the line as it will be composed says more about
 * what the description field is for than any hint text can, and it is free —
 * both halves are already in the form.
 */
export function SkillIndexPreview({ name, description }: SkillIndexPreviewProps) {
  const { t } = useTranslation();
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const displayName = trimmedName === '' ? t('skills.indexPreviewNamePlaceholder') : trimmedName;

  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-caption text-muted-foreground">{t('skills.indexPreviewLabel')}</p>
      <p className="mt-1 font-mono text-caption break-words text-foreground">
        <span aria-hidden="true">- </span>
        <span className="font-semibold">{displayName}</span>
        {trimmedDescription === '' ? null : <span> — {trimmedDescription}</span>}
      </p>
      {trimmedDescription === '' ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-caption text-status-warning-dark">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t('skills.indexPreviewEmpty')}
        </p>
      ) : null}
    </div>
  );
}
