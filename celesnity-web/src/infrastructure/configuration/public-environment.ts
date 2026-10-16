export interface PublicEnvironment {
  readonly coreApiUrl: string;
  readonly agentApiUrl: string;
  readonly chatAgentName: string;
}

export const publicEnvironment: PublicEnvironment = Object.freeze({
  coreApiUrl: '/api/core',
  // The browser never calls minder-agent directly. The same-origin gateway
  // verifies the Web session and replaces the caller identity before forwarding.
  agentApiUrl: process.env.NEXT_PUBLIC_AGENT_API_URL ?? '/api/agent',
  // Must match a name present in the owner-scoped minder-agent manifest
  // registry before a room can add it as a member. A getter (not a plain field) so
  // the throw fires lazily on first read, scoped to chat — not at module
  // import, which would take down unrelated features (e.g. chart) too.
  get chatAgentName(): string {
    const value = process.env.NEXT_PUBLIC_CHAT_AGENT_NAME;
    if (value === undefined || value === '') {
      throw new Error(
        'NEXT_PUBLIC_CHAT_AGENT_NAME is required — set it to a name already registered via ' +
          'minder-agent manifest registry before a chat room can add it as a member.',
      );
    }
    return value;
  },
});
