import { describe, expect, it } from 'vitest';

import { buildTree } from '@/src/entities/models/workspace-tree';

describe('buildTree', () => {
  it('nests files under directories, sorts dirs before files, and sorts names', () => {
    const tree = buildTree([
      { path: 'src', isDir: true, modifiedAt: 'x' },
      { path: 'src/b.ts', isDir: false, sizeBytes: 2, modifiedAt: 'x' },
      {
        path: 'src/a.ts',
        isDir: false,
        sizeBytes: 1,
        modifiedAt: 'x',
        mimeType: 'text/typescript',
      },
      { path: 'readme.md', isDir: false, sizeBytes: 3, modifiedAt: 'x' },
    ]);

    const [src, readme] = tree;
    expect(src?.name).toBe('src');
    expect(readme?.name).toBe('readme.md');
    expect(src?.children.map((node) => node.name)).toEqual(['a.ts', 'b.ts']);
    expect(src?.children[0]?.sizeBytes).toBe(1);
    expect(src?.children[0]?.mimeType).toBe('text/typescript');
  });

  it('synthesizes missing intermediate directories', () => {
    const tree = buildTree([{ path: 'a/b/c.txt', isDir: false, modifiedAt: 'x' }]);

    const [a] = tree;
    const [b] = a?.children ?? [];
    const [file] = b?.children ?? [];
    expect(a?.name).toBe('a');
    expect(a?.isDir).toBe(true);
    expect(b?.name).toBe('b');
    expect(file?.name).toBe('c.txt');
    expect(a?.modifiedAt).toBe('');
    expect(b?.modifiedAt).toBe('');
  });

  it('does not mutate input and ignores empty paths', () => {
    const entries = [{ path: 'x.txt', isDir: false, modifiedAt: 'x' }];
    const before = structuredClone(entries);
    const tree = buildTree([...entries, { path: '', isDir: false, modifiedAt: 'bad' }]);

    expect(entries).toEqual(before);
    expect(tree.map((node) => node.name)).toEqual(['x.txt']);
  });

  it('returns frozen roots, nodes, and children', () => {
    const tree = buildTree([{ path: 'src/index.ts', isDir: false, modifiedAt: 'x' }]);

    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree[0])).toBe(true);
    expect(Object.isFrozen(tree[0]?.children)).toBe(true);
    expect(Object.isFrozen(tree[0]?.children[0])).toBe(true);
  });

  it('deduplicates an explicit directory that was synthesized earlier', () => {
    const tree = buildTree([
      { path: 'a/b/c.txt', isDir: false, modifiedAt: 'file-time' },
      { path: 'a', isDir: true, modifiedAt: 'directory-time' },
    ]);

    const [a] = tree;
    expect(tree).toHaveLength(1);
    expect(a?.path).toBe('a');
    expect(a?.modifiedAt).toBe('directory-time');
    expect(a?.children.map((node) => node.path)).toEqual(['a/b']);
  });

  it('normalizes leading ./ without inventing change metadata', () => {
    const tree = buildTree([{ path: './src/index.ts', isDir: false, modifiedAt: 'x' }]);

    const [src] = tree;
    const [file] = src?.children ?? [];
    expect(src?.path).toBe('src');
    expect(file?.path).toBe('src/index.ts');
    expect('changeKind' in (file ?? {})).toBe(false);
  });
});
