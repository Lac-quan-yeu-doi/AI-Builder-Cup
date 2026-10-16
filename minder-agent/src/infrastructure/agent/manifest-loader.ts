import { parse } from "yaml";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  createManifestLoader as createApplicationManifestLoader,
  type ManifestLoader,
  type ManifestWorkspace,
} from "@application/agent";

export function createManifestLoader(input: {
  readonly workspace: ManifestWorkspace;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}): ManifestLoader {
  return createApplicationManifestLoader({
    ...input,
    parseYaml: parse,
    sha256,
  });
}
