'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { PlusIcon, SparklesIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/_components/ui/alert-dialog';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/app/_components/ui/card';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import type { CreateSkillController } from '@/src/interface-adapters/controllers/skills/create-skill.controller';
import type { DeleteSkillController } from '@/src/interface-adapters/controllers/skills/delete-skill.controller';
import type { GetSkillController } from '@/src/interface-adapters/controllers/skills/get-skill.controller';
import type { ListSkillsController } from '@/src/interface-adapters/controllers/skills/list-skills.controller';
import type { UpdateSkillController } from '@/src/interface-adapters/controllers/skills/update-skill.controller';
import type { CreateSkillInput, SkillDetail, SkillSummary } from '@/src/entities/models/skill';

import { useAssistantDock } from '@/app/_components/assistant/use-assistant-dock';

import { SkillsChatPanel } from './skills-chat-panel';
import { SkillDetailPane } from './skill-detail-pane';
import { SkillLibrary } from './skill-library';
export interface SkillsControllers {
  readonly list: ListSkillsController;
  readonly get: GetSkillController;
  readonly create: CreateSkillController;
  readonly update: UpdateSkillController;
  readonly delete: DeleteSkillController;
}

interface SkillsScreenProps {
  readonly controllers: SkillsControllers;
}

type SkillForm = CreateSkillInput;

type ScreenMode = 'view' | 'create';

type FieldErrors = Partial<Record<keyof SkillForm, string>>;

// Mirror the minder-agent backend contract: a skill file name is written to
// disk as `{name}.md`, so it must match this exact pattern (see
// minder-skills loader `is_valid_skill_name`). description/namespace become
// frontmatter lines, so neither may contain a newline.
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

const emptyForm: SkillForm = {
  name: '',
  description: '',
  namespace: '',
  body: '',
};

