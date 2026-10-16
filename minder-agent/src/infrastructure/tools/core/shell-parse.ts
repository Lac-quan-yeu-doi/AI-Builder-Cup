export function parseSimpleCommand(command: string): string[] {
  if (!command.trim()) throw new Error("command is required.");
  if (command.includes("\0") || /[\r\n|><;&`$]/.test(command))
    throw new Error("Shell operators and expansion are not allowed.");

  const result: string[] = [];
  let token = "";
  let quote: "single" | "double" | undefined;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      escaped = true;
      continue;
    }
    if (quote === "single") {
      if (character === "'") quote = undefined;
      else token += character;
      continue;
    }
    if (quote === "double") {
      if (character === '"') quote = undefined;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character === "'" ? "single" : "double";
      continue;
    }
    if (/\s/.test(character)) {
      if (token) {
        result.push(token);
        token = "";
      }
      continue;
    }
    token += character;
  }
  if (escaped || quote) throw new Error("Command contains malformed quoting.");
  if (token) result.push(token);
  if (result.length === 0) throw new Error("command is required.");
  return result;
}
