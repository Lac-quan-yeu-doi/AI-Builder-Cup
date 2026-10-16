'use client';

import { getInjection } from '@/di/container';

import { DocumentsScreen } from './documents-screen';

const controllers = Object.freeze({
  list: getInjection('ListDocumentsController'),
  upload: getInjection('UploadDocumentController'),
  getContent: getInjection('GetDocumentContentController'),
});
const renderer = getInjection('ChartRendererService');

export function DocumentFeature() {
  return <DocumentsScreen controllers={controllers} renderer={renderer} />;
}
