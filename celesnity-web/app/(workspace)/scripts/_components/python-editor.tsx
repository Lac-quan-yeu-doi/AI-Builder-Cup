'use client';

import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { editorFontFamily } from '@/app/_components/shared/editor-font';

interface PythonEditorProps {
  readonly value: string;
  readonly modelKey: string;
  readonly disabled?: boolean;
  readonly onChange: (source: string) => void;
}

const configurePython: BeforeMount = (monaco) => {
  monaco.languages.setLanguageConfiguration('python', {
    comments: { lineComment: '#', blockComment: ['"""', '"""'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern:
        /^\s*(?:class|def|async\s+def|if|elif|else|for|while|try|except|finally|with|async\s+with|match|case)\b.*:\s*(?:#.*)?$/,
      decreaseIndentPattern: /^\s*(?:elif|else|except|finally|case)\b.*:/,
    },
  });
};

const labelEditor: OnMount = (editor) => {
  const node = editor.getDomNode();
  node?.setAttribute('aria-label', 'Python script source editor');
};

export function PythonEditor({ value, modelKey, disabled = false, onChange }: PythonEditorProps) {
  return (
    <div
      className="h-[360px] bg-editor-canvas sm:h-[410px] md:h-[470px]"
      role="region"
      aria-label="Python source editor"
    >
      <Editor
        height="100%"
        language="python"
        path={`inmemory://celesnity/${modelKey}.py`}
        theme="vs-dark"
        value={value}
        beforeMount={configurePython}
        onMount={labelEditor}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          ariaLabel: 'Python script source editor',
          automaticLayout: true,
          contextmenu: true,
          cursorBlinking: 'smooth',
          fontFamily: editorFontFamily(),
          fontSize: 14,
          formatOnPaste: true,
          insertSpaces: true,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 16 },
          readOnly: disabled,
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 4,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
