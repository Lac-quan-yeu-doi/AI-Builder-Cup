import { describe, expect, it } from 'vitest';
import type { DependencyKey } from '@evyweb/ioctopus';

import { getInjection } from '@/di/container';
import { createWorkspaceTreeModule } from '@/di/modules/workspace-tree.module';
import { DI_SYMBOLS } from '@/di/types';
import { CoreApiWorkspaceTreeRepository } from '@/src/infrastructure/repositories/core-api-workspace-tree.repository';

interface BindingExpectation {
  readonly token: DependencyKey;
  readonly dependencies: readonly DependencyKey[];
}

const EXPECTED_BINDINGS: readonly BindingExpectation[] = [
  { token: DI_SYMBOLS.WorkspaceTreeRepository, dependencies: [DI_SYMBOLS.CoreApiClient] },
  {
    token: DI_SYMBOLS.ListWorkspaceTreeUseCase,
    dependencies: [DI_SYMBOLS.WorkspaceTreeRepository],
  },
  {
    token: DI_SYMBOLS.GetWorkspaceFileContentUseCase,
    dependencies: [DI_SYMBOLS.WorkspaceTreeRepository],
  },
  {
    token: DI_SYMBOLS.ListWorkspaceTreeController,
    dependencies: [DI_SYMBOLS.ListWorkspaceTreeUseCase],
  },
  {
    token: DI_SYMBOLS.GetWorkspaceFileContentController,
    dependencies: [DI_SYMBOLS.GetWorkspaceFileContentUseCase],
  },
];

describe('workspace-tree dependency injection', () => {
  it('wires the repository, use cases, and controllers in order', () => {
    const workspaceTreeModule = createWorkspaceTreeModule();

    expect([...workspaceTreeModule.bindings.keys()]).toEqual(
      EXPECTED_BINDINGS.map(({ token }) => token),
    );
    for (const { token, dependencies } of EXPECTED_BINDINGS) {
      const binding = workspaceTreeModule.bindings.get(token);
      const resolved: DependencyKey[] = [];
      binding?.factory((dependency) => {
        resolved.push(dependency);
        return dependency;
      });
      expect(resolved, String(token)).toEqual(dependencies);
    }
  });

  it('resolves all five new tokens without changing the core transport binding', () => {
    expect(getInjection('WorkspaceTreeRepository')).toBeInstanceOf(CoreApiWorkspaceTreeRepository);
    expect(getInjection('ListWorkspaceTreeUseCase')).toBeTypeOf('function');
    expect(getInjection('GetWorkspaceFileContentUseCase')).toBeTypeOf('function');
    expect(getInjection('ListWorkspaceTreeController')).toBeTypeOf('function');
    expect(getInjection('GetWorkspaceFileContentController')).toBeTypeOf('function');
    expect(getInjection('CoreApiClient')).toBe(getInjection('CoreApiClient'));
  });
});
