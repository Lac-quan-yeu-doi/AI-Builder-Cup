export type ChangeKind = 'created' | 'modified' | 'deleted';

export interface WorkspaceChange {
  readonly path: string;
  readonly kind: ChangeKind;
}

export interface WorkspaceEntry {
  readonly path: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
  readonly mimeType?: string;
}

export interface WorkspaceTreeResult {
  readonly entries: readonly WorkspaceEntry[];
  readonly truncated: boolean;
}

export interface WorkspaceTreeNode {
  readonly path: string;
  readonly name: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
  readonly mimeType?: string;
  readonly changeKind?: ChangeKind;
  readonly children: readonly WorkspaceTreeNode[];
}

type MutableTreeNode = {
  path: string;
  name: string;
  isDir: boolean;
  sizeBytes?: number;
  modifiedAt: string;
  mimeType?: string;
  children: Map<string, MutableTreeNode>;
};

export function buildTree(
  entries: readonly WorkspaceEntry[],
  changeKinds: ReadonlyMap<string, ChangeKind> = new Map(),
): readonly WorkspaceTreeNode[] {
  const roots = new Map<string, MutableTreeNode>();

  for (const entry of entries) {
    const segments = pathSegments(entry.path);
    if (segments.length === 0) {
      continue;
    }

    let siblings = roots;
    let parentPath = '';

    for (const [index, name] of segments.entries()) {
      const path = parentPath === '' ? name : `${parentPath}/${name}`;
      const isLeaf = index === segments.length - 1;
      let node = siblings.get(name);

      if (node === undefined) {
        node = {
          path,
          name,
          isDir: !isLeaf || entry.isDir,
          ...(isLeaf && entry.sizeBytes !== undefined ? { sizeBytes: entry.sizeBytes } : {}),
          modifiedAt: isLeaf ? entry.modifiedAt : '',
          ...(isLeaf && entry.mimeType !== undefined ? { mimeType: entry.mimeType } : {}),
          children: new Map(),
        };
        siblings.set(name, node);
      } else if (isLeaf) {
        node.isDir = entry.isDir || node.children.size > 0;
        node.modifiedAt = entry.modifiedAt;
        if (entry.sizeBytes === undefined) {
          delete node.sizeBytes;
        } else {
          node.sizeBytes = entry.sizeBytes;
        }
        if (entry.mimeType === undefined) {
          delete node.mimeType;
        } else {
          node.mimeType = entry.mimeType;
        }
      } else {
        node.isDir = true;
      }

      parentPath = path;
      siblings = node.children;
    }
  }

  return materializeNodes(roots, changeKinds);
}

function pathSegments(path: string): string[] {
  const normalizedPath = path.replace(/^(?:\.\/)+/, '');
  return normalizedPath.split('/').filter((segment) => segment.length > 0);
}

function materializeNodes(
  nodes: Map<string, MutableTreeNode>,
  changeKinds: ReadonlyMap<string, ChangeKind>,
): readonly WorkspaceTreeNode[] {
  return Object.freeze(
    [...nodes.values()].sort(compareNodes).map((node) => materializeNode(node, changeKinds)),
  );
}

function materializeNode(
  node: MutableTreeNode,
  changeKinds: ReadonlyMap<string, ChangeKind>,
): WorkspaceTreeNode {
  return Object.freeze({
    path: node.path,
    name: node.name,
    isDir: node.isDir,
    ...(node.sizeBytes === undefined ? {} : { sizeBytes: node.sizeBytes }),
    modifiedAt: node.modifiedAt,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
    ...(changeKinds.has(node.path) ? { changeKind: changeKinds.get(node.path) } : {}),
    children: materializeNodes(node.children, changeKinds),
  });
}

function compareNodes(left: MutableTreeNode, right: MutableTreeNode): number {
  if (left.isDir !== right.isDir) {
    return left.isDir ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}
