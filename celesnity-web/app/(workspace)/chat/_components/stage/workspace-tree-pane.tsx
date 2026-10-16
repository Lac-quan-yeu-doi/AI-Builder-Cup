'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
} from 'lucide-react';

import type { TranslationKey } from '@/app/_i18n/en';
import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Spinner } from '@/app/_components/ui/spinner';
import { cn } from '@/app/_components/ui/utils';
import type { RunFileEntry } from '@/src/entities/models/chat';
import type { GetWorkspaceFileContentController } from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import type { ListWorkspaceTreeController } from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';
import {
  buildTree,
  type ChangeKind,
  type WorkspaceChange,
  type WorkspaceEntry,
  type WorkspaceTreeNode,
  type WorkspaceTreeResult,
} from '@/src/entities/models/workspace-tree';

import { RunFileViewer } from '@/app/_components/chat/run-file-viewer';
import { previewPolicyFor } from '@/app/_components/chat/file-preview/file-preview-policy';
import type { PreviewKind } from '@/app/_components/chat/file-preview/file-preview.types';
import type { Artifact } from './chat-stage.types';

const CHANGE_BADGE: Readonly<Record<ChangeKind, BadgeVariant>> = {
  created: 'success',
  modified: 'warning',
  deleted: 'danger',
};

export function workspaceArtifact(t: Translator): Artifact {
  return {
    id: 'workspace:tree',
    kind: 'workspace',
    title: t('chat.workspace.title'),
    meta: t('chat.workspace.meta'),
  };
}

export interface WorkspaceTreePaneProps {
  readonly roomId: string | null;
  readonly listWorkspaceTree: ListWorkspaceTreeController;
  readonly getWorkspaceFileContent: GetWorkspaceFileContentController;
  readonly refreshSignal: number;
  readonly workspaceChanges?: readonly WorkspaceChange[];
  readonly onWorkspaceChangesReconciled?: (roomId: string) => void;
}

interface WorkspaceTreeState {
  readonly result: WorkspaceTreeResult;
  readonly nodes: readonly WorkspaceTreeNode[];
}

