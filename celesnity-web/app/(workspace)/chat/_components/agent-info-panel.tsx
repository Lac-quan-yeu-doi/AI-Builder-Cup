'use client';

import { useCallback, useEffect, useState } from 'react';

import { BotIcon, CheckIcon, CloseIcon } from '@/app/_components/ui/icons';
import { useTranslation } from '@/app/_i18n/use-translation';
import { CSRF_COOKIE } from '@/src/entities/models/session';

interface AgentInfoPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface AgentManifest {
  name: string;
  description: string;
  system_prompt: unknown;
  tools: { mode: string };
  execution: { mode: string; max_iterations: number };
  mcp_servers: Record<string, unknown>;
  action_approvals: Record<string, boolean>;
  tags: string[];
}

interface GovernanceSummary {
  policy_revision: string;
  admitted_at: string;
  policy: {
    autonomy: string;
    autoApprovals?: readonly string[];
    sensitiveFiles: string;
    sandbox: { enabled: boolean; allowedCommandCount: number; writablePathCount: number };
    budget: {
      maxInputTokens: number;
      maxOutputTokens: number;
      maxToolCalls: number;
      maxCostUsd: number | null;
    };
  };
}

interface McpServerStatus {
  agent: string;
  attempts: number;
  kind: 'stdio' | 'remote';
  server: string;
  state: 'connecting' | 'ready' | 'degraded' | 'unavailable' | 'closed';
  tool_count: number;
}

interface McpToolDescriptor {
  name: string;
  description: string;
}

/** Reads the CSRF cookie the `/api/agent/*` proxy route requires on every
 * mutating request (see `validMutationRequest` in
 * `app/api/agent/[...path]/route.ts`) — a normal DI-controller write gets
 * this attached automatically inside `CoreApiClient`, but this panel talks
 * to the proxy directly, so it has to attach it itself. */
function readCsrfCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * The manifest editor's content, without the modal chrome around it — reused
 * by `AgentInfoPanel` (the modal) and by `stage/document-pane.tsx` (the Stage
 * pane), so both render exactly the same fetch/edit/save behavior. `onClose`
 * is optional: the modal passes it for its header's close button, the pane
 * omits it since the Stage's own pane header already has a close control.
 */
