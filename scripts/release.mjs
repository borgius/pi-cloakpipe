import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const gitCommand = process.platform === "win32" ? "git.exe" : "git";

export const USAGE_TEXT = [
  "Usage: npm run release -- <target> [--dry-run] [--allow-dirty] [--tag <dist-tag>]",
  "",
  "Targets can be semver bump keywords like patch, minor, major, prerelease,",
  "or an explicit version like 1.2.3.",
].join("\n");

/**
 * @typedef {{
 *   releaseTarget: string | undefined;
 *   dryRun: boolean;
 *   allowDirty: boolean;
 *   tag: string | undefined;
 *   help: boolean;
 * }} ReleaseOptions
 */

/**
 * @typedef {{
 *   label: string;
 *   command: string;
 *   args: string[];
 * }} ReleaseStep
 */

/**
 * @param {string[]} argv
 * @returns {ReleaseOptions}
 */
export function parseReleaseArgs(argv) {
  /** @type {ReleaseOptions} */
  const options = {
    releaseTarget: undefined,
    dryRun: false,
    allowDirty: false,
    tag: undefined,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      return options;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }

    if (arg === "--tag") {
      const tag = argv[index + 1];
      if (!tag || tag.startsWith("--")) {
        throw new Error(`Missing value for --tag.\n\n${USAGE_TEXT}`);
      }
      options.tag = tag;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}\n\n${USAGE_TEXT}`);
    }

    if (options.releaseTarget) {
      throw new Error(`Expected exactly one release target, received both \`${options.releaseTarget}\` and \`${arg}\`.\n\n${USAGE_TEXT}`);
    }

    options.releaseTarget = arg;
  }

  if (!options.releaseTarget) {
    throw new Error(`Missing release target.\n\n${USAGE_TEXT}`);
  }

  return options;
}

/**
 * @param {ReleaseOptions & { releaseTarget: string }} options
 * @returns {ReleaseStep[]}
 */
export function createReleasePlan(options) {
  const publishArgs = ["publish"];

  if (options.tag) {
    publishArgs.push("--tag", options.tag);
  }

  return [
    {
      label: "Run build checks",
      command: npmCommand,
      args: ["run", "build"],
    },
    {
      label: "Run test suite",
      command: npmCommand,
      args: ["test"],
    },
    {
      label: `Bump version and create release commit for ${options.releaseTarget}`,
      command: npmCommand,
      args: ["version", options.releaseTarget, "--message", "chore(release): %s"],
    },
    {
      label: "Publish package to npm",
      command: npmCommand,
      args: publishArgs,
    },
  ];
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

export function ensureCleanWorktree() {
  const output = execFileSync(gitCommand, ["status", "--short"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (output.length > 0) {
    throw new Error(
      [
        "Refusing to release with uncommitted changes.",
        "Commit or stash them first, or rerun with --allow-dirty.",
        "",
        output,
      ].join("\n"),
    );
  }
}

/**
 * @param {ReleaseStep} step
 * @param {boolean} dryRun
 */
export function runReleaseStep(step, dryRun) {
  console.log(`\n• ${step.label}`);
  console.log(`$ ${formatCommand(step.command, step.args)}`);

  if (dryRun) {
    return;
  }

  execFileSync(step.command, step.args, {
    stdio: "inherit",
  });
}

/**
 * @param {string[]} argv
 */
export async function main(argv = process.argv.slice(2)) {
  const options = parseReleaseArgs(argv);

  if (options.help) {
    console.log(USAGE_TEXT);
    return;
  }

  if (!options.dryRun && !options.allowDirty) {
    ensureCleanWorktree();
  }

  const plan = createReleasePlan(/** @type {ReleaseOptions & { releaseTarget: string }} */ (options));

  console.log(`Preparing npm release for \`${options.releaseTarget}\`.`);
  if (options.dryRun) {
    console.log("Dry run enabled. No files, tags, or published artifacts will be changed.");
  }

  for (const step of plan) {
    runReleaseStep(step, options.dryRun);
  }

  console.log("\nRelease flow complete.");
  console.log("If publish succeeded, push the release commit and tag with `git push --follow-tags`.");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