export function SkillsScreen({ controllers }: SkillsScreenProps) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<readonly SkillSummary[] | null>(null);
  const assistant = useAssistantDock('skills', false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [mode, setMode] = useState<ScreenMode>('view');
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<SkillSummary | SkillDetail | null>(null);
  const detailRequestToken = useRef(0);
  // What Cancel goes back to. Creating used to drop you on the empty state even
  // though you had a skill open when you started.
  const selectionBeforeCreate = useRef<string | null>(null);

  // Reload the list without disturbing the currently selected skill or the
  // detail pane — used both on mount and whenever the agent pane reports it
  // created, edited, or deleted a skill.
  const reloadSkills = useCallback(async () => {
    try {
      const loaded = await controllers.list();
      setSkills(loaded);
      setError((current) => (current === null ? current : null));
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('skills.loadError')));
    }
  }, [controllers, t]);

  useEffect(() => {
    let cancelled = false;
    void controllers
      .list()
      .then((loaded) => {
        if (!cancelled) {
          setSkills(loaded);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, t('skills.loadError')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  function selectCreate() {
    detailRequestToken.current += 1;
    selectionBeforeCreate.current = selectedName;
    setDetailLoading(false);
    setMode('create');
    setSelectedName(null);
    setDetail(null);
    setForm(emptyForm);
    setError(null);
    setNotice(null);
    setFieldErrors({});
  }

  function cancelCreate() {
    const previous = selectionBeforeCreate.current;
    selectionBeforeCreate.current = null;
    setMode('view');
    setForm(emptyForm);
    setFieldErrors({});
    setError(null);
    setNotice(null);
    if (previous !== null) void selectSkill(previous);
  }

  async function selectSkill(name: string) {
    const requestToken = detailRequestToken.current + 1;
    detailRequestToken.current = requestToken;
    setMode('view');
    setSelectedName(name);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const selected = await controllers.get(name);
      if (requestToken !== detailRequestToken.current) return;
      setDetail(selected);
      setForm(toForm(selected));
    } catch (cause: unknown) {
      if (requestToken === detailRequestToken.current) {
        setError(errorMessage(cause, t('skills.detailError')));
      }
    } finally {
      if (requestToken === detailRequestToken.current) setDetailLoading(false);
    }
  }

  function changeForm(field: keyof SkillForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // In edit mode the name is fixed to the loaded skill, so only validate a
    // caller-supplied name when creating.
    const errors = validateForm(form, mode === 'create', t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(null);
      setNotice(null);
      return;
    }
    setFieldErrors({});

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input: SkillForm =
        mode === 'create' ? form : { ...form, name: detail?.name ?? form.name };
      const saved =
        mode === 'create' ? await controllers.create(input) : await controllers.update(input);
      const refreshed = await controllers.list();
      setSkills(refreshed);
      setSelectedName(saved.name);
      setDetail(saved);
      setForm(toForm(saved));
      setMode('view');
      selectionBeforeCreate.current = null;
      setNotice(mode === 'create' ? t('skills.created') : t('skills.saved'));
    } catch (cause: unknown) {
      setError(
        errorMessage(cause, mode === 'create' ? t('skills.createError') : t('skills.saveError')),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || target.source !== 'project') return;

    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await controllers.delete(target.name);
      const refreshed = await controllers.list();
      setSkills(refreshed);
      if (selectedName === target.name) {
        setSelectedName(null);
        setDetail(null);
        setForm(emptyForm);
      }
      setNotice(t('skills.deleted'));
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('skills.deleteError')));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const editable = mode === 'create' || detail?.source === 'project';
  const busy = saving || deleting;
  const listEmpty = !loading && skills !== null && skills.length === 0;
  const listLoadFailed = error !== null && skills === null;
  const title = mode === 'create' ? t('skills.createTitle') : (detail?.name ?? null);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col xl:h-screen xl:flex-row xl:gap-4 xl:pl-4">
      {/* The query measures this element, which is what is left after the
       * assistant dock takes its 400px — the grid inside cannot query itself.
       * A viewport rule cannot see the dock at all: at 1440px with it open
       * there are 740px here, and splitting those left the editor 396px wide. */}
      <div className="@container/skills flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto @[52rem]/skills:overflow-visible">
        <div className="shrink-0 pt-5">
          {/* No subtitle. "Browse and manage project-defined skills used by
           * the agent" restated the page title and the list under it. */}
          <PageBar
            actions={
              <>
                {/* Docked on request, not a second screen. The panel costs
                 * half the width and is about the skill you have open, so it
                 * opens when asked for — the same toggle `/databases` uses,
                 * and Cmd+J still works. */}
                <Button
                  aria-pressed={assistant.open}
                  onClick={assistant.toggle}
                  size="sm"
                  variant="outline"
                >
                  <SparklesIcon aria-hidden="true" />
                  {t('assistant.toggle')}
                </Button>
                <Button disabled={busy} onClick={selectCreate} size="sm">
                  <PlusIcon aria-hidden="true" />
                  {t('skills.create')}
                </Button>
              </>
            }
            eyebrow={
              <>
                {t('nav.group.tools')} · {t('nav.skills')}
              </>
            }
            title={t('skills.title')}
          />
        </div>
        <div
          className="grid min-w-0 gap-6 py-5 @[52rem]/skills:min-h-0 @[52rem]/skills:flex-1 @[52rem]/skills:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]"
          data-skills-layout
        >
          <Card
            asChild
            // Stacked, the library is capped so the editor below it stays reachable
            // without scrolling past every skill. Split, it fills its column.
            className="max-h-[50svh] min-w-0 overflow-hidden @[52rem]/skills:max-h-none @[52rem]/skills:min-h-0"
          >
            <section aria-label={t('skills.listTitle')}>
              <CardContent className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-5">
                {/* One error, one place. A failed list load is the list's problem;
                 * everything else belongs beside the form that caused it. */}
                {listLoadFailed ? <PageAlert className="mb-4">{error}</PageAlert> : null}
                {/* No action here on purpose. `Create skill` sits in the header a
                 * few pixels above and is always visible, so a second copy of the
                 * same control would be the only two CTAs on the screen. */}
                {listEmpty ? (
                  <EmptyState
                    description={t('skills.emptyDescription')}
                    mark={<SparklesIcon />}
                    title={t('skills.empty')}
                  />
                ) : (
                  <SkillLibrary
                    busy={busy}
                    loading={loading}
                    onDelete={setDeleteTarget}
                    onQueryChange={setQuery}
                    onSelect={(name) => void selectSkill(name)}
                    query={query}
                    selectedName={selectedName}
                    skills={skills}
                  />
                )}
              </CardContent>
            </section>
          </Card>

          <Card asChild className="min-w-0 @[52rem]/skills:min-h-0 @[52rem]/skills:overflow-hidden">
            <section aria-label={t('skills.detailTitle')}>
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="truncate text-title">{title ?? t('skills.detailTitle')}</h2>
                    <CardDescription>
                      {mode === 'create'
                        ? t('skills.createDescription')
                        : detail
                          ? t('skills.detailDescription')
                          : t('skills.selectDescription')}
                    </CardDescription>
                  </div>
                  {mode === 'view' && detail ? (
                    <Badge className="mt-0.5 shrink-0" variant="secondary">
                      {detail.source === 'project' ? t('skills.project') : t('skills.global')}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex min-w-0 flex-col @[52rem]/skills:min-h-0 @[52rem]/skills:flex-1 @[52rem]/skills:overflow-hidden">
                {detailLoading ? (
                  <div
                    aria-label={t('skills.detailLoading')}
                    className="flex items-center gap-2 text-body-sm text-muted-foreground"
                    role="status"
                  >
                    <Spinner aria-hidden="true" />
                    {t('skills.detailLoading')}
                  </div>
                ) : mode === 'view' && !detail ? (
                  <>
                    {error && !listLoadFailed ? (
                      <PageAlert className="mb-4 shrink-0">{error}</PageAlert>
                    ) : null}
                    {notice ? (
                      <PageAlert
                        className="mb-4 shrink-0"
                        onDismiss={() => setNotice(null)}
                        tone="success"
                      >
                        {notice}
                      </PageAlert>
                    ) : null}
                    <EmptyState
                      description={t('skills.selectDescription')}
                      mark={<SparklesIcon />}
                      title={t('skills.selectTitle')}
                    />
                  </>
                ) : (
                  <SkillDetailPane
                    busy={busy}
                    deleting={deleting}
                    detail={detail}
                    editable={editable}
                    error={error}
                    fieldErrors={fieldErrors}
                    form={form}
                    mode={mode}
                    notice={notice}
                    onCancel={cancelCreate}
                    onChange={changeForm}
                    onDismissNotice={() => setNotice(null)}
                    onRequestDelete={() => {
                      if (detail) setDeleteTarget(detail);
                    }}
                    onSubmit={(event) => void submit(event)}
                    saving={saving}
                  />
                )}
              </CardContent>
            </section>
          </Card>
        </div>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('skills.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('skills.deleteDescription', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={deleting || undefined}
              disabled={deleting}
              // Radix closes the dialog on action by default. Hold it open so
              // the confirmation reports its own progress, and let the request
              // close it when it settles.
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              variant="destructive"
            >
              {deleting ? <Spinner aria-hidden="true" /> : null}
              {deleting ? t('skills.deleting') : t('skills.deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The panel owns its own width, breakpoint and chrome now; the screen
       * says only which skill is open, which is what the thread is keyed to. */}
      {assistant.open ? (
        <SkillsChatPanel
          onClose={assistant.hide}
          onSkillsChanged={() => void reloadSkills()}
          skillName={selectedName}
        />
      ) : null}
    </div>
  );
}

function toForm(skill: SkillDetail): SkillForm {
  return {
    name: skill.name,
    description: skill.description,
    namespace: skill.namespace,
    body: skill.body,
  };
}

function validateForm(
  form: SkillForm,
  validateName: boolean,
  t: (key: TranslationKey) => string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (validateName) {
    const name = form.name.trim();
    if (name.length === 0) {
      errors.name = t('skills.nameRequired');
    } else if (!SKILL_NAME_PATTERN.test(name)) {
      errors.name = t('skills.namePattern');
    }
  }
  if (form.description.includes('\n')) {
    errors.description = t('skills.descriptionNoNewline');
  }
  if (form.namespace.includes('\n')) {
    errors.namespace = t('skills.namespaceNoNewline');
  }
  return errors;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
