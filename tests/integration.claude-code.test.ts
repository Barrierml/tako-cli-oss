import { describe, it, expect } from "bun:test";
import { join } from "path";
import { getTakoDir, getTakoToolsDir } from "./_helpers/paths";
import { expectFileExists } from "./_helpers/assertions";
import { parseBinField } from "./_helpers/mocks";

describe("Integration - Claude Code package verification", () => {
  const takoDir = getTakoDir();
  const packagePath = join(
    getTakoToolsDir(),
    "claude-code",
    "node_modules",
    "@anthropic-ai/claude-code",
    "package.json"
  );

  it("Claude Code package.json should exist (if installed)", async () => {
    const file = Bun.file(packagePath);
    if (!(await file.exists())) {
      // Skip test if not installed
      console.warn("  [SKIP] Claude Code not installed");
      return;
    }

    await expectFileExists(packagePath);
  });

  it("should correctly parse Claude Code bin field (if installed)", async () => {
    const file = Bun.file(packagePath);
    if (!(await file.exists())) return; // Skip

    const pkg = await file.json();
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.claude).toBeDefined();
    expect(typeof pkg.bin.claude).toBe("string");
  });

  it("Claude Code entry file should exist (if installed)", async () => {
    const file = Bun.file(packagePath);
    if (!(await file.exists())) return; // Skip

    const pkg = await file.json();
    const entryFile = parseBinField(pkg.bin, "claude");
    expect(entryFile).not.toBeNull();

    const entryPath = join(
      getTakoToolsDir(),
      "claude-code",
      "node_modules",
      "@anthropic-ai/claude-code",
      entryFile!
    );

    await expectFileExists(entryPath);
  });

  it("Claude Code package should have valid name", async () => {
    const file = Bun.file(packagePath);
    if (!(await file.exists())) return; // Skip

    const pkg = await file.json();
    expect(pkg.name).toBe("@anthropic-ai/claude-code");
  });
});
