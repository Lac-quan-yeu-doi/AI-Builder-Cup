import {
  createContainer,
  createModule,
  type Binding,
  type DependencyKey,
  type ModuleKey,
} from '@evyweb/ioctopus';

import type { DI_RETURN_TYPES, InjectionToken } from '@/di/types';

type RegistryKey = keyof DI_RETURN_TYPES;
type AnyFactory = (...dependencies: never[]) => unknown;
type AnyConstructor = new (...dependencies: never[]) => unknown;

type CompatibleToken<TDependency> = {
  [TKey in RegistryKey]: DI_RETURN_TYPES[TKey] extends TDependency ? InjectionToken<TKey> : never;
}[RegistryKey];

type DependencyTokens<TParameters extends readonly unknown[]> = {
  readonly [TIndex in keyof TParameters]: CompatibleToken<TParameters[TIndex]>;
};

type DependencyArgument<TParameters extends readonly unknown[]> = TParameters extends readonly []
  ? readonly [dependencies?: undefined]
  : [] extends TParameters
    ? readonly [dependencies?: DependencyTokens<TParameters>]
    : readonly [dependencies: DependencyTokens<TParameters>];

type CompatibleFactory<TKey extends RegistryKey, TFactory extends AnyFactory> =
  ReturnType<TFactory> extends DI_RETURN_TYPES[TKey] ? TFactory : never;

type CompatibleConstructor<TKey extends RegistryKey, TConstructor extends AnyConstructor> =
  InstanceType<TConstructor> extends DI_RETURN_TYPES[TKey] ? TConstructor : never;

export type TypedResolver = <TKey extends RegistryKey>(
  token: InjectionToken<TKey>,
) => DI_RETURN_TYPES[TKey];

export interface TypedBindingBuilder<TKey extends RegistryKey> {
  toClass<TConstructor extends AnyConstructor>(
    constructor: CompatibleConstructor<TKey, TConstructor>,
    ...dependencyArgument: DependencyArgument<ConstructorParameters<NoInfer<TConstructor>>>
  ): void;
  toHigherOrderFunction<TFactory extends AnyFactory>(
    factory: CompatibleFactory<TKey, TFactory>,
    ...dependencyArgument: DependencyArgument<Parameters<NoInfer<TFactory>>>
  ): void;
  toFactory(factory: (resolve: TypedResolver) => DI_RETURN_TYPES[TKey]): void;
}

export interface TypedApplicationModule {
  readonly bindings: Map<DependencyKey, Binding>;
  bind<TKey extends RegistryKey>(token: InjectionToken<TKey>): TypedBindingBuilder<TKey>;
}

export interface TypedApplicationContainer {
  load(moduleKey: ModuleKey, module: TypedApplicationModule): void;
  get<TKey extends RegistryKey>(token: InjectionToken<TKey>): DI_RETURN_TYPES[TKey];
}

export function createTypedModule(): TypedApplicationModule {
  const typedModule = createModule();

  return typedModule as unknown as TypedApplicationModule;
}

export function createTypedContainer(): TypedApplicationContainer {
  const container = createContainer();

  return container as unknown as TypedApplicationContainer;
}

export function resolveTypedInjection<TKey extends RegistryKey>(
  container: TypedApplicationContainer,
  key: TKey,
  symbols: { readonly [TRegistryKey in RegistryKey]: InjectionToken<TRegistryKey> },
): DI_RETURN_TYPES[TKey] {
  // TypeScript does not preserve the key/value correlation after indexing a
  // generic mapped type. Keep that unavoidable assertion inside this adapter.
  return container.get(symbols[key] as InjectionToken<TKey>);
}
