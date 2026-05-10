import { join } from "path";
import { homedir } from "os";

/** Get Tako root directory */
export const getTakoDir = () => join(homedir(), ".tako");

/** Get Tako CLI directory */
export const getTakoCliDir = () => join(getTakoDir(), "cli");

/** Get Tako tools directory */
export const getTakoToolsDir = () => join(getTakoDir(), "tools");

/** Get Tako bin directory */
export const getTakoBinDir = () => join(getTakoDir(), "bin");

/** Get Bun executable path */
export const getBunBin = () => {
  const takoDir = getTakoDir();
  return join(takoDir, "bun", "bin", process.platform === "win32" ? "bun.exe" : "bun");
};

/** Get project root directory */
export const getProjectRoot = () => import.meta.dir.replace("/tests/_helpers", "");

/** Get project src directory */
export const getSrcDir = () => join(getProjectRoot(), "src");

/** Get project dist directory */
export const getDistDir = () => join(getProjectRoot(), "dist");

/** Check if running on Windows */
export const isWindows = () => process.platform === "win32";

/** Get platform-specific launcher script name */
export const getLauncherScriptName = () => isWindows() ? "tako.cmd" : "tako";