export function AgentInfoContent({ onClose }: { readonly onClose?: () => void }) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<AgentManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [governance, setGovernance] = useState<GovernanceSummary | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
  const [mcpTools, setMcpTools] = useState<Record<string, McpToolDescriptor[]>>({});

  const fetchManifest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/agent-manifests/chat-assistant');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setManifest(data);
      const governanceResponse = await fetch(
        '/api/agent/agent-manifests/chat-assistant/governance',
      );
      if (governanceResponse.ok)
        setGovernance((await governanceResponse.json()) as GovernanceSummary);
      try {
        const mcpResponse = await fetch('/api/agent/mcp/servers');
        if (!mcpResponse.ok) return;
        const servers = (await mcpResponse.json()) as McpServerStatus[];
        setMcpServers(servers);
        const toolResults = await Promise.all(
          servers
            .filter((server) => server.agent === data.name && server.state === 'ready')
            .map(async (server) => {
              const toolsResponse = await fetch(
                `/api/agent/mcp/servers/${encodeURIComponent(server.server)}/tools?agent=${encodeURIComponent(server.agent)}`,
              );
              if (!toolsResponse.ok) return [server.server, []] as const;
              return [server.server, (await toolsResponse.json()) as McpToolDescriptor[]] as const;
            }),
        );
        setMcpTools(Object.fromEntries(toolResults));
      } catch {
        setMcpServers([]);
        setMcpTools({});
      }
    } catch {
      setError('Failed to load agent manifest');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchManifest raises its own loading flag before the first await; mounting this content is the external event it synchronizes with
    void fetchManifest();
  }, [fetchManifest]);

  const saveManifest = async (updated: AgentManifest) => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const csrf = readCsrfCookie();
      const res = await fetch('/api/agent/agent-manifests/chat-assistant', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Save failed (${res.status})`);
      }
      const data = await res.json();
      setManifest(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const systemPromptText =
    typeof manifest?.system_prompt === 'string' ? manifest.system_prompt : '';

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t('chat.agentInfo.title')}</h2>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1 text-caption font-medium text-status-success-dark">
              <CheckIcon size={14} />
              Saved
            </span>
          )}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid size-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('chat.agentInfo.close')}
            >
              <CloseIcon size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <p className="text-sm text-muted-foreground">Loading manifest…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {manifest && (
          <div className="flex flex-col gap-5">
            {/* Agent identity */}
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-status-success-light text-status-success-dark">
                <BotIcon size={20} />
              </div>
              <div>
                <p className="m-0 text-sm font-semibold text-foreground">{manifest.name}</p>
                <p className="m-0 text-caption text-muted-foreground">
                  v{manifest.execution.max_iterations} iterations · {manifest.execution.mode}
                </p>
              </div>
            </div>

            {/* Description (editable) */}
            <div>
              <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <textarea
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-caption leading-relaxed text-foreground focus:border-status-success/30 focus:outline-none"
                rows={3}
                value={manifest.description}
                onChange={(e) => setManifest({ ...manifest, description: e.target.value })}
              />
            </div>

            {/* System Prompt (collapsible editor) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  System Prompt
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!editingPrompt) setPromptDraft(systemPromptText);
                    setEditingPrompt(!editingPrompt);
                  }}
                  className="cursor-pointer border-0 bg-transparent text-caption font-medium text-primary hover:text-primary/80"
                >
                  {editingPrompt ? 'Cancel' : 'Edit'}
                </button>
              </div>
              {editingPrompt ? (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea
                    className="w-full rounded-lg border border-border px-3 py-2 font-mono text-caption leading-relaxed text-foreground focus:border-status-success/30 focus:outline-none"
                    rows={12}
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const updated = {
                        ...manifest,
                        system_prompt: promptDraft,
                      };
                      void saveManifest(updated as unknown as AgentManifest);
                      setEditingPrompt(false);
                    }}
                    className="self-end rounded-lg bg-primary px-3 py-1.5 text-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Prompt'}
                  </button>
                </div>
              ) : (
                <p className="mt-1 max-h-[100px] overflow-hidden text-ellipsis rounded-lg bg-muted px-3 py-2 text-caption leading-relaxed text-muted-foreground">
                  {systemPromptText.slice(0, 200)}
                  {systemPromptText.length > 200 && '…'}
                </p>
              )}
            </div>

            {/* Execution settings */}
            <div>
              <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                Execution
              </label>
              <div className="mt-1.5 flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-border px-2 py-1.5 text-caption text-foreground"
                  value={manifest.execution.mode}
                  onChange={(e) =>
                    setManifest({
                      ...manifest,
                      execution: { ...manifest.execution, mode: e.target.value },
                    })
                  }
                >
                  <option value="interactive">Interactive</option>
                  <option value="autonomous">Autonomous</option>
                </select>
                <input
                  type="number"
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-caption text-foreground"
                  value={manifest.execution.max_iterations}
                  min={1}
                  max={200}
                  onChange={(e) =>
                    setManifest({
                      ...manifest,
                      execution: {
                        ...manifest.execution,
                        max_iterations: parseInt(e.target.value, 10) || 50,
                      },
                    })
                  }
                />
                <span className="self-center text-micro text-muted-foreground">max iter</span>
              </div>
            </div>

            {governance && (
              <div className="rounded-lg border border-status-success/30 bg-status-success-light p-3">
                <div className="flex items-center justify-between">
                  <label className="text-caption font-semibold uppercase tracking-wider text-status-success-dark">
                    Governance
                  </label>
                  <span className="font-mono text-micro text-status-success-dark">
                    {governance.policy_revision.slice(0, 12)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-caption text-muted-foreground">
                  <span>Autonomy: {governance.policy.autonomy}</span>
                  <span>Auto approvals: {governance.policy.autoApprovals?.length ?? 0}</span>
                  <span>Sensitive files: {governance.policy.sensitiveFiles}</span>
                  <span>Tool calls: {governance.policy.budget.maxToolCalls}</span>
                  <span>Sandbox: {governance.policy.sandbox.enabled ? 'enabled' : 'disabled'}</span>
                </div>
                <p className="m-0 mt-2 text-micro text-muted-foreground">
                  Policy changes apply to new runs only.
                </p>
              </div>
            )}

            {/* Tools */}
            <div>
              <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                Tools ({manifest.tools.mode})
              </label>
              <div className="mt-1.5 flex flex-col gap-1">
                {Object.keys(manifest.mcp_servers).map((server) => (
                  <div key={server} className="rounded-lg border border-border px-3 py-2">
                    {(() => {
                      const status = mcpServers.find(
                        (entry) => entry.agent === manifest.name && entry.server === server,
                      );
                      const tools = mcpTools[server] ?? [];
                      return (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="m-0 text-caption font-medium text-foreground">{server}</p>
                            <span
                              className={`text-micro font-medium ${
                                status?.state === 'ready'
                                  ? 'text-status-success-dark'
                                  : 'text-status-warning-dark'
                              }`}
                            >
                              {status?.state ?? 'not connected'}
                            </span>
                          </div>
                          <p className="m-0 mt-1 text-micro text-muted-foreground">
                            {status?.tool_count ?? 0} discovered tool
                            {status?.tool_count === 1 ? '' : 's'}
                          </p>
                          {tools.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {tools.map((tool) => (
                                <span
                                  key={tool.name}
                                  title={tool.description}
                                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-micro text-muted-foreground"
                                >
                                  {tool.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Approvals */}
            <div>
              <label className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                Action Approvals
              </label>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {Object.entries(manifest.action_approvals).map(([action, required]) => (
                  <label
                    key={action}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-caption text-foreground">{action}</span>
                    <input
                      type="checkbox"
                      checked={required}
                      className="accent-primary"
                      onChange={(e) =>
                        setManifest({
                          ...manifest,
                          action_approvals: {
                            ...manifest.action_approvals,
                            [action]: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Save button */}
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveManifest(manifest)}
              className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function AgentInfoPanel({ open, onClose }: AgentInfoPanelProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[380px] flex-col bg-card shadow-xl">
        <AgentInfoContent onClose={onClose} />
      </aside>
    </div>
  );
}
