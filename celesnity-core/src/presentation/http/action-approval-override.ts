import type { Request } from 'express';

/**
 * Header name an agent's manifest-configured `action_approvals` map is sent
 * on, e.g. `"chart.delete=false,chart.create=true"`. Lets a specific agent's
 * YAML tighten or loosen approval gating for its own calls without a
 * celesnity-core code change — `runAction` applies it as the final say over
 * the action's own hardcoded `approvalRequired` default, in either
 * direction, so a misconfigured manifest can disable an intentional gate
 * (e.g. `chart.delete`). That trade-off is deliberate: the header is only
 * ever set by an agent's own trusted manifest, not by an end user.
 */
const APPROVAL_OVERRIDE_HEADER = 'x-action-approval-overrides';

/**
 * Resolves the approval override for one action name from the raw header
 * value, if present. Returns `undefined` when the header is absent or has
 * no entry for this action — callers should then fall back to the action's
 * own `approvalRequired` default.
 */
export function approvalOverrideFor(req: Request, actionName: string): boolean | undefined {
  const header = req.headers[APPROVAL_OVERRIDE_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  return approvalOverrideFromRawHeader(raw, actionName);
}

/**
 * Same resolution as {@link approvalOverrideFor}, for a caller that only has
 * the raw header value rather than a live `Request` — e.g. the MCP SSE
 * controllers, which capture this header once at connect time (it's static
 * for the agent manifest's whole session) rather than re-reading it per
 * JSON-RPC tool call.
 */
export function approvalOverrideFromRawHeader(
  raw: string | undefined,
  actionName: string,
): boolean | undefined {
  if (raw === undefined || raw === '') return undefined;

  for (const pair of raw.split(',')) {
    const [name, value] = pair.split('=').map((part) => part.trim());
    if (name === actionName) return value === 'true';
  }
  return undefined;
}
