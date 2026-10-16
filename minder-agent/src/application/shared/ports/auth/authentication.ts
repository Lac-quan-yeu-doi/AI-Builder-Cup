import type { PrincipalScope } from "@domain/index.js";

export type OrganizationRole =
  | "PLATFORM_ADMIN"
  | "SUPPORT"
  | "ORG_OWNER"
  | "ORG_ADMIN"
  | "DATA_ENGINEER"
  | "ANALYST"
  | "VIEWER"
  | "AUDITOR"
  | "SERVICE_ACCOUNT";

export type WorkspaceFeature =
  | "HOME"
  | "SKILLS"
  | "CONNECTIONS"
  | "STREAMING"
  | "DEVICES"
  | "SOURCE_SCHEMA"
  | "CRAWLER"
  | "PIPELINES"
  | "EXECUTIONS"
  | "AUTOMATIONS"
  | "CATALOG_DATABASES"
  | "CATALOG_TABLES"
  | "QUERY"
  | "PLANT_MODEL"
  | "ANALYTICS"
  | "DOCUMENTS"
  | "GUIDE"
  | "ADMINISTRATION";

export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly scope: PrincipalScope;
  readonly membershipId: string;
  readonly role: OrganizationRole;
  /** Grants evaluated by Core. Agent may narrow them but never expand them. */
  readonly permissions: readonly string[];
  readonly visibleFeatures: readonly WorkspaceFeature[] | null;
  readonly mfaVerified: boolean;
  readonly authenticationTime: number;
  readonly authenticationMethod: "core_assertion";
}

export interface RequestAuthenticator {
  authenticate(
    headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  ): Promise<AuthenticatedPrincipal>;
}
