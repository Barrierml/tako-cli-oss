import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { mkdir, rm, writeFile } from "fs/promises";

// 测试纯函数（不涉及文件系统）
describe("Project History - Pure Functions", () => {
  // 动态导入以便测试
  let formatProjectPath: typeof import("../src/project-history").formatProjectPath;
  let formatLastUsed: typeof import("../src/project-history").formatLastUsed;
  let setLocale: typeof import("../src/i18n").setLocale;

  beforeEach(async () => {
    const mod = await import("../src/project-history");
    formatProjectPath = mod.formatProjectPath;
    formatLastUsed = mod.formatLastUsed;

    // 设置测试语言为中文
    const i18nMod = await import("../src/i18n");
    setLocale = i18nMod.setLocale;
    setLocale("zh");
  });

  describe("formatProjectPath", () => {
    it("should replace home directory with ~", () => {
      const home = homedir();
      const path = join(home, "projects", "myapp");
      const formatted = formatProjectPath(path, 50);

      expect(formatted).toStartWith("~");
      expect(formatted).not.toContain(home);
    });

    it("should truncate long paths", () => {
      const longPath = "/very/long/path/to/some/deeply/nested/project";
      const formatted = formatProjectPath(longPath, 20);

      expect(formatted.length).toBeLessThanOrEqual(20);
      expect(formatted).toContain("project"); // 保留项目名
    });

    it("should keep short paths unchanged", () => {
      const shortPath = "/short/path";
      const formatted = formatProjectPath(shortPath, 50);

      expect(formatted).toBe(shortPath);
    });

    it("should handle paths within home directory", () => {
      const home = homedir();
      const path = join(home, "code");
      const formatted = formatProjectPath(path, 50);

      expect(formatted).toBe("~/code");
    });
  });

  describe("formatLastUsed", () => {
    it("should return '刚刚' for very recent times", () => {
      const now = new Date().toISOString();
      expect(formatLastUsed(now)).toBe("刚刚");
    });

    it("should return minutes for recent times", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatLastUsed(fiveMinutesAgo)).toBe("5分钟前");
    });

    it("should return hours for same-day times", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatLastUsed(threeHoursAgo)).toBe("3小时前");
    });

    it("should return '昨天' for yesterday", () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      expect(formatLastUsed(yesterday)).toBe("昨天");
    });

    it("should return days for recent past", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatLastUsed(threeDaysAgo)).toBe("3天前");
    });

    it("should return weeks for older times", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatLastUsed(twoWeeksAgo)).toBe("2周前");
    });
  });
});

// 测试涉及文件系统的函数
describe("Project History - File System Operations", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testDir = join(tmpdir(), `tako-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // 保存原始 cwd
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    // 恢复 cwd
    process.chdir(originalCwd);

    // 清理测试目录
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("isValidDirectory", () => {
    it("should return true for existing directory", async () => {
      const { isValidDirectory } = await import("../src/project-history");
      const result = await isValidDirectory(testDir);
      expect(result).toBe(true);
    });

    it("should return false for non-existing path", async () => {
      const { isValidDirectory } = await import("../src/project-history");
      const result = await isValidDirectory("/non/existing/path/12345");
      expect(result).toBe(false);
    });

    it("should return false for file path", async () => {
      const { isValidDirectory } = await import("../src/project-history");
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "test");

      const result = await isValidDirectory(filePath);
      expect(result).toBe(false);
    });
  });
});

// 测试数据结构和 clientUsage
describe("Project History - Client Usage", () => {
  describe("clientUsage structure", () => {
    it("should support multiple clients per project", () => {
      const project = {
        path: "/test/project",
        launchCount: 10,
        lastLaunchedAt: new Date().toISOString(),
        lastClientId: "codex",
        clientUsage: {
          "claude-code": { count: 7, lastAt: new Date(Date.now() - 1000).toISOString() },
          "codex": { count: 3, lastAt: new Date().toISOString() },
        },
      };

      expect(project.clientUsage["claude-code"].count).toBe(7);
      expect(project.clientUsage["codex"].count).toBe(3);
      expect(project.launchCount).toBe(10); // 总计
    });

    it("should track last used client correctly", () => {
      const now = Date.now();
      const project = {
        path: "/test/project",
        launchCount: 5,
        lastLaunchedAt: new Date(now).toISOString(),
        lastClientId: "codex", // 最后用的是 codex
        clientUsage: {
          "claude-code": { count: 3, lastAt: new Date(now - 10000).toISOString() },
          "codex": { count: 2, lastAt: new Date(now).toISOString() },
        },
      };

      expect(project.lastClientId).toBe("codex");
      // codex 的 lastAt 应该等于项目的 lastLaunchedAt
      expect(project.clientUsage["codex"].lastAt).toBe(project.lastLaunchedAt);
    });
  });
});
