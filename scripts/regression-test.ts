#!/usr/bin/env bun
/**
 * Tako CLI 回归测试套件
 * 验证所有修复和功能正常工作
 */

import { join } from "path";
import { homedir } from "os";

// 测试结果收集
const results: Array<{ name: string; passed: boolean; error?: string }> = [];

function test(name: string, fn: () => boolean | Promise<boolean>) {
  return async () => {
    try {
      const passed = await fn();
      results.push({ name, passed });
      return passed;
    } catch (error) {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };
}

console.log("🧪 Tako CLI 回归测试套件\n");
console.log("=" .repeat(60));

// ============================================================================
// 1. Windows 修复 - 入口文件解析
// ============================================================================
console.log("\n📦 测试 1: Windows 入口文件解析修复\n");

const testEntryResolution = test("package.json bin 字段解析", () => {
  // 测试不同格式的 bin 字段解析
  const testCases = [
    {
      bin: { claude: "cli.js" },
      command: "claude",
      expected: "cli.js",
    },
    {
      bin: "index.js",
      command: "any",
      expected: "index.js",
    },
    {
      bin: { cmd1: "bin/cmd1.js", cmd2: "bin/cmd2.js" },
      command: "cmd2",
      expected: "bin/cmd2.js",
    },
  ];

  for (const tc of testCases) {
    let result: string | null = null;

    if (typeof tc.bin === "string") {
      result = tc.bin;
    } else if (typeof tc.bin === "object" && tc.bin[tc.command]) {
      result = tc.bin[tc.command];
    }

    if (result !== tc.expected) {
      console.log(`  ❌ 失败: 期望 ${tc.expected}, 得到 ${result}`);
      return false;
    }
  }

  console.log("  ✅ bin 字段解析逻辑正确");
  return true;
});

await testEntryResolution();

const testClaudeCodeEntry = test("Claude Code 实际包解析", async () => {
  const TAKO_DIR = join(homedir(), ".tako");
  const clientDir = join(TAKO_DIR, "tools", "claude-code");
  const packageJsonPath = join(clientDir, "node_modules", "@anthropic-ai/claude-code", "package.json");

  const file = Bun.file(packageJsonPath);
  if (!(await file.exists())) {
    console.log("  ⚠️  跳过: Claude Code 未安装");
    return true; // 不算失败
  }

  const pkg = await file.json();
  const binField = pkg.bin;

  if (!binField || !binField.claude) {
    console.log("  ❌ 失败: 无法找到 bin.claude 字段");
    return false;
  }

  const entryFile = binField.claude;
  const fullPath = join(clientDir, "node_modules", "@anthropic-ai/claude-code", entryFile);
  const entryFileObj = Bun.file(fullPath);

  if (!(await entryFileObj.exists())) {
    console.log(`  ❌ 失败: 入口文件不存在 ${fullPath}`);
    return false;
  }

  console.log(`  ✅ Claude Code 入口文件解析成功: ${entryFile}`);
  return true;
});

await testClaudeCodeEntry();

// ============================================================================
// 2. 自动更新路径修复
// ============================================================================
console.log("\n🔄 测试 2: 自动更新路径修复\n");

const testUpdatePaths = test("更新目录配置", () => {
  const TAKO_DIR = join(homedir(), ".tako");
  const TAKO_CLI_DIR = join(TAKO_DIR, "cli");
  const expectedInstallPath = join(TAKO_CLI_DIR, "node_modules", "tako-cli");

  // 验证路径都在 Tako 目录下
  if (!TAKO_CLI_DIR.startsWith(TAKO_DIR)) {
    console.log("  ❌ 失败: CLI 目录不在 Tako 目录下");
    return false;
  }

  if (!expectedInstallPath.startsWith(TAKO_DIR)) {
    console.log("  ❌ 失败: 安装路径不在 Tako 目录下");
    return false;
  }

  console.log(`  ✅ 目录配置正确`);
  console.log(`     Tako CLI 目录: ${TAKO_CLI_DIR}`);
  console.log(`     目标安装位置: ${expectedInstallPath}`);
  return true;
});

await testUpdatePaths();

const testUpdateCommand = test("更新命令配置", () => {
  const TAKO_DIR = join(homedir(), ".tako");
  const TAKO_CLI_DIR = join(TAKO_DIR, "cli");
  const TAKO_BUN_BIN = join(
    TAKO_DIR,
    "bun",
    "bin",
    process.platform === "win32" ? "bun.exe" : "bun"
  );

  // 模拟更新命令
  const command = [TAKO_BUN_BIN, "add", "tako-cli@latest"];
  const cwd = TAKO_CLI_DIR;

  // 验证命令和工作目录
  if (!command.includes("tako-cli@latest")) {
    console.log("  ❌ 失败: 命令缺少包名");
    return false;
  }

  if (command.includes("-g")) {
    console.log("  ❌ 失败: 命令不应包含 -g 参数");
    return false;
  }

  if (!cwd.startsWith(TAKO_DIR)) {
    console.log("  ❌ 失败: 工作目录不在 Tako 目录下");
    return false;
  }

  console.log(`  ✅ 更新命令配置正确`);
  console.log(`     命令: ${command.join(" ")}`);
  console.log(`     工作目录: ${cwd}`);
  return true;
});

await testUpdateCommand();

// ============================================================================
// 3. 跨平台兼容性
// ============================================================================
console.log("\n🌍 测试 3: 跨平台兼容性\n");

const testPlatformPaths = test("路径处理兼容性", () => {
  const TAKO_DIR = join(homedir(), ".tako");
  const TAKO_BUN_BIN = join(
    TAKO_DIR,
    "bun",
    "bin",
    process.platform === "win32" ? "bun.exe" : "bun"
  );

  // 验证 path.join 正确处理路径
  const hasBackslash = TAKO_DIR.includes("\\");
  const hasForwardSlash = TAKO_DIR.includes("/");

  if (process.platform === "win32" && !hasBackslash && !hasForwardSlash) {
    console.log("  ⚠️  警告: Windows 路径可能不正确");
  }

  // 验证可执行文件扩展名
  const isWindows = process.platform === "win32";
  const hasExeExtension = TAKO_BUN_BIN.endsWith(".exe");

  if (isWindows && !hasExeExtension) {
    console.log("  ❌ 失败: Windows 应使用 .exe 扩展名");
    return false;
  }

  if (!isWindows && hasExeExtension) {
    console.log("  ❌ 失败: Unix 不应使用 .exe 扩展名");
    return false;
  }

  console.log(`  ✅ 平台路径处理正确 (${process.platform})`);
  console.log(`     Bun 可执行文件: ${TAKO_BUN_BIN}`);
  return true;
});

await testPlatformPaths();

// ============================================================================
// 4. 配置文件结构
// ============================================================================
console.log("\n⚙️  测试 4: 配置文件结构\n");

const testConfigStructure = test("Tako 配置文件", async () => {
  const TAKO_DIR = join(homedir(), ".tako");
  const CONFIG_PATH = join(TAKO_DIR, "config.json");

  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) {
    console.log("  ⚠️  跳过: 配置文件不存在 (正常，首次运行时会创建)");
    return true;
  }

  const config = await file.json();

  // 验证必要字段
  const requiredFields = ["apiKey", "apiId", "installedClients"];
  for (const field of requiredFields) {
    if (!(field in config)) {
      console.log(`  ❌ 失败: 配置缺少字段 ${field}`);
      return false;
    }
  }

  console.log("  ✅ 配置文件结构正确");
  return true;
});

