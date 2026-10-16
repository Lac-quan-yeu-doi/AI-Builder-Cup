import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatFeature } from './_components/chat-feature';

export const metadata: Metadata = { title: 'AI Chat' };

// The screen reads `?session=` and `?database=` — the sidebar's history entries
// and every "Ask AI" button address it that way — and this route is otherwise
// static, so Next needs a boundary to prerender the shell around it.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatFeature />
    </Suspense>
  );
}
