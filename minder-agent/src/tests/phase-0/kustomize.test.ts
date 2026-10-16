import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function render(overlay: "gcp-dev" | "gcp-prod"): Promise<string> {
  const { stdout } = await execFileAsync("kubectl", [
    "kustomize",
    `k8s/overlays/${overlay}`,
  ]);
  return stdout;
}

describe("Phase 0 Kubernetes manifests", () => {
  it.each(["gcp-dev", "gcp-prod"] as const)(
    "renders a hardened Node deployment for %s",
    async (overlay) => {
      const yaml = await render(overlay);
      expect(yaml).toContain("kind: Deployment");
      expect(yaml).toContain("name: minder-serve");
      expect(yaml).toContain("runAsUser: 65532");
      expect(yaml).toContain("readOnlyRootFilesystem: true");
      expect(yaml).toContain("path: /livez");
      expect(yaml).toContain("path: /readyz");
      expect(yaml).toContain("path: /metrics");
      expect(yaml).toContain("kind: HorizontalPodAutoscaler");
      expect(yaml).toContain("kind: PodMonitoring");
      expect(yaml).toContain("RUST_LOG:");
      expect(yaml).toContain("DATABASE_URL");
      expect(yaml).toContain("LLM_API_KEY");
      expect(yaml).toContain("name: minder-serve-secrets");
      expect(yaml).toContain("name: minder-serve-storage");
      expect(yaml).toContain("envFrom:");
    },
  );

  it("configures the development agent with its durable S3 workspace", async () => {
    const yaml = await render("gcp-dev");

    expect(yaml).toContain("MINIO_ENDPOINT: https://storage.googleapis.com");
    expect(yaml).toContain(
      "MINIO_WORKSPACE_BUCKET: celesnity-gcp-dev-artifacts-cosmos3-mmad-research",
    );
    expect(yaml).toContain('MINIO_SECURE: "true"');
    expect(yaml).toContain("MINDER_DATABASE_SCHEMA: minder_agent");
    expect(yaml).toContain("MINIO_ACCESS_KEY");
    expect(yaml).toContain("MINIO_SECRET_KEY");
  });
});
