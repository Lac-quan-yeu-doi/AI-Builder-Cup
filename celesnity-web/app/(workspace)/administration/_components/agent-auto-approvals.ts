const AUTO_APPROVAL_KEY = 'auto_approvals:';

export function readAutoApprovalActions(yaml: string): readonly string[] {
  const lines = yaml.split('\n');
  const index = lines.findIndex((line) => line.trim() === AUTO_APPROVAL_KEY);
  if (index < 0) return [];
  const indent = indentation(lines[index] ?? '');
  const actions: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? '';
    if (line.trim() === '') continue;
    if (indentation(line) <= indent) break;
    const value = /^\s*-\s*(.+?)\s*$/u.exec(line)?.[1];
    if (value !== undefined && value !== '') actions.push(unquote(value));
  }
  return actions;
}

export function writeAutoApprovalActions(yaml: string, actions: readonly string[]): string {
  const lines = yaml.split('\n');
  const normalized = [...new Set(actions.map((action) => action.trim()).filter(Boolean))];
  const index = lines.findIndex((line) => line.trim() === AUTO_APPROVAL_KEY);
  if (index >= 0) {
    const indent = indentation(lines[index] ?? '');
    const end = childBlockEnd(lines, index, indent);
    lines.splice(index, end - index, ...renderBlock(' '.repeat(indent), normalized));
    return lines.join('\n');
  }

  const governanceIndex = lines.findIndex((line) => line.trim() === 'governance:');
  if (governanceIndex >= 0) {
    const actionApprovalsIndex = lines.findIndex(
      (line, cursor) => cursor > governanceIndex && /^\s*action_approvals:\s*/u.test(line),
    );
    const insertAt =
      actionApprovalsIndex >= 0
        ? childBlockEnd(lines, actionApprovalsIndex, indentation(lines[actionApprovalsIndex] ?? ''))
        : governanceIndex + 1;
    lines.splice(insertAt, 0, ...renderBlock('  ', normalized));
    return lines.join('\n');
  }
  const suffix = renderBlock('  ', normalized);
  return `${yaml.replace(/\n*$/u, '')}\ngovernance:\n${suffix.join('\n')}\n`;
}

function childBlockEnd(lines: readonly string[], start: number, indent: number): number {
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    if (line.trim() !== '' && indentation(line) <= indent) break;
    end += 1;
  }
  return end;
}

function renderBlock(indent: string, actions: readonly string[]): string[] {
  return actions.length === 0
    ? [`${indent}${AUTO_APPROVAL_KEY} []`]
    : [`${indent}${AUTO_APPROVAL_KEY}`, ...actions.map((action) => `${indent}  - ${action}`)];
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  )
    return value.slice(1, -1);
  return value;
}
