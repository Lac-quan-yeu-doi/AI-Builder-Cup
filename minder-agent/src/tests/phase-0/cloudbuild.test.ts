import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Phase 0 Cloud Build pipeline", () => {
  it("builds Node, injects runtime secrets, and restricts deployment to matching dev or prod targets", async () => {
    const yaml = await readFile("cloudbuild.yaml", "utf8");
    expect(yaml).toContain("npm ci --ignore-scripts");
    expect(yaml).toContain(
      "npx prisma generate --schema src/infrastructure/prisma/schema.prisma",
    );
    expect(yaml).toContain(
      "npm run test:phase-0 -- src/tests/presentation/http",
    );
    expect(yaml).not.toContain("npm run test:phase-0\n");
    expect(yaml).toContain("src/tests/phase-0/container-smoke.sh");
    expect(yaml).toContain("kubectl kustomize");
    expect(yaml).toContain(
      'sed -i -E "s|^    newTag:.*|    newTag: \\"$$TAG\\"|"',
    );
    expect(yaml).toContain("kubectl apply -f /workspace/minder-rendered.yaml");
    expect(yaml).not.toContain("kubectl set image");
    expect(yaml).toContain("rollout status deployment/minder-serve");
    expect(yaml).toContain("port-forward deployment/minder-serve");
    expect(yaml).not.toContain("cargo build");
    expect(yaml).toContain("inject-secrets");
    expect(yaml).toContain("gcloud secrets versions access latest");
    expect(yaml).toContain("minder-llm-api-key");
    expect(yaml).toContain("_LLM_PROVIDER: gemini");
    expect(yaml).toContain("LLM_PROVIDER");
    expect(yaml).toContain(
      "gcp-dev:cosmos3-mmad-research:asia-southeast1-docker.pkg.dev",
    );
    expect(yaml).toContain(
      "gcp-prod:celesnity-minder-platform:europe-west2-docker.pkg.dev",
    );
    expect(yaml).toContain(
      "ERROR: Cloud Build target substitutions do not match an approved environment.",
    );
    expect(yaml).not.toContain(
      "raw.githubusercontent.com/kubernetes-sigs/kustomize",
    );
  });

  it("gates rollout on sandbox verification before changing Agent configuration", async () => {
    const yaml = await readFile("cloudbuild.yaml", "utf8");
    expect(yaml).toContain('sandbox-container-smoke.sh "$$RUNNER_IMAGE:$$TAG"');
    expect(yaml).toContain("npm test --prefix sandbox-runner");
    expect(yaml).toContain("src/tests/phase-0/sandbox-deployment.test.ts");
    const verification = yaml.indexOf(
      "python3 k8s/ci/render-sandbox-verification-job.py",
    );
    const configApply = yaml.indexOf('apply -f "$$CONFIGMAP"');
    expect(verification).toBeGreaterThan(0);
    expect(configApply).toBeGreaterThan(verification);
    expect(yaml).toContain(
      'deployment-diagnostics.sh "${_NAMESPACE}" "job-name=$$sandbox_job"',
    );
    expect(yaml).toContain(
      'deployment-diagnostics.sh "${_NAMESPACE}" "app.kubernetes.io/name=minder-serve"',
    );
  });

  it("has a no-deploy verification pipeline", async () => {
    const yaml = await readFile("cloudbuild.verify-phase-0.yaml", "utf8");
    expect(yaml).toContain("npm run test:compat");
    expect(yaml).toContain(
      "npx prisma generate --schema src/infrastructure/prisma/schema.prisma",
    );
    expect(yaml).toContain("docker build");
    expect(yaml).toContain(
      "sandbox-container-smoke.sh minder-sandbox-runner:phase-0-verify",
    );
    expect(yaml).not.toContain("kubectl apply -f -");
    expect(yaml).not.toContain("docker push");
  });

  it("provides an isolated development GKE verification without an Agent deployment", async () => {
    const yaml = await readFile("cloudbuild.verify-sandbox-gke.yaml", "utf8");
    expect(yaml).toContain("test '${PROJECT_ID}' = cosmos3-mmad-research");
    expect(yaml).toContain("sandbox-verify-${BUILD_ID}");
    expect(yaml).toContain("render-sandbox-verification-job.py");
    expect(yaml).toContain('docker push "$$IMAGE"');
    expect(yaml).not.toContain("development-latest");
    expect(yaml).not.toContain("rollout status");
    expect(yaml).not.toContain("kubectl apply");
    expect(yaml).not.toContain("gcloud secrets");
  });

  it("starts the container smoke test with production auth configuration", async () => {
    const script = await readFile(
      "src/tests/phase-0/container-smoke.sh",
      "utf8",
    );
    expect(script).toContain('MINDER_AUTH_MODE="core-assertion"');
    expect(script).toContain('MINDER_ASSERTION_ISSUER="celesnity-core"');
    expect(script).toContain('MINDER_ASSERTION_AUDIENCE="minder-agent"');
    expect(script).toContain("MINDER_ASSERTION_PUBLIC_KEYS_JSON=");
    expect(script).toContain('MINDER_ASSERTION_REPLAY_CACHE_CAPACITY="1024"');
    expect(script).toContain('MINIO_ENDPOINT="http://127.0.0.1:18082"');
    expect(script).toContain('MINIO_ACCESS_KEY="container-smoke-key"');
    expect(script).toContain('MINIO_SECRET_KEY="container-smoke-secret"');
    expect(script).toContain('MINIO_WORKSPACE_BUCKET="container-smoke"');
  });
});
