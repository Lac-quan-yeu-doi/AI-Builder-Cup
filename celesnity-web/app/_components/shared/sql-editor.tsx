'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { editorFontFamily } from '@/app/_components/shared/editor-font';

interface SqlEditorProps {
  readonly value: string;
  readonly modelKey: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly onChange: (sql: string) => void;
}

const labelEditor: OnMount = (editor) => {
  const node = editor.getDomNode();
  node?.setAttribute('aria-label', 'SQL statement editor');
};

/** Shared SQL editing primitive used by SQL, chat, and chart workflows. */
export function SqlEditor({
  value,
  modelKey,
  disabled = false,
  autoFocus = false,
  onChange,
}: SqlEditorProps) {
  return (
    <div className="h-[280px] bg-editor-canvas sm:h-[340px]" role="region" aria-label="SQL editor">
      <Editor
        height="100%"
        language="sql"
        path={`inmemory://celesnity/${modelKey}.sql`}
        theme="vs-dark"
        value={value}
        onMount={(editor, monaco) => {
          labelEditor(editor, monaco);
          if (autoFocus) editor.focus();
        }}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          ariaLabel: 'SQL statement editor',
          automaticLayout: true,
          contextmenu: true,
          cursorBlinking: 'smooth',
          fontFamily: editorFontFamily(),
          fontSize: 14,
          insertSpaces: true,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 16 },
          readOnly: disabled,
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
