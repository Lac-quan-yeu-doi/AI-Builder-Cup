import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const standaloneRoot = join(projectRoot, '.next', 'standalone');

if (!existsSync(standaloneRoot)) {
  throw new Error(`Standalone output is missing at ${standaloneRoot}`);
}

copyRequiredDirectory(
  join(projectRoot, '.next', 'static'),
  join(standaloneRoot, '.next', 'static'),
);
copyOptionalDirectory(join(projectRoot, 'public'), join(standaloneRoot, 'public'));

function copyRequiredDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`Required standalone asset directory is missing at ${source}`);
  }
  replaceDirectory(source, destination);
}

function copyOptionalDirectory(source, destination) {
  rmSync(destination, { force: true, recursive: true });
  if (existsSync(source)) {
    cpSync(source, destination, { recursive: true });
  }
}

function replaceDirectory(source, destination) {
  rmSync(destination, { force: true, recursive: true });
  cpSync(source, destination, { recursive: true });
}
