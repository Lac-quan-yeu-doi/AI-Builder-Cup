import { messageBlockProxyAdmission } from '@/di/server-streams';

/**
 * Health check for load balancers and container platforms.
 *
 * Exists because there was nothing safe to probe. "/" is a redirect to
 * /database-services, and a Google Cloud load balancer health check treats only a 200 as
 * healthy — a 307 leaves the backend permanently unhealthy and the whole hostname
 * returning 502 while the pods themselves look fine. Probing a real page such as
 * /database-services would work, but it ties the deployment's health to a product route
 * that could be renamed.
 *
 * Deliberately outside the (workspace) route group, so it renders no layout.
 *
 * Reports only that this process is serving. It intentionally does not check the
 * core API: a frontend that cannot reach its backend should still serve the page
 * that explains as much, and failing this probe would restart the pod instead.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    service: 'celesnity-web',
    status: 'ok',
    messageBlockStreams: messageBlockProxyAdmission.snapshot(),
    timestamp: new Date().toISOString(),
  });
}
