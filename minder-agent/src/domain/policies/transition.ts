export interface Transition<
  From extends string = string,
  To extends string = string,
> {
  readonly from: From;
  readonly to: To;
}
export const allowsTransition = <From extends string, To extends string>(
  allowed: readonly Transition<From, To>[],
  from: From,
  to: To,
): boolean =>
  allowed.some(
    (transition) => transition.from === from && transition.to === to,
  );
