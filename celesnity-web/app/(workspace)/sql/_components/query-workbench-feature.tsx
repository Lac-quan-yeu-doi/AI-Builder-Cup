'use client';

import { observeRunQueryRequiredAction } from '@/app/_components/shared/workspace-required-actions';
import { getInjection } from '@/di/container';

import { QueryWorkbenchScreen } from './query-workbench-screen';

const controllers = Object.freeze({
  listCatalogs: getInjection('ListQueryCatalogsController'),
  listNamespaces: getInjection('ListQueryNamespacesController'),
  listHistory: getInjection('ListQueryHistoryController'),
  get: getInjection('GetQueryController'),
  cancel: getInjection('CancelQueryController'),
  submit: observeRunQueryRequiredAction(getInjection('SubmitQueryController')),
  monitor: getInjection('MonitorQueryController'),
});

export function QueryWorkbenchFeature() {
  return <QueryWorkbenchScreen controllers={controllers} />;
}
