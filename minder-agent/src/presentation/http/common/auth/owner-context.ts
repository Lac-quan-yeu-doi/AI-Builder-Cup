import type {
  OwnerHeaders,
  OwnerResolution,
} from "../../guards/authentication.js";

export type OwnerContext = Extract<OwnerResolution, { readonly kind: "ok" }>;

export interface OwnerRequest {
  readonly headers: OwnerHeaders;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
  ownerContext?: OwnerContext;
}
