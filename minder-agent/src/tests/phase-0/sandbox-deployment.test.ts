import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface Container {
  name: string;
  securityContext: Record<string, unknown>;
}

interface Deployment {
  spec: { template: { spec: { containers: Container[] } } };
}

describe("Sandbox deployment regression", () => {
  it("extracts a single Deployment without Secret documents before kubectl JSON conversion", async () => {
    const deployment = await readFile("k8s/base/deployment.yaml", "utf8");
    const secret = await readFile("k8s/overlays/gcp-dev/secret.yaml", "utf8");
    const output = execFileSync(
      "awk",
      ["-f", "k8s/ci/extract-deployment.awk"],
      {
        input: `${secret}\n${deployment}\n`,
        encoding: "utf8",
      },
    );
    expect((parse(output) as { kind: string }).kind).toBe("Deployment");
    expect(output).not.toContain("__LLM_API_KEY__");
    expect(output).not.toContain("kind: Service");
    expect(() =>
      execFileSync("awk", ["-f", "k8s/ci/extract-deployment.awk"], {
        input: `${deployment}\n${deployment}`,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    ).toThrow();
  });
  it("limits the development AppArmor exception to the runner", async () => {
    const patch = parse(
      await readFile(
        "k8s/overlays/gcp-dev/sandbox-security-patch.yaml",
        "utf8",
      ),
    ) as Deployment;
    expect(patch.spec.template.spec.containers).toEqual([
      {
        name: "sandbox-runner",
        securityContext: { appArmorProfile: { type: "Unconfined" } },
      },
    ]);
    const overlay = parse(
      await readFile("k8s/overlays/gcp-dev/kustomization.yaml", "utf8"),
    ) as { patches: { path: string }[] };
    expect(overlay.patches).toContainEqual({
      path: "sandbox-security-patch.yaml",
    });
    const production = await readFile(
      "k8s/overlays/gcp-prod/kustomization.yaml",
      "utf8",
    );
    expect(production).not.toContain("sandbox-security-patch.yaml");
  });

  it.each(["5484300", "6e947a6", "manual-build-123"])(
    "preserves %s as a string using the real Cloud Build sed command",
    async (tag) => {
      const cloudBuild = parse(await readFile("cloudbuild.yaml", "utf8")) as {
        steps: { id: string; args: string[] }[];
      };
      const script = cloudBuild.steps.find(
        (step) => step.id === "deploy-and-smoke",
      )?.args[1];
      const tagCommand = script
        ?.split("\n")
        .find((line) => line.includes('sed -i -E "s|^    newTag:'));
      expect(tagCommand).toBeDefined();
      const directory = await mkdtemp(join(tmpdir(), "sandbox-tag-"));
      try {
        const path = join(directory, "kustomization.yaml");
        await writeFile(
          path,
          await readFile("k8s/overlays/gcp-dev/kustomization.yaml", "utf8"),
        );
        // Stream output instead of editing in place so BSD and GNU sed both work.
        const output = execFileSync(
          "bash",
          [
            "-c",
            tagCommand!.replace("sed -i -E", "sed -E").replaceAll("$$", "$"),
          ],
          {
            env: { ...process.env, TAG: tag, KUSTOMIZATION: path },
            encoding: "utf8",
          },
        );
        const rendered = parse(output) as { images: { newTag: unknown }[] };
        expect(rendered.images.map((image) => image.newTag)).toEqual([
          tag,
          tag,
        ]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
