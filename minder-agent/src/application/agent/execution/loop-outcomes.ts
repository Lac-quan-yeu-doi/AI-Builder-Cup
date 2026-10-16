import type { AgentLoopInput } from "./loop.js";
import type { LoopContinuation, LoopSnapshot } from "./react-loop-state.js";
import type { LoopBackgroundTask, LoopTodo } from "../context/context.js";
import type { DispatchedToolResult } from "./tool-dispatch.js";

export function rememberEffects(
  results: readonly DispatchedToolResult[],
  activatedTools: Set<string>,
  todos: Map<string, LoopTodo>,
  backgroundTasks: Map<string, LoopBackgroundTask>,
): void {
  for (const result of results) {
    for (const effect of result.effects) {
      if (effect.kind === "tool_activated" && effect.name)
        activatedTools.add(effect.name);
      if (effect.kind === "todo") {
        const prior = todos.get(effect.todo.id);
        todos.set(effect.todo.id, {
          ...prior,
          ...effect.todo,
        });
      }
      if (effect.kind === "todos_replaced") {
        todos.clear();
        for (const todo of effect.todos) todos.set(todo.id, todo);
      }
      if (effect.kind === "background_task")
        backgroundTasks.set(effect.task.id, effect.task);
    }
  }
}

export function restoredValues<T extends { readonly id: string }>(
  values: readonly T[] | undefined,
): readonly T[] {
  if (values === undefined) return [];
  return values.filter(
    (value) => typeof value.id === "string" && value.id.length > 0,
  );
}

export function restoredSnapshot(
  input: AgentLoopInput,
): LoopSnapshot | undefined {
  return input.snapshot?.version === 1 ? input.snapshot : undefined;
}

export function restoredContinuation(
  input: AgentLoopInput,
): LoopContinuation | undefined {
  return input.continuation?.snapshot.version === 1
    ? input.continuation
    : undefined;
}
