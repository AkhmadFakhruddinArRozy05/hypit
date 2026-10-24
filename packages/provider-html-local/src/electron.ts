import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

export function electronEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}

export async function requireElectronExecutable(path: string): Promise<void> {
  try {
    if (!(await stat(path)).isFile()) throw new Error("Electron path is not a file");
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    const { stdout } = await promisify(execFile)(path, ["--version"], {
      timeout: 15_000, windowsHide: true, env: electronEnvironment(),
    });
    const version = /^v(\d+)\.\d+\.\d+(?:-\S+)?$/mu.exec(stdout.trim());
    if (version === null || Number(version[1]) < 45) throw new Error(`Expected Electron 45+, received ${stdout.trim()}`);
  } catch (error) {
    throw new Error(`HTML renderer Electron is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}. Configure electronPath with an installed Electron 45+ executable.`, { cause: error });
  }
}
