import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { load } = createRequire(import.meta.url)('js-yaml') as { load(source: string): unknown };

type Manifest = {
  spec: {
    rules: {
      matches: { path: { value: string }; headers?: { name: string; value: string }[] }[];
      backendRefs: { name: string }[];
    }[];
    default: { timeoutSec: number; securityPolicy: string; logging: { enabled: boolean } };
    selector: Record<string, string>;
    targetRef: { name: string };
  };
};
const read = (path: string) => load(readFileSync(`k8s/overlays/gcp/${path}`, 'utf8')) as Manifest;

describe.each(['dev', 'prod'])('Agent SSE gateway in %s', (env) => {
  const route = read(`${env}/routing/web-http-route.yaml`);
  function backend(path: string, accept: string) {
    return route.spec.rules.find((rule) =>
      rule.matches.some(
        (match) =>
          (path === match.path.value ||
            path.startsWith(`${match.path.value.replace(/\/$/, '')}/`)) &&
          (match.headers ?? []).every(
            (header) => header.name.toLowerCase() === 'accept' && header.value === accept,
          ),
      ),
    )?.backendRefs[0]?.name;
  }
  it('routes room and run event subscriptions to the dedicated streaming backend', () => {
    for (const path of ['/api/agent/rooms/room-1/events', '/api/agent/runs/run-1/events'])
      expect(backend(path, 'text/event-stream')).toBe('celesnity-web-agent-stream');
  });
  it('keeps ordinary requests and unrelated streams on their existing backends', () => {
    expect(backend('/api/agent/rooms/room-1/history', 'application/json')).toBe('celesnity-web');
    expect(backend('/api/agent/rooms-other/x', 'text/event-stream')).toBe('celesnity-web');
    expect(backend('/api/core/query/stream', 'text/event-stream')).toBe('celesnity-web');
    expect(backend('/api/core/rooms/room-1/message-blocks/stream', 'text/event-stream')).toBe(
      'celesnity-web-message-block-stream',
    );
  });
  it('uses existing pods with a finite deadline, Cloud Armor, logging and a health policy', () => {
    const policy = read(`${env}/routing/web-agent-stream-backend-policy.yaml`);
    expect(policy.spec.default.timeoutSec).toBe(300);
    expect(policy.spec.default.securityPolicy).toBe(`celesnity-gcp-${env}-web`);
    expect(policy.spec.default.logging.enabled).toBe(true);
    expect(policy.spec.targetRef.name).toBe('celesnity-web-agent-stream');
    expect(read(`${env}/routing/web-backend-policy.yaml`).spec.default.timeoutSec).toBe(30);
    expect(read('common/services/web-agent-stream-service.yaml').spec.selector).toEqual(
      read('common/services/web-message-block-stream-service.yaml').spec.selector,
    );
    expect(read('common/health/web-agent-stream-healthcheck-policy.yaml').spec.targetRef.name).toBe(
      'celesnity-web-agent-stream',
    );
  });
});
