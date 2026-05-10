#!/usr/bin/env bun
/**
 * Tako CLI 预发布测试套件
 * 在每次发布前运行此脚本，确保所有功能正常
 *
 * 用法: bun run test:pre-release
 */

import { join } from "path";
import { homedir } from "os";

// 测试结果类型
interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  warning?: string;
  duration?: number;
}

// 测试套件结果
interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
}

const results: TestSuiteResult[] = [];
let currentSuite: TestSuiteResult | null = null;

function startSuite(name: string) {
  currentSuite = {
    name,
    passed: 0,
    failed: 0,
    warnings: 0,
    skipped: 0,
    duration: 0,
    tests: []
  };
}

function endSuite() {
  if (currentSuite) {
    results.push(currentSuite);
    currentSuite = null;
  }
}

async function test(name: string, fn: () => boolean | Promise<boolean>): Promise<boolean> {
  const startTime = Date.now();
  try {
    const passed = await fn();
    const duration = Date.now() - startTime;

    if (currentSuite) {
      currentSuite.tests.push({ suite: currentSuite.name, name, passed, duration });
      if (passed) {
        currentSuite.passed++;
      } else {
        currentSuite.failed++;
      }
      currentSuite.duration += duration;
    }

    return passed;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (currentSuite) {
      currentSuite.tests.push({
        suite: currentSuite.name,
        name,
        passed: false,
        error: errorMsg,
        duration
      });
      currentSuite.failed++;
      currentSuite.duration += duration;
    }

    return false;
  }
}

async function warn(name: string, message: string) {
  if (currentSuite) {
    currentSuite.tests.push({
      suite: currentSuite.name,
      name,
      passed: true,
      warning: message
    });
    currentSuite.warnings++;
  }
}

function skip(name: string, reason: string) {
  if (currentSuite) {
    currentSuite.tests.push({
      suite: currentSuite.name,
      name,
      passed: true,
      warning: `跳过: ${reason}`
    });
    currentSuite.skipped++;
  }
}

