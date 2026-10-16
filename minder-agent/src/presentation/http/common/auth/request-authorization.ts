import type { AuthenticatedPrincipal } from "@application/shared/ports/index.js";

/**
 * Enforce the grants already evaluated by Core. The Agent may narrow those
 * grants for its own routes, but it must never infer broader access from a
 * role name or a client-controlled header.
 */
export function agentRequestAllowed(
  principal: AuthenticatedPrincipal,
  method: string,
  url: string,
): boolean {
  const pathname = new URL(url, "http://localhost").pathname;
  const path = pathname.replace(/^\/api\/v[12](?=\/)/u, "");
  const root = path.split("/")[1];
  const read = method === "GET" || method === "HEAD";
  let permission = "workspace:read";
  let features: readonly string[] = ["HOME"];

  switch (root) {
    case "skills":
    case "mcp":
      features = ["ADMINISTRATION"];
      permission = read ? "workspace:read" : "workspace:write";
      break;
    case "agents":
    case "agent-manifests":
      if (
        !read &&
        path !== "/agent-manifests/validate" &&
        path !== "/agent-manifests/validate/governance" &&
        path !== "/agent-manifests/governance/validate"
      ) {
        features = ["ADMINISTRATION"];
        permission = "workspace:write";
      }
      break;
    case "rooms":
      if (/\/webhooks(?:\/|$)/u.test(path)) {
        features = ["AUTOMATIONS"];
        permission = read ? "workspace:read" : "workspace:write";
      }
      break;
    case "webhooks":
    case "room-webhooks":
      features = ["AUTOMATIONS"];
      permission = "workspace:write";
      break;
    case "catalog":
    case "client-tool-results":
    case "sessions":
      break;
    case "runs":
      if (
        read &&
        pathname.startsWith("/api/v2/") &&
        /^\/runs\/[^/]+\/status$/u.test(path)
      )
        features = ["HOME", "ANALYTICS", "AUTOMATIONS"];
      else if (
        read &&
        pathname.startsWith("/api/v2/") &&
        /^\/runs\/[^/]+\/files(?:\/content)?$/u.test(path)
      )
        features = ["HOME", "AUTOMATIONS"];
      else if (
        read &&
        pathname.startsWith("/api/v2/") &&
        /^\/runs\/[^/]+\/events$/u.test(path)
      )
        features = ["HOME", "ANALYTICS", "AUTOMATIONS"];
      else if (
        pathname.startsWith("/api/v2/") &&
        /^\/runs\/[^/]+\/events$/u.test(path)
      )
        return false;
      break;
    case "turns":
      if (method === "POST" && path === "/turns/blocking")
        features = ["HOME", "ANALYTICS"];
      break;
    default:
      return false;
  }

  return (
    principal.permissions.includes(permission) &&
    (principal.visibleFeatures === null ||
      features.some((feature) =>
        principal.visibleFeatures?.some((grant) => grant === feature),
      ))
  );
}
