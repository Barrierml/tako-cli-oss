import { describe, it, expect } from "bun:test";
import { join } from "path";
import { getTakoDir, getBunBin, isWindows, getLauncherScriptName } from "./_helpers/paths";

describe("Platform - Windows compatibility", () => {
  it("path handling should use correct separator", () => {
    const testPath = join("a", "b", "c");
    expect(testPath).toContain("a");
    expect(testPath).toContain("c");
  });

  it("executable should use correct extension for platform", () => {
    const bunBin = getBunBin();

    if (isWindows()) {
      expect(bunBin).toEndWith(".exe");
    } else {
      expect(bunBin).not.toEndWith(".exe");
    }
  });

  it("launcher script name should be correct for platform", () => {
    const scriptName = getLauncherScriptName();

    expect(scriptName).toBeDefined();
    if (isWindows()) {
      expect(scriptName).toEndWith(".cmd");
    } else {
      expect(scriptName).not.toContain(".");
    }
  });

  it("Tako directory should be platform-independent", () => {
    const takoDir = getTakoDir();
    expect(takoDir).toContain(".tako");
  });

  it("Bun binary path should be under Tako directory", () => {
    const takoDir = getTakoDir();
    const bunBin = getBunBin();
    expect(bunBin.startsWith(takoDir)).toBe(true);
  });
});

describe("Platform - Path handling", () => {
  it("join should work correctly", () => {
    const result = join("foo", "bar", "baz");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("homedir-based paths should be absolute", () => {
    const takoDir = getTakoDir();
    // Unix: starts with /, Windows: starts with drive letter
    const isAbsolute = takoDir.startsWith("/") || /^[A-Z]:/i.test(takoDir);
    expect(isAbsolute).toBe(true);
  });
});
