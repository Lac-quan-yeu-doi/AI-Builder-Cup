import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function controllerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? controllerFiles(path)
      : entry.endsWith('.controller.ts')
        ? [path]
        : [];
  });
}

describe('workspace feature policy coverage', () => {
  it('requires every controller source to declare a feature or an explicit non-human exemption', () => {
    const presentation = join(process.cwd(), 'src', 'presentation');
    const uncovered = controllerFiles(presentation)
      .filter((path) => readFileSync(path, 'utf8').includes('@Controller'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return ![
          'RequireWorkspaceFeature(',
          '@MachineAuthenticated()',
          '@Public()',
          "@Controller('health')",
        ].some((marker) => source.includes(marker));
      })
      .map((path) => path.slice(presentation.length + 1));

    expect(uncovered).toEqual([]);
  });
});