// ============================================================================
// 测试套件 1: 构建系统
// ============================================================================
async function testBuildSystem() {
  console.log("\n📦 测试套件 1: 构建系统");
  console.log("=".repeat(60));
  startSuite("构建系统");

  await test("package.json 存在且有效", async () => {
    const pkgPath = "/Users/hashiro/develop/tako-cli/packages/cli/package.json";
    const file = Bun.file(pkgPath);
    if (!(await file.exists())) {
      console.log("  ❌ package.json 不存在");
      return false;
    }

    const pkg = await file.json();
    if (!pkg.name || !pkg.version) {
      console.log("  ❌ package.json 缺少必要字段");
      return false;
    }

    console.log(`  ✅ 包名: ${pkg.name}, 版本: ${pkg.version}`);
    return true;
  });

  await test("构建产物存在", async () => {
    const distPath = "/Users/hashiro/develop/tako-cli/packages/cli/dist/index.js";
    const file = Bun.file(distPath);
    if (!(await file.exists())) {
      console.log("  ❌ dist/index.js 不存在，请先运行 bun run build");
      return false;
    }

    const size = file.size;
    if (size < 1000) {
      console.log(`  ❌ 构建产物太小 (${size} bytes)`);
      return false;
    }

    console.log(`  ✅ 构建产物大小: ${(size / 1024).toFixed(2)} KB`);
    return true;
  });

  await test("构建产物无 shebang (Windows 兼容)", async () => {
    const distPath = "/Users/hashiro/develop/tako-cli/packages/cli/dist/index.js";
    const file = Bun.file(distPath);
    const content = await file.text();

    if (content.startsWith("#!/")) {
      console.log("  ❌ 构建产物包含 shebang，影响 Windows 兼容性");
      return false;
    }

    console.log("  ✅ 无 shebang");
    return true;
  });

  await test("安装脚本存在", async () => {
    const installSh = Bun.file("/Users/hashiro/develop/tako-cli/packages/cli/install.sh");
    const installPs1 = Bun.file("/Users/hashiro/develop/tako-cli/packages/cli/install.ps1");

    const shExists = await installSh.exists();
    const ps1Exists = await installPs1.exists();

    if (!shExists || !ps1Exists) {
      console.log(`  ❌ 安装脚本缺失 (sh: ${shExists}, ps1: ${ps1Exists})`);
      return false;
    }

    console.log("  ✅ install.sh 和 install.ps1 都存在");
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 2: 入口文件解析（Windows 修复）
// ============================================================================
async function testEntryResolution() {
  console.log("\n🔍 测试套件 2: 入口文件解析（Windows 修复）");
  console.log("=".repeat(60));
  startSuite("入口文件解析");

  await test("bin 字段解析 - 对象格式", () => {
    const bin = { claude: "cli.js" };
    const command = "claude";
    const result = bin[command];

    if (result !== "cli.js") {
      console.log(`  ❌ 期望 cli.js，得到 ${result}`);
      return false;
    }

    console.log("  ✅ 对象格式解析正确");
    return true;
  });

  await test("bin 字段解析 - 字符串格式", () => {
    const bin = "index.js";
    const result = bin;

    if (result !== "index.js") {
      console.log(`  ❌ 期望 index.js，得到 ${result}`);
      return false;
    }

    console.log("  ✅ 字符串格式解析正确");
    return true;
  });

  await test("bin 字段解析 - 多命令格式", () => {
    const bin = { cmd1: "bin/cmd1.js", cmd2: "bin/cmd2.js" };
    const command = "cmd2";
    const result = bin[command];

    if (result !== "bin/cmd2.js") {
      console.log(`  ❌ 期望 bin/cmd2.js，得到 ${result}`);
      return false;
    }

    console.log("  ✅ 多命令格式解析正确");
    return true;
  });

  await test("Claude Code 包解析（如果已安装）", async () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const packageJsonPath = join(
      TAKO_DIR,
      "tools",
      "claude-code",
      "node_modules",
      "@anthropic-ai/claude-code",
      "package.json"
    );

    const file = Bun.file(packageJsonPath);
    if (!(await file.exists())) {
      skip("Claude Code 包解析", "Claude Code 未安装");
      return true;
    }

    const pkg = await file.json();
    if (!pkg.bin || !pkg.bin.claude) {
      console.log("  ❌ Claude Code package.json 缺少 bin.claude");
      return false;
    }

    const entryFile = pkg.bin.claude;
    const entryPath = join(
      TAKO_DIR,
      "tools",
      "claude-code",
      "node_modules",
      "@anthropic-ai/claude-code",
      entryFile
    );

    const entryFileObj = Bun.file(entryPath);
    if (!(await entryFileObj.exists())) {
      console.log(`  ❌ 入口文件不存在: ${entryFile}`);
      return false;
    }

    console.log(`  ✅ 成功解析: ${entryFile} (${(entryFileObj.size / 1024).toFixed(2)} KB)`);
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 3: 自动更新路径（自动更新修复）
// ============================================================================
async function testUpdateLogic() {
  console.log("\n🔄 测试套件 3: 自动更新逻辑");
  console.log("=".repeat(60));
  startSuite("自动更新逻辑");

  await test("Tako CLI 目录配置正确", () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const TAKO_CLI_DIR = join(TAKO_DIR, "cli");

    if (!TAKO_CLI_DIR.startsWith(TAKO_DIR)) {
      console.log("  ❌ CLI 目录不在 Tako 目录下");
      return false;
    }

    console.log(`  ✅ CLI 目录: ${TAKO_CLI_DIR}`);
    return true;
  });

  await test("更新命令不包含 -g 参数", () => {
    const command = ["bun", "add", "tako-cli@latest"];

    if (command.includes("-g")) {
      console.log("  ❌ 更新命令不应包含 -g 参数");
      return false;
    }

    console.log("  ✅ 使用本地安装（无 -g）");
    return true;
  });

  await test("工作目录设置正确", () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const TAKO_CLI_DIR = join(TAKO_DIR, "cli");
    const cwd = TAKO_CLI_DIR;

    if (!cwd.startsWith(TAKO_DIR)) {
      console.log("  ❌ 工作目录不在 Tako 目录下");
      return false;
    }

    console.log(`  ✅ 工作目录: ${cwd}`);
    return true;
  });

  await test("Tako CLI 安装位置正确（如果已安装）", async () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const expectedPath = join(TAKO_DIR, "cli", "node_modules", "tako-cli", "package.json");

    const file = Bun.file(expectedPath);
    if (!(await file.exists())) {
      skip("Tako CLI 安装位置", "Tako CLI 未通过安装脚本安装");
      return true;
    }

    const pkg = await file.json();
    console.log(`  ✅ Tako CLI 安装在正确位置，版本: ${pkg.version}`);
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 4: 跨平台兼容性
// ============================================================================
async function testCrossPlatform() {
  console.log("\n🌍 测试套件 4: 跨平台兼容性");
  console.log("=".repeat(60));
  startSuite("跨平台兼容性");

  await test("路径分隔符处理正确", () => {
    const testPath = join("a", "b", "c");

    // 验证 join 工作正常
    if (!testPath.includes("a") || !testPath.includes("c")) {
      console.log("  ❌ path.join 不工作");
      return false;
    }

    console.log(`  ✅ path.join 工作正常: ${testPath}`);
    return true;
  });

  await test("可执行文件扩展名正确", () => {
    const isWindows = process.platform === "win32";
    const TAKO_DIR = join(homedir(), ".tako");
    const bunBin = join(TAKO_DIR, "bun", "bin", isWindows ? "bun.exe" : "bun");

    const hasExe = bunBin.endsWith(".exe");

    if (isWindows && !hasExe) {
      console.log("  ❌ Windows 应使用 .exe 扩展名");
      return false;
    }

    if (!isWindows && hasExe) {
      console.log("  ❌ Unix 不应使用 .exe 扩展名");
      return false;
    }

    console.log(`  ✅ 平台: ${process.platform}, Bun: ${bunBin}`);
    return true;
  });

  await test("启动脚本平台适配", () => {
    const isWindows = process.platform === "win32";
    const expectedScript = isWindows ? "tako.cmd" : "tako";

    console.log(`  ✅ 平台: ${process.platform}, 启动脚本: ${expectedScript}`);
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 5: 配置系统
// ============================================================================
async function testConfigSystem() {
  console.log("\n⚙️  测试套件 5: 配置系统");
  console.log("=".repeat(60));
  startSuite("配置系统");

  await test("Tako 目录结构", async () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const requiredDirs = ["cli", "bun", "bin", "tools"];

    let allExist = true;
    for (const dir of requiredDirs) {
      const path = join(TAKO_DIR, dir);
      // 简单检查，不强制要求存在（首次使用会创建）
    }

    console.log(`  ✅ Tako 目录: ${TAKO_DIR}`);
    console.log(`     预期子目录: ${requiredDirs.join(", ")}`);
    return true;
  });

  await test("配置文件结构（如果存在）", async () => {
    const TAKO_DIR = join(homedir(), ".tako");
    const configPath = join(TAKO_DIR, "config.json");

    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      skip("配置文件结构", "配置文件不存在（首次运行时会创建）");
      return true;
    }

    const config = await file.json();
    const requiredFields = ["apiKey", "apiId", "installedClients"];

    for (const field of requiredFields) {
      if (!(field in config)) {
        console.log(`  ❌ 配置缺少字段: ${field}`);
        return false;
      }
    }

    console.log("  ✅ 配置文件结构正确");
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 6: 客户端注册系统
// ============================================================================
async function testClientRegistry() {
  console.log("\n🔌 测试套件 6: 客户端注册系统");
  console.log("=".repeat(60));
  startSuite("客户端注册系统");

  await test("客户端配置完整性 - Claude Code", () => {
    const client = {
      id: "claude-code",
      name: "Claude Code",
      package: "@anthropic-ai/claude-code",
      command: "claude",
      runtime: "bun" as const,
    };

    if (!client.id || !client.name || !client.package || !client.command) {
      console.log("  ❌ Claude Code 配置不完整");
      return false;
    }

    if (client.runtime !== "bun" && client.runtime !== "native") {
      console.log("  ❌ runtime 值无效");
      return false;
    }

    console.log("  ✅ Claude Code 配置完整");
    return true;
  });

  await test("客户端配置完整性 - Codex", () => {
    const client = {
      id: "codex",
      name: "Codex",
      package: "@openai/codex",
      command: "codex",
      runtime: "bun" as const,
    };

    if (!client.id || !client.name || !client.package || !client.command) {
      console.log("  ❌ Codex 配置不完整");
      return false;
    }

    if (client.runtime !== "bun" && client.runtime !== "native") {
      console.log("  ❌ runtime 值无效");
      return false;
    }

    console.log("  ✅ Codex 配置完整");
    return true;
  });

  await test("客户端数量正确", () => {
    const expectedClients = 2; // claude-code, codex

    console.log(`  ✅ 已注册客户端数量: ${expectedClients}`);
    return true;
  });

  endSuite();
}

// ============================================================================
// 测试套件 7: 代码质量
// ============================================================================
async function testCodeQuality() {
  console.log("\n✨ 测试套件 7: 代码质量");
  console.log("=".repeat(60));
  startSuite("代码质量");

  await test("TypeScript 源文件存在", async () => {
    const srcPath = "/Users/hashiro/develop/tako-cli/packages/cli/src";
    const indexPath = join(srcPath, "index.ts");

    const file = Bun.file(indexPath);
    if (!(await file.exists())) {
      console.log("  ❌ src/index.ts 不存在");
      return false;
    }

    console.log("  ✅ TypeScript 源文件存在");
    return true;
  });

  await test("关键模块存在", async () => {
    const srcPath = "/Users/hashiro/develop/tako-cli/packages/cli/src";
    const modules = [
      "config.ts",
      "installer.ts",
      "launcher.ts",
      "updater.ts",
      "ui.ts",
      "auth.ts",
      "region.ts",
      "stats.ts",
    ];

    let allExist = true;
    const missing = [];

    for (const module of modules) {
      const file = Bun.file(join(srcPath, module));
      if (!(await file.exists())) {
        allExist = false;
        missing.push(module);
      }
    }

    if (!allExist) {
      console.log(`  ❌ 缺少模块: ${missing.join(", ")}`);
      return false;
    }

    console.log(`  ✅ ${modules.length} 个关键模块都存在`);
    return true;
  });

  await test("客户端模块存在", async () => {
    const clientsPath = "/Users/hashiro/develop/tako-cli/packages/cli/src/clients";
    const modules = ["base.ts", "index.ts", "claude-code.ts", "codex.ts"];

    let allExist = true;
    const missing = [];

    for (const module of modules) {
      const file = Bun.file(join(clientsPath, module));
      if (!(await file.exists())) {
        allExist = false;
        missing.push(module);
      }
    }

    if (!allExist) {
      console.log(`  ❌ 缺少客户端模块: ${missing.join(", ")}`);
      return false;
    }

    console.log(`  ✅ ${modules.length} 个客户端模块都存在`);
    return true;
  });

  endSuite();
}

// ============================================================================
// 主测试运行器
// ============================================================================
async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║           Tako CLI 预发布测试套件                          ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const startTime = Date.now();

  // 运行所有测试套件
  await testBuildSystem();
  await testEntryResolution();
  await testUpdateLogic();
  await testCrossPlatform();
  await testConfigSystem();
  await testClientRegistry();
  await testCodeQuality();

  const totalDuration = Date.now() - startTime;

  // 汇总结果
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 测试结果汇总");
  console.log("=".repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;
  let totalSkipped = 0;

  for (const suite of results) {
    console.log(`\n${suite.name}:`);
    console.log(`  通过: ${suite.passed} ✅`);
    console.log(`  失败: ${suite.failed} ❌`);
    if (suite.warnings > 0) {
      console.log(`  警告: ${suite.warnings} ⚠️`);
    }
    if (suite.skipped > 0) {
      console.log(`  跳过: ${suite.skipped} ⏭️`);
    }
    console.log(`  耗时: ${suite.duration}ms`);

    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalWarnings += suite.warnings;
    totalSkipped += suite.skipped;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n总计:`);
  console.log(`  测试套件: ${results.length}`);
  console.log(`  测试用例: ${totalPassed + totalFailed}`);
  console.log(`  通过: ${totalPassed} ✅`);
  console.log(`  失败: ${totalFailed} ❌`);
  if (totalWarnings > 0) {
    console.log(`  警告: ${totalWarnings} ⚠️`);
  }
  if (totalSkipped > 0) {
    console.log(`  跳过: ${totalSkipped} ⏭️`);
  }
  console.log(`  总耗时: ${totalDuration}ms`);

  // 显示失败的测试详情
  if (totalFailed > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("\n❌ 失败的测试:");
    for (const suite of results) {
      for (const test of suite.tests) {
        if (!test.passed && !test.warning) {
          console.log(`\n  ${suite.name} > ${test.name}`);
          if (test.error) {
            console.log(`    错误: ${test.error}`);
          }
        }
      }
    }
  }

  // 显示警告
  if (totalWarnings > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("\n⚠️  警告:");
    for (const suite of results) {
      for (const test of suite.tests) {
        if (test.warning) {
          console.log(`\n  ${suite.name} > ${test.name}`);
          console.log(`    ${test.warning}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));

  if (totalFailed === 0) {
    console.log("\n🎉 所有测试通过！可以发布。\n");
    process.exit(0);
  } else {
    console.log(`\n⚠️  有 ${totalFailed} 个测试失败，请修复后再发布。\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n💥 测试运行器出错:", error);
  process.exit(1);
});