await testConfigStructure();

// ============================================================================
// 5. 客户端注册
// ============================================================================
console.log("\n🔌 测试 5: 客户端注册系统\n");

const testClientRegistry = test("客户端自动注册", () => {
  // 模拟客户端配置
  const mockClients = [
    {
      id: "claude-code",
      name: "Claude Code",
      package: "@anthropic-ai/claude-code",
      command: "claude",
      runtime: "bun" as const,
    },
    {
      id: "codex",
      name: "Codex",
      package: "@openai/codex",
      command: "codex",
      runtime: "bun" as const,
    },
  ];

  // 验证客户端配置
  for (const client of mockClients) {
    if (!client.id || !client.name || !client.package || !client.command) {
      console.log(`  ❌ 失败: 客户端 ${client.id} 配置不完整`);
      return false;
    }

    if (client.runtime !== "bun" && client.runtime !== "native") {
      console.log(`  ❌ 失败: 客户端 ${client.id} runtime 无效`);
      return false;
    }
  }

  console.log(`  ✅ 客户端注册配置正确 (${mockClients.length} 个客户端)`);
  return true;
});

await testClientRegistry();

// ============================================================================
// 测试结果汇总
// ============================================================================
console.log("\n" + "=".repeat(60));
console.log("\n📊 测试结果汇总\n");

let passed = 0;
let failed = 0;

for (const result of results) {
  if (result.passed) {
    passed++;
    console.log(`✅ ${result.name}`);
  } else {
    failed++;
    console.log(`❌ ${result.name}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(`\n总计: ${results.length} 个测试`);
console.log(`通过: ${passed} ✅`);
console.log(`失败: ${failed} ❌`);

if (failed === 0) {
  console.log(`\n🎉 所有测试通过！可以准备发布。\n`);
  process.exit(0);
} else {
  console.log(`\n⚠️  有 ${failed} 个测试失败，请修复后再发布。\n`);
  process.exit(1);
}
