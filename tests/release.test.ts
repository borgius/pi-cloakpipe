import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ReleaseOptions = {
  releaseTarget: string | undefined;
  dryRun: boolean;
  allowDirty: boolean;
  tag: string | undefined;
  help: boolean;
};

type ReleaseStep = {
  label: string;
  command: string;
  args: string[];
};

type ReleaseModule = {
  USAGE_TEXT: string;
  parseReleaseArgs: (argv: string[]) => ReleaseOptions;
  createReleasePlan: (options: ReleaseOptions & { releaseTarget: string }) => ReleaseStep[];
};

async function loadReleaseModule(): Promise<ReleaseModule> {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "scripts/release.mjs")).href;
  return (await import(moduleUrl)) as ReleaseModule;
}

describe("release script", () => {
  it("parses release flags", async () => {
    const { parseReleaseArgs } = await loadReleaseModule();

    expect(parseReleaseArgs(["minor", "--dry-run", "--allow-dirty", "--tag", "next"])).toEqual({
      releaseTarget: "minor",
      dryRun: true,
      allowDirty: true,
      tag: "next",
      help: false,
    });
  });

  it("returns help without requiring a release target", async () => {
    const { parseReleaseArgs } = await loadReleaseModule();

    expect(parseReleaseArgs(["--help"])).toEqual({
      releaseTarget: undefined,
      dryRun: false,
      allowDirty: false,
      tag: undefined,
      help: true,
    });
  });

  it("builds the expected release steps", async () => {
    const { createReleasePlan } = await loadReleaseModule();

    expect(
      createReleasePlan({
        releaseTarget: "patch",
        dryRun: false,
        allowDirty: false,
        tag: "next",
        help: false,
      }),
    ).toEqual([
      {
        label: "Run build checks",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", "build"],
      },
      {
        label: "Run test suite",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["test"],
      },
      {
        label: "Bump version and create release commit for patch",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["version", "patch", "--message", "chore(release): %s"],
      },
      {
        label: "Publish package to npm",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["publish", "--tag", "next"],
      },
    ]);
  });

  it("shows usage when the release target is missing", async () => {
    const { parseReleaseArgs, USAGE_TEXT } = await loadReleaseModule();

    expect(() => parseReleaseArgs([])).toThrow(`Missing release target.\n\n${USAGE_TEXT}`);
  });
});
