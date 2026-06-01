import { lstat, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PACKAGE_NAME = "pi-cloakpipe";
const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
const installPath = join(agentDir, "extensions", PACKAGE_NAME);

async function main() {
  try {
    await lstat(installPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.log(`No install found at ${installPath}`);
      return;
    }
    throw error;
  }

  await rm(installPath, { recursive: true, force: true });
  console.log(`Removed ${installPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});