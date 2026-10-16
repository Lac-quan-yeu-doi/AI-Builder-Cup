export type WorkOwner = "run" | "external";
export type TodoStatus = "pending" | "in_progress" | "completed" | "failed";
export type BackgroundTaskStatus =
  "pending" | "running" | "completed" | "failed";

export interface LoopTodo {
  readonly id: string;
  readonly owner: WorkOwner;
  readonly status: TodoStatus;
  /** Human-readable work item retained in the durable loop snapshot. */
  readonly content?: string;
}

export interface LoopBackgroundTask {
  readonly id: string;
  readonly owner: WorkOwner;
  readonly status: BackgroundTaskStatus;
}

export type WorkSafetyDecision =
  | { readonly kind: "clear" }
  | { readonly kind: "wait_for_todos"; readonly todoIds: readonly string[] }
  | { readonly kind: "background"; readonly taskIds: readonly string[] };

/** Determine whether a loop may safely declare the current work complete. */
export function assessWorkSafety(input: {
  readonly todos: readonly LoopTodo[];
  readonly backgroundTasks: readonly LoopBackgroundTask[];
}): WorkSafetyDecision {
  const todoIds = input.todos
    .filter((todo) => todo.owner === "run" && todo.status === "in_progress")
    .map((todo) => todo.id);
  if (todoIds.length > 0) return { kind: "wait_for_todos", todoIds };
  const taskIds = input.backgroundTasks
    .filter(
      (task) =>
        task.owner === "run" &&
        (task.status === "pending" || task.status === "running"),
    )
    .map((task) => task.id);
  return taskIds.length === 0
    ? { kind: "clear" }
    : { kind: "background", taskIds };
}

/** Reset interrupted work that belongs to this run without touching external work. */
export function resetOwnedInProgressTodos(
  todos: readonly LoopTodo[],
): readonly LoopTodo[] {
  return todos.map((todo) =>
    todo.owner === "run" && todo.status === "in_progress"
      ? { ...todo, status: "pending" }
      : todo,
  );
}
