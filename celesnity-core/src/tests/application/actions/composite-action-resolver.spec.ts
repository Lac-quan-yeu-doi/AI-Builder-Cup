import { CompositeActionResolver } from '@application/actions/composite-action-resolver';
import type { ActionDefinition } from '@application/actions/action.types';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';

function stubResolver(names: readonly string[]): IActionResolver {
  const byName = new Map(
    names.map((name) => [name, { name } as ActionDefinition<unknown, unknown>]),
  );
  return { resolve: (name) => byName.get(name) };
}

describe('CompositeActionResolver', () => {
  it('resolves an action from the first resolver that has it', () => {
    const resolver = new CompositeActionResolver([
      stubResolver(['chart.create', 'chart.delete']),
      stubResolver(['automation.create']),
    ]);

    expect(resolver.resolve('chart.delete')?.name).toBe('chart.delete');
  });

  it('resolves an action from a later resolver when earlier ones do not have it', () => {
    const resolver = new CompositeActionResolver([
      stubResolver(['chart.create']),
      stubResolver(['automation.create']),
    ]);

    expect(resolver.resolve('automation.create')?.name).toBe('automation.create');
  });

  it('returns undefined for an unknown action name', () => {
    const resolver = new CompositeActionResolver([stubResolver(['chart.create'])]);

    expect(resolver.resolve('nonexistent.action')).toBeUndefined();
  });
});
