'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Copy } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/app/_components/ui/card';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { TextareaField, TextField } from '@/app/_components/ui/fields';
import { SearchField } from '@/app/_components/ui/search-field';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import { readAutoApprovalActions, writeAutoApprovalActions } from './agent-auto-approvals';
import type { AgentManifest, AgentManifestSummary } from '@/src/entities/models/agent-manifest';
import type { DeleteAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/delete-agent-manifest.controller';
import type { GetAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/get-agent-manifest.controller';
import type { ListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';
import type { SaveAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/save-agent-manifest.controller';
import type { ValidateAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/validate-agent-manifest.controller';

export interface AgentManifestsPanelProps {
  readonly listAgentManifests: ListAgentManifestsController;
  readonly getAgentManifest: GetAgentManifestController;
  readonly saveAgentManifest: SaveAgentManifestController;
  readonly validateAgentManifest: ValidateAgentManifestController;
  readonly deleteAgentManifest: DeleteAgentManifestController;
}

type Mode = 'view' | 'create';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const EMPTY_YAML =
  '# Copy this manifest into Administration -> Agents, then change `name` and\n' +
  '# the matching Agent name field before validating and saving.\n' +
  'name: new-agent\n' +
  'description: Describe what this agent does.\n\n' +
  'model: {}\n\n' +
  'system_prompt: |\n' +
  '  You are a helpful assistant. Describe the job, tone, safety rules, and\n' +
  '  output format this agent must follow.\n\n' +
  'tools:\n' +
  '  mode: allowlist\n' +
  '  names: []\n\n' +
  'working_dir: .\n\n' +
  'execution:\n' +
  '  mode: interactive\n' +
  '  max_iterations: 8\n\n' +
  'handoff:\n' +
  '  can_delegate_to: []\n' +
  '  accepts_from: []\n\n' +
  'tags: []\n' +
  'mcp_servers: {}\n' +
  'client_tools: []\n' +
  'action_approvals: {}\n\n' +
  'governance:\n' +
  '  action_approvals: {}\n' +
  '  auto_approvals: []\n' +
  '  autonomy: manual\n' +
  '  sandbox:\n' +
  '    enabled: false\n' +
  '    allowed_commands: []\n' +
  '    writable_paths: []\n' +
  '  sensitive_files: deny\n' +
  '  budget:\n' +
  '    max_input_tokens: 128000\n' +
  '    max_output_tokens: 16384\n' +
  '    max_tool_calls: 50\n' +
  '    max_cost_usd: null\n\n' +
  'skills: []\n';

export function AgentManifestsPanel({
  listAgentManifests,
  getAgentManifest,
  saveAgentManifest,
  validateAgentManifest,
  deleteAgentManifest,
}: AgentManifestsPanelProps) {
  const { t } = useTranslation();
  const [manifests, setManifests] = useState<readonly AgentManifestSummary[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentManifest | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [name, setName] = useState('');
  const [yaml, setYaml] = useState('');
  const [autoApprovalActions, setAutoApprovalActions] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<AgentManifest | null>(null);
  const [search, setSearch] = useState('');
  const requestToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void listAgentManifests()
      .then((loaded) => {
        if (cancelled) return;
        setManifests(loaded);
        if (loaded[0] && requestToken.current === 0) void selectManifest(loaded[0].name);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, t('agentManagement.loadError')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The controller is injected once by the feature boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    const loaded = await listAgentManifests();
    setManifests(loaded);
    return loaded;
  }

  async function selectManifest(agentName: string) {
    const token = requestToken.current + 1;
    requestToken.current = token;
    setMode('view');
    setSelectedName(agentName);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    setValidation(null);
    try {
      const loaded = await getAgentManifest(agentName);
      if (token !== requestToken.current) return;
      setDetail(loaded);
      setName(loaded.name);
      setYaml(loaded.yaml);
      setAutoApprovalActions(readAutoApprovalActions(loaded.yaml));
    } catch (cause: unknown) {
      if (token === requestToken.current)
        setError(errorMessage(cause, t('agentManagement.detailError')));
    } finally {
      if (token === requestToken.current) setDetailLoading(false);
    }
  }

  function selectCreate() {
    requestToken.current += 1;
    setMode('create');
    setSelectedName(null);
    setDetail(null);
    setName('new-agent');
    setYaml(EMPTY_YAML);
    setAutoApprovalActions(readAutoApprovalActions(EMPTY_YAML));
    setError(null);
    setNotice(null);
    setValidation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!NAME_PATTERN.test(name)) {
      setError(t('agentManagement.invalidName'));
      return;
    }
    if (yaml.trim() === '') {
      setError(t('agentManagement.emptyYaml'));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveAgentManifest({ name, yaml });
      const loaded = await reload();
      setMode('view');
      setSelectedName(saved.name);
      setDetail(saved);
      setName(saved.name);
      setYaml(saved.yaml);
      setValidation(null);
      setNotice(t(mode === 'create' ? 'agentManagement.created' : 'agentManagement.saved'));
      setManifests(loaded);
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('agentManagement.saveError')));
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (yaml.trim() === '') {
      setError(t('agentManagement.emptyYaml'));
      return;
    }
    setValidating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await validateAgentManifest(yaml);
      setValidation(result);
      setNotice(t('agentManagement.valid'));
    } catch (cause: unknown) {
      setValidation(null);
      setError(errorMessage(cause, t('agentManagement.validationError')));
    } finally {
      setValidating(false);
    }
  }

  async function copyYaml() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setError(t('agentManagement.copyError'));
      return;
    }
    try {
      await navigator.clipboard.writeText(yaml);
      setError(null);
      setNotice(t('agentManagement.copiedYaml'));
    } catch {
      setError(t('agentManagement.copyError'));
    }
  }

  async function remove() {
    if (
      !selectedName ||
      !window.confirm(t('agentManagement.deleteConfirm', { name: selectedName }))
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAgentManifest(selectedName);
      const loaded = await reload();
      const next = loaded[0];
      if (next) await selectManifest(next.name);
      else {
        setSelectedName(null);
        setDetail(null);
        setMode('view');
        setName('');
        setYaml('');
        setAutoApprovalActions([]);
      }
      setNotice(t('agentManagement.deleted'));
    } catch (cause: unknown) {
      setError(errorMessage(cause, t('agentManagement.deleteError')));
    } finally {
      setDeleting(false);
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleManifests = manifests?.filter((manifest) => {
    if (!normalizedSearch) return true;
    return (
      manifest.name.toLocaleLowerCase().includes(normalizedSearch) ||
      manifest.description.toLocaleLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 min-[1081px]:h-[calc(100vh-2.5rem)] min-[1081px]:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
      <Card asChild className="min-h-0 min-w-0 gap-0 overflow-hidden rounded-2xl py-0">
        <section aria-label={t('agentManagement.listTitle')}>
          <CardHeader className="gap-2 border-b px-6 py-5 [.border-b]:pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">
                  {t('agentManagement.title')}
                </h1>
                <CardDescription>{t('agentManagement.subtitle')}</CardDescription>
              </div>
              <Button size="sm" onClick={selectCreate} disabled={saving || deleting}>
                {t('agentManagement.create')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <SearchField
              aria-label={t('agentManagement.search')}
              onChange={(event) => setSearch(event.currentTarget.value)}
              onClear={() => setSearch('')}
              placeholder={t('agentManagement.searchPlaceholder')}
              value={search}
            />
            <div className="mt-5 mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('agentManagement.listTitle')}
              </h2>
              {!loading && manifests ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t(
                    visibleManifests?.length === 1
                      ? 'agentManagement.count_one'
                      : 'agentManagement.count_other',
                    {
                      count: visibleManifests?.length ?? 0,
                    },
                  )}
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner />
                {t('agentManagement.loading')}
              </div>
            ) : null}
            {!loading && manifests?.length === 0 ? (
              <EmptyBlock
                title={t('agentManagement.empty')}
                description={t('agentManagement.emptyDescription')}
              />
            ) : null}
            {!loading && manifests && manifests.length > 0 && visibleManifests?.length === 0 ? (
              <EmptyBlock
                title={t('agentManagement.noMatches')}
                description={t('agentManagement.noMatchesDescription')}
              />
            ) : null}
            {!loading && visibleManifests && visibleManifests.length > 0 ? (
              <div className="grid gap-1" role="list" aria-label={t('agentManagement.listTitle')}>
                {visibleManifests.map((manifest) => (
                  <div className="min-w-0" key={manifest.name} role="listitem">
                    <button
                      type="button"
                      aria-pressed={selectedName === manifest.name}
                      className={`group flex w-full min-w-0 items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors ${
                        selectedName === manifest.name
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-transparent hover:border-border hover:bg-accent/60'
                      }`}
                      onClick={() => void selectManifest(manifest.name)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                        <span className="block truncate text-sm font-medium">{manifest.name}</span>
                        <span
                          className="block truncate text-xs text-muted-foreground"
                          title={manifest.description}
                        >
                          {manifest.description || t('agentManagement.noDescription')}
                        </span>
                        <span className="block truncate font-mono text-micro text-muted-foreground/80">
                          {manifest.skills.length > 0
                            ? manifest.skills.join(' · ')
                            : t('agentManagement.noSkills')}
                        </span>
                      </span>
                      <Badge variant="outline" className="mt-0.5 shrink-0">
                        {t('agentManagement.workspace')}
                      </Badge>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </section>
      </Card>

      <Card asChild className="min-h-0 min-w-0 gap-0 overflow-hidden rounded-2xl py-0">
        <section aria-label={t('agentManagement.editorTitle')}>
          <CardHeader className="gap-2 border-b px-6 py-5 [.border-b]:pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="truncate text-xl font-semibold tracking-tight">
                  {mode === 'create'
                    ? t('agentManagement.createTitle')
                    : (detail?.name ?? t('agentManagement.editorTitle'))}
                </h2>
                <CardDescription>{t('agentManagement.editorDescription')}</CardDescription>
              </div>
              {mode === 'view' && detail ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{t('agentManagement.yamlFormat')}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deleting || saving}
                    onClick={() => void copyYaml()}
                  >
                    <Copy aria-hidden="true" />
                    {t('agentManagement.copyYaml')}
                  </Button>
                  <Button
                    variant="destructive-ghost"
                    size="sm"
                    disabled={deleting || saving}
                    onClick={() => void remove()}
                  >
                    {deleting ? <Spinner /> : null}
                    {t('agentManagement.delete')}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-6 py-5">
            {error ? (
              <div
                className="mb-4 shrink-0 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}
            {notice ? (
              <div
                className="mb-4 shrink-0 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
                role="status"
              >
                {notice}
              </div>
            ) : null}
            {detailLoading ? (
              <div
                className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <Spinner />
                {t('agentManagement.loadingDetail')}
              </div>
            ) : null}
            {!detailLoading && mode === 'view' && !detail ? (
              <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-dashed border-primary/20 bg-primary/5 p-8 text-center">
                <div className="grid max-w-sm justify-items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-background text-foreground shadow-xs">
                    <Bot aria-hidden="true" size={22} />
                  </div>
                  <div className="grid gap-1.5">
                    <h3 className="text-base font-medium">{t('agentManagement.selectTitle')}</h3>
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                      {t('agentManagement.selectDescription')}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            {!detailLoading && (mode === 'create' || detail) ? (
              <form
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5"
                onSubmit={(event) => void submit(event)}
              >
                <TextField
                  className="shrink-0"
                  label={t('agentManagement.name')}
                  value={name}
                  disabled={mode === 'view' || saving}
                  onChange={(event) => setName(event.currentTarget.value)}
                  hint={t('agentManagement.nameHint')}
                />
                {detail ? (
                  <section
                    aria-label={t('agentManagement.configuration')}
                    className="shrink-0 rounded-lg border border-border bg-muted/40 px-4 py-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t('agentManagement.configurationDescription')}
                    </p>
                    <dl className="mt-2 grid gap-2 min-[640px]:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-muted-foreground">
                          {t('agentManagement.sourcePath')}
                        </dt>
                        <dd className="truncate font-mono text-xs text-foreground">
                          {detail.sourcePath}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-muted-foreground">
                          {t('agentManagement.skills')}
                        </dt>
                        <dd className="truncate text-sm text-foreground">
                          {detail.skills.length > 0
                            ? detail.skills.join(' · ')
                            : t('agentManagement.noSkills')}
                        </dd>
                      </div>
                    </dl>
                  </section>
                ) : null}
                <TextareaField
                  label={t('agentManagement.autoApprovals')}
                  value={autoApprovalActions.join('\n')}
                  disabled={saving || validating}
                  onChange={(event) => {
                    const actions = event.currentTarget.value.split('\n');
                    setAutoApprovalActions(actions);
                    setYaml((current) => writeAutoApprovalActions(current, actions));
                    setValidation(null);
                  }}
                  textareaClassName="min-h-24 font-mono text-xs leading-relaxed"
                  spellCheck={false}
                  hint={t('agentManagement.autoApprovalsHint')}
                />
                <TextareaField
                  label={t('agentManagement.yaml')}
                  value={yaml}
                  disabled={saving || validating}
                  onChange={(event) => {
                    const nextYaml = event.currentTarget.value;
                    setYaml(nextYaml);
                    setAutoApprovalActions(readAutoApprovalActions(nextYaml));
                    setValidation(null);
                  }}
                  textareaClassName="min-h-[28rem] font-mono text-xs leading-relaxed"
                  spellCheck={false}
                  hint={t('agentManagement.yamlHint')}
                />
                {validation ? (
                  <div className="rounded-md border border-status-success/30 bg-status-success-light px-3 py-2 text-body-sm text-status-success-dark">
                    {t('agentManagement.validatedAs', { name: validation.name })}
                  </div>
                ) : null}
                <div className="sticky bottom-0 -mx-6 mt-auto flex flex-wrap justify-end gap-2 border-t border-border bg-card px-6 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || validating}
                    onClick={() => void validate()}
                  >
                    {validating ? <Spinner /> : null}
                    {t('agentManagement.validate')}
                  </Button>
                  <Button type="submit" disabled={saving || validating}>
                    {saving ? <Spinner /> : null}
                    {t('agentManagement.save')}
                  </Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </section>
      </Card>
    </div>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
