'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface NotebookEditorContextValue {
  readonly openEditorId: string | null;
  readonly setOpenEditorId: (editorId: string | null) => void;
}

const NotebookEditorContext = createContext<NotebookEditorContextValue | null>(null);

export function NotebookEditorProvider({ children }: { readonly children: ReactNode }) {
  const [openEditorId, setOpenEditorId] = useState<string | null>(null);
  const value = useMemo(() => ({ openEditorId, setOpenEditorId }), [openEditorId]);
  return <NotebookEditorContext.Provider value={value}>{children}</NotebookEditorContext.Provider>;
}

export function useNotebookEditor(editorId: string): {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
} {
  const context = useContext(NotebookEditorContext);
  const [localOpen, setLocalOpen] = useState(false);
  if (!context) {
    return { open: localOpen, setOpen: setLocalOpen };
  }
  return {
    open: context.openEditorId === editorId,
    setOpen: (open) => context.setOpenEditorId(open ? editorId : null),
  };
}
