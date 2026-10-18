// Runs minder-agent's manifest workspace migrations without GCP.
// The entrypoint always asks the GCE metadata server for a workload identity
// token; off GCP, Core (NODE_ENV != production) accepts the MCP shared secret
// instead, so swap one for the other.
const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);

  if (url.hostname === 'metadata.google.internal') {
    return new Response('local-compose-workload-identity', { status: 200 });
  }

  if (url.pathname === '/api/v1/internal/agent-manifest-organizations') {
    const headers = new Headers(init?.headers);
    headers.delete('authorization');
    headers.set('x-mcp-shared-secret', process.env.MCP_SHARED_SECRET ?? '');
    return nativeFetch(input, { ...init, headers });
  }

  return nativeFetch(input, init);
};

await import('/app/dist/bootstrap/manifest-workspace-migrations-main.js');
