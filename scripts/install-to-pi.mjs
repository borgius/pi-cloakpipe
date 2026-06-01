import { mkdir, lstat, readlink, realpath, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "pi-cloakpipe";
const force = process.argv.includes("--force");
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
const extensionsDir = join(agentDir, "extensions");
const installPath = join(extensionsDir, PACKAGE_NAME);

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function pointsToPackage(targetPath) {
  try {
    const stats = await lstat(targetPath);
    if (!stats.isSymbolicLink()) return false;
    const linkTarget = await readlink(targetPath);
    const resolvedLink = resolve(dirname(targetPath), linkTarget);
    return (await realpath(resolvedLink)) === (await realpath(packageRoot));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function main() {
  await mkdir(extensionsDir, { recursive: true });

  if (await pointsToPackage(installPath)) {
    console.log(`pi-cloakpipe is already linked at ${installPath}`);
    return;
  }

  if (await exists(installPath)) {
    if (!force) {
      throw new Error(
        `Refusing to replace existing ${installPath}. Remove it first or run \`npm run install:pi -- --force\`.`,
      );
    }
    await rm(installPath, { recursive: true, force: true });
  }

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(packageRoot, installPath, linkType);

  console.log(`Linked ${PACKAGE_NAME} into ${installPath}`);
  console.log("Restart pi or run /reload to pick up the extension.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});