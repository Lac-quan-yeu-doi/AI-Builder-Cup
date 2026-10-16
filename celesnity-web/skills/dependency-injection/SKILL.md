---
name: dependency-injection
description: Use when adding or changing a DI token, binding a repository/use case/controller, resolving a controller in the UI, or debugging a container resolution or typed-wiring error
---

# Dependency Injection

## Overview

`di/` is the only place that names concrete implementations. It is a typed
wrapper (`di/typed-ioctopus.ts`) over `@evyweb/ioctopus`: the token's declared
return type must match what the factory or class produces, and the dependency
tuple must match the factory's parameters in order.

## Layout

```text
di/types.ts            DI_RETURN_TYPES (token -> type) and DI_SYMBOLS (token -> symbol)
di/typed-ioctopus.ts   Typed bind/resolve wrapper — do not bypass it
di/container.ts        Loads modules, exports getInjection('Token')
di/modules/*.module.ts One module per feature (+ platform.module.ts for shared infra)
```

## Adding a binding

1. **Declare the type** in the `DI_RETURN_TYPES` interface in `di/types.ts`, then
   add the token to `DI_SYMBOLS` with `createSymbol('SameName')`. The key, the
   symbol name, and the type entry must all use the same name.
2. **Bind it** in `di/modules/<feature>.module.ts`, in this order inside the
   module: repository/service → use cases → controllers.

   ```ts
   module
     .bind(DI_SYMBOLS.ConnectionRepository)
     .toClass(CoreApiConnectionRepository, [DI_SYMBOLS.CoreApiClient]);

   module
     .bind(DI_SYMBOLS.ArchiveConnectionUseCase)
     .toHigherOrderFunction(createArchiveConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]);

   module
     .bind(DI_SYMBOLS.ArchiveConnectionController)
     .toHigherOrderFunction(createArchiveConnectionController, [
       DI_SYMBOLS.ArchiveConnectionUseCase,
     ]);
   ```

   - `toClass` for classes (infrastructure repositories).
   - `toHigherOrderFunction` for `create*` factories (use cases, controllers).
   - `toFactory(resolve => …)` only when construction needs the resolver.

3. **New feature module?** Also load it in `di/container.ts` with a
   `Symbol.for('celesnity.<Name>Module')` key.
4. **Consume it** — only a feature root resolves tokens, and only controllers:

   ```ts
   const controllers = Object.freeze({
     archive: getInjection('ArchiveConnectionController'),
   });
   ```

5. **Test it.** Extend `tests/unit/di/container.test.ts` (resolution) and
   `tests/unit/di/typed-wiring.compile.ts` (compile-time misuse must not
   type-check).

## Rules

- Resolve controllers only. Never `getInjection` a repository, use case, or
  service from `app/`.
- Resolve at module scope in the feature root and freeze the object — not inside
  render, and never inside a screen or leaf component.
- Dependency tokens are positional: the array order must match the factory's
  parameter order. Wrong order compiles into wrong behavior unless the types
  differ, which is exactly why `typed-wiring.compile.ts` exists.
- One repository per feature. Do not cross-wire another feature's repository into
  your module; add the capability to your own port instead.
- Keep shared infrastructure (`CoreApiClient`, scheduler, progress services) in
  `platform.module.ts`.

## Failure modes

| Symptom                                                                  | Cause                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `Type 'X' is not assignable to type 'never'` at `.toHigherOrderFunction` | Factory return type does not match the token's `DI_RETURN_TYPES` entry.            |
| Dependency array element rejected                                        | Token's type is not compatible with that factory parameter, or the order is wrong. |
| Runtime "no binding" error                                               | Token declared but never bound, or the module is not loaded in `di/container.ts`.  |
| Boundary lint error in `app/`                                            | The UI imported a use case or repository directly instead of a controller token.   |

## Verify

```bash
npm run typecheck
npx vitest run tests/unit/di
```
