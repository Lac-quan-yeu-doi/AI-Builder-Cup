'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import { DocumentBody } from '@/app/_components/documents/document-body';
import { DocumentFileViewer } from '@/app/_components/documents/document-file-viewer';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { ListDocumentsController } from '@/src/interface-adapters/controllers/documents/list-documents.controller';
import type { UploadDocumentController } from '@/src/interface-adapters/controllers/documents/upload-document.controller';
import type { GetDocumentContentController } from '@/src/interface-adapters/controllers/documents/get-document-content.controller';
import type { DocumentContent } from '@/src/entities/models/document';
import type { DocumentViewModel } from '@/src/interface-adapters/presenters/document.presenter';

interface DocumentsScreenProps {
  readonly controllers: {
    readonly list: ListDocumentsController;
    readonly upload: UploadDocumentController;
    readonly getContent: GetDocumentContentController;
  };
  readonly renderer?: ChartRenderer;
}

export function DocumentsScreen({ controllers, renderer }: DocumentsScreenProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<readonly DocumentViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentViewModel | null>(null);
  const [docContent, setDocContent] = useState<DocumentContent | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reload after a successful upload — a plain event-handler call, so no
  // effect restrictions apply here.
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await controllers.list();
      setDocuments(result);
    } catch {
      setError(t('documents.loadError'));
    } finally {
      setLoading(false);
    }
  }, [controllers, t]);

  // The mount fetch is defined inline rather than calling the `loadDocuments`
  // callback above: react-hooks/set-state-in-effect flags any setState that
  // runs as part of an effect's own execution, including through a called
  // function — defining the fetch inline (mirroring ChartSidebar's own
  // mount-load effect) keeps the lint rule's analysis local to this effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await controllers.list();
        if (cancelled) return;
        setDocuments(result);
        setError(null);
      } catch {
        if (!cancelled) setError(t('documents.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      await controllers.upload(file);
      await loadDocuments();
    } catch (reason: unknown) {
      setUploadError(reason instanceof Error ? reason.message : t('documents.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleUpload(file);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleUpload(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const viewDocument = async (doc: DocumentViewModel) => {
    setSelectedDoc(doc);
    setDocContent(null);
    setLoadingText(true);
    try {
      const content = await controllers.getContent({ documentId: doc.id, mimeType: doc.mimeType });
      setDocContent(content);
    } catch {
      setDocContent(null);
    } finally {
      setLoadingText(false);
    }
  };

  const closePreview = () => {
    setSelectedDoc(null);
    setDocContent(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageBar
        actions={
          <>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-muted-foreground">⬆</span>
              {uploading ? t('documents.uploading') : t('documents.upload')}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
          </>
        }
        description={t('documents.subtitle')}
        eyebrow={
          <>
            {t('nav.group.resources')} · {t('nav.documents')}
          </>
        }
        title={t('documents.title')}
      />

      {uploadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? 'border-status-success/30 bg-status-success-light'
            : 'border-border bg-muted hover:border-border'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <span className="text-muted-foreground text-2xl">⬆</span>
        <p className="mt-2 text-sm font-medium text-foreground">{t('documents.dropzone')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('documents.dropzoneHint')}</p>
      </div>

      {/* Document list */}
      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('documents.loading')}</p>
      )}

      {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}

      {!loading && !error && documents.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('documents.empty')}</p>
      )}

      {!loading && documents.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="px-4 py-3 font-medium text-foreground">
                  {t('documents.column.filename')}
                </th>
                <th className="px-4 py-3 font-medium text-foreground">
                  {t('documents.column.pages')}
                </th>
                <th className="px-4 py-3 font-medium text-foreground">
                  {t('documents.column.status')}
                </th>
                <th className="px-4 py-3 font-medium text-foreground">
                  {t('documents.column.uploaded')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => void viewDocument(doc)}
                >
                  <td className="flex items-center gap-2 px-4 py-3">
                    <span className="shrink-0 text-status-success-dark">📄</span>
                    <span className="truncate font-medium text-foreground">{doc.filename}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{doc.mimeType}</td>
                  <td className="px-4 py-3">
                    {doc.extractionStatus === 'extracted' ? (
                      <span className="inline-flex items-center rounded-full bg-status-success-light px-2 py-0.5 text-xs font-medium text-status-success-dark">
                        {t('documents.status.extracted')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-warning-light px-2 py-0.5 text-xs font-medium text-status-warning-dark">
                        ⚠{t('documents.status.noText')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Document text preview panel */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={closePreview} />
          <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {selectedDoc.filename}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedDoc.mimeType === 'application/pdf'
                    ? `${selectedDoc.pageCount} ${t('documents.pages')}`
                    : selectedDoc.mimeType}{' '}
                  ·{' '}
                  {selectedDoc.extractionStatus === 'extracted'
                    ? t('documents.status.extracted')
                    : t('documents.status.noText')}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={closePreview}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {docContent?.kind === 'file' ? (
                <DocumentFileViewer
                  filename={selectedDoc.filename}
                  mimeType={selectedDoc.mimeType}
                  blob={docContent.blob}
                />
              ) : (
                <>
                  {loadingText && (
                    <p className="text-sm text-muted-foreground">{t('documents.loadingText')}</p>
                  )}
                  {!loadingText &&
                    docContent?.kind === 'text' &&
                    docContent.content.extractionStatus === 'extracted' &&
                    (selectedDoc.mimeType === 'text/markdown' ? (
                      <DocumentBody
                        content={docContent.content.text}
                        chartPreviews={docContent.content.chartPreviews}
                        renderer={renderer}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {docContent.content.text}
                      </pre>
                    ))}
                  {!loadingText &&
                    docContent?.kind === 'text' &&
                    docContent.content.extractionStatus === 'no_text_found' && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="text-4xl text-status-warning">⚠</span>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {t('documents.noTextContent')}
                        </p>
                      </div>
                    )}
                  {!loadingText && !docContent && (
                    <p className="text-sm text-destructive">{t('documents.textLoadError')}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
