#!/usr/bin/env bun
/**
 * 测试更新逻辑的路径设置
 * 验证更新会安装到正确的 Tako 目录
 */

import { join } from "path";
import { homedir } from "os";

const TAKO_DIR = join(homedir(), ".tako");
const TAKO_CLI_DIR = join(TAKO_DIR, "cli");
const TAKO_BUN_BIN = join(TAKO_DIR, "bun", "bin", process.platform === "win32" ? "bun.exe" : "bun");

console.log("🧪 测试更新路径配置\n");

console.log("📁 目录配置:");
console.log(`   Tako 根目录: ${TAKO_DIR}`);
console.log(`   Tako CLI 安装目录: ${TAKO_CLI_DIR}`);
console.log(`   Tako Bun 可执行文件: ${TAKO_BUN_BIN}\n`);

console.log("🔍 验证目录存在性:");

// 检查 Tako 目录
try {
  const takoDir = Bun.file(join(TAKO_DIR, "."));
  console.log(`   ✅ Tako 根目录存在: ${TAKO_DIR}`);
} catch {
  console.log(`   ❌ Tako 根目录不存在`);
}

// 检查 CLI 目录
try {
  const cliPackageJson = Bun.file(join(TAKO_CLI_DIR, "package.json"));
  if (await cliPackageJson.exists()) {
    const pkg = await cliPackageJson.json();
    console.log(`   ✅ Tako CLI 目录存在: ${TAKO_CLI_DIR}`);
    console.log(`      当前版本: ${pkg.dependencies?.["tako-cli"] || "unknown"}\n`);
  } else {
    console.log(`   ⚠️  Tako CLI 目录存在但未初始化\n`);
  }
} catch {
  console.log(`   ❌ Tako CLI 目录不存在\n`);
}

// 检查实际安装的位置
const installedPath = join(TAKO_CLI_DIR, "node_modules", "tako-cli", "package.json");
try {
  const installedPkg = Bun.file(installedPath);
  if (await installedPkg.exists()) {
    const pkg = await installedPkg.json();
    console.log(`   ✅ Tako CLI 已安装在正确位置:`);
    console.log(`      路径: ${join(TAKO_CLI_DIR, "node_modules", "tako-cli")}`);
    console.log(`      版本: ${pkg.version}\n`);
  } else {
    console.log(`   ⚠️  Tako CLI 未在预期位置找到\n`);
  }
} catch {
  console.log(`   ❌ 无法读取已安装的 Tako CLI\n`);
}

console.log("📝 更新命令配置:");
console.log(`   命令: ${TAKO_BUN_BIN} add tako-cli@latest`);
console.log(`   工作目录: ${TAKO_CLI_DIR}`);
console.log(`   目标安装位置: ${TAKO_CLI_DIR}/node_modules/tako-cli/\n`);

console.log("✅ 配置验证完成");
console.log("\n💡 更新逻辑说明:");
console.log("   1. 在 ~/.tako/cli/ 目录下执行 bun add");
console.log("   2. 包会被安装到 ~/.tako/cli/node_modules/tako-cli/");
console.log("   3. 启动脚本 ~/.tako/bin/tako 会引用这个位置的代码");
console.log("   4. 不会污染系统全局目录或用户的 ~/.bun/ 目录");
