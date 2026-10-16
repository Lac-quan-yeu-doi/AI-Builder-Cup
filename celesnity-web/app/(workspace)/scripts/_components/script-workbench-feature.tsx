'use client';

import { getInjection } from '@/di/container';

import { ScriptsScreen } from './scripts-screen';

const controllers = Object.freeze({
  listScripts: getInjection('ListScriptsController'),
  getScript: getInjection('GetScriptController'),
  listVersions: getInjection('ListScriptVersionsController'),
  loadVersionSource: getInjection('LoadScriptVersionSourceController'),
  listActiveConnections: getInjection('ListActiveConnectionsController'),
  save: getInjection('SaveScriptController'),
  saveAndRun: getInjection('SaveAndRunScriptController'),
});

export function ScriptWorkbenchFeature() {
  return <ScriptsScreen controllers={controllers} />;
}