export function WorkspaceTreePane({
  roomId,
  listWorkspaceTree,
  getWorkspaceFileContent,
  refreshSignal,
  workspaceChanges = [],
  onWorkspaceChangesReconciled,
}: WorkspaceTreePaneProps) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<WorkspaceTreeState | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);
  const treeRef = useRef<WorkspaceTreeState | null>(null);
  const lastRefreshSignalRef = useRef(refreshSignal);

  const refresh = useCallback(async () => {
    if (roomId === null) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await listWorkspaceTree(roomId);
      if (requestId !== requestIdRef.current) return;
      const nextTree: WorkspaceTreeState = { result, nodes: buildTree(result.entries) };
      const hadTree = treeRef.current !== null;
      treeRef.current = nextTree;
      setTree(nextTree);
      onWorkspaceChangesReconciled?.(roomId);
      setSelectedPath((current) =>
        current !== null && result.entries.some((entry) => entry.path === current) ? current : null,
      );
      if (!hadTree) {
        setExpanded(
          new Set(result.entries.filter((entry) => entry.isDir).map((entry) => entry.path)),
        );
      }
      setError(false);
    } catch {
      if (requestId === requestIdRef.current) setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [listWorkspaceTree, onWorkspaceChangesReconciled, roomId]);

  useEffect(() => {
    if (roomId === null) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, roomId]);

  useEffect(() => {
    if (refreshSignal === 0 || roomId === null || refreshSignal === lastRefreshSignalRef.current) {
      return;
    }
    lastRefreshSignalRef.current = refreshSignal;
    const timer = window.setTimeout(() => void refresh(), 300);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshSignal, roomId]);

  const renderedTree = tree === null ? null : optimisticTree(tree, workspaceChanges);
  const selectedEntry =
    renderedTree?.result.entries.find((entry) => entry.path === selectedPath) ?? null;
  if (selectedEntry && roomId !== null) {
    return (
      <div className="h-full min-h-0 p-4">
        <RunFileViewer
          key={`${selectedEntry.path}:${selectedEntry.modifiedAt}`}
          runId={roomId}
          entry={toRunFileEntry(selectedEntry)}
          getRunFileContent={getWorkspaceFileContent}
          onBack={() => setSelectedPath(null)}
          t={t}
        />
      </div>
    );
  }

  if (roomId === null) {
    return <EmptyBlock title={t('chat.workspace.noRoom')} />;
  }
  if (tree === null && loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground" role="status">
        <Spinner className="size-3.5" />
        {t('chat.workspace.loading')}
      </div>
    );
  }
  if (tree === null) {
    return (
      <EmptyBlock
        title={t('chat.workspace.loadError')}
        role="alert"
        action={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner className="size-3.5" /> : <RefreshCwIcon />}
            {t('action.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-3" aria-busy={loading}>
      {loading && (
        <span className="sr-only" role="status">
          {t('chat.workspace.loading')}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t('chat.workspace.fileCount', { count: renderedTree?.result.entries.length ?? 0 })}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('chat.workspace.refresh')}
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? <Spinner className="size-3.5" /> : <RefreshCwIcon />}
        </Button>
      </div>
      {error && (
        <p className="m-0 text-xs text-destructive" role="alert">
          {t('chat.workspace.loadError')}
        </p>
      )}
      {tree.result.truncated && (
        <p className="m-0 text-xs text-muted-foreground">{t('chat.workspace.truncated')}</p>
      )}
      {renderedTree?.nodes.length === 0 ? (
        <EmptyBlock title={t('chat.workspace.empty')} />
      ) : (
        <div role="list" aria-label={t('chat.workspace.title')}>
          {renderedTree?.nodes.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={(path) =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                })
              }
              onSelectFile={setSelectedPath}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectFile,
  t,
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly onToggle: (path: string) => void;
  readonly onSelectFile: (path: string) => void;
  readonly t: ReturnType<typeof useTranslation>['t'];
}) {
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const label = node.isDir
    ? t(isExpanded ? 'chat.workspace.closeDirectory' : 'chat.workspace.openDirectory', {
        path: node.path,
      })
    : t('chat.workspace.openFile', { path: node.path });
  const changeStatus = node.changeKind ? changeLabel(t, node.changeKind) : null;
  const previewKind = node.isDir ? null : previewPolicyFor(node.path, node.mimeType).kind;
  const previewLabel =
    previewKind === null || previewKind === 'text' ? null : previewKindLabel(t, previewKind);
  const accessibleLabel = changeStatus === null ? label : `${label}, ${changeStatus}`;

  return (
    <div
      role="listitem"
      aria-current={isSelected ? 'true' : undefined}
      className={cn(node.changeKind === 'deleted' && 'opacity-50')}
    >
      <Button
        variant="ghost"
        className={cn(
          'h-8 w-full justify-start gap-1.5 px-2 text-left text-xs font-normal',
          isSelected && 'bg-accent text-foreground',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        aria-label={accessibleLabel}
        aria-expanded={node.isDir ? isExpanded : undefined}
        onClick={() => (node.isDir ? onToggle(node.path) : onSelectFile(node.path))}
      >
        {node.isDir ? (
          isExpanded ? (
            <ChevronDownIcon className="size-3.5 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3.5 shrink-0" />
          )
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {node.isDir ? (
          isExpanded ? (
            <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
        {previewLabel && (
          <span className="shrink-0 text-micro text-muted-foreground" aria-hidden="true">
            {previewLabel}
          </span>
        )}
        {node.changeKind && (
          <Badge variant={CHANGE_BADGE[node.changeKind]} aria-hidden="true">
            {changeLabel(t, node.changeKind)}
          </Badge>
        )}
      </Button>
      {node.isDir && isExpanded && (
        <div role="list">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function optimisticTree(
  tree: WorkspaceTreeState,
  changes: readonly WorkspaceChange[],
): WorkspaceTreeState {
  if (changes.length === 0) return tree;

  const entries = new Map(tree.result.entries.map((entry) => [entry.path, entry]));
  const modifiedAt = new Date().toISOString();
  for (const change of changes) {
    if (change.kind !== 'deleted' && !entries.has(change.path)) {
      entries.set(change.path, {
        path: change.path,
        isDir: false,
        modifiedAt,
      });
    }
  }

  const changeKinds = new Map(changes.map((change) => [change.path, change.kind]));
  const optimisticEntries = [...entries.values()];
  const result: WorkspaceTreeResult = {
    entries: optimisticEntries,
    truncated: tree.result.truncated,
  };
  return { result, nodes: buildTree(optimisticEntries, changeKinds) };
}

function previewKindLabel(t: (key: TranslationKey) => string, kind: PreviewKind): string | null {
  switch (kind) {
    case 'text':
      return null;
    case 'markdown':
      return t('chat.workspace.preview.type.markdown');
    case 'json':
      return t('chat.workspace.preview.type.json');
    case 'table':
      return t('chat.workspace.preview.type.table');
    case 'image':
      return t('chat.workspace.preview.type.image');
    case 'pdf':
      return t('chat.workspace.preview.type.pdf');
    case 'audio':
      return t('chat.workspace.preview.type.audio');
    case 'video':
      return t('chat.workspace.preview.type.video');
    case 'source-only':
      return t('chat.workspace.preview.type.source');
    case 'binary':
      return t('chat.workspace.preview.type.binary');
  }
}

function changeLabel(t: ReturnType<typeof useTranslation>['t'], kind: ChangeKind): string {
  switch (kind) {
    case 'created':
      return t('chat.workspace.change.created');
    case 'modified':
      return t('chat.workspace.change.modified');
    case 'deleted':
      return t('chat.workspace.change.deleted');
  }
}

function toRunFileEntry(entry: WorkspaceEntry): RunFileEntry {
  return {
    path: entry.path,
    accessType: 'read',
    toolName: 'workspace',
    accessedAt: entry.modifiedAt,
    available: true,
    ...(entry.sizeBytes === undefined ? {} : { sizeBytes: entry.sizeBytes }),
    ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
  };
}
