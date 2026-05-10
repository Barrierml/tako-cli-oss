#!/usr/bin/env bun
/**
 * 验证实际的 Claude Code 包能否被正确解析
 */

import { join } from "path";
import { homedir } from "os";

const TAKO_DIR = join(homedir(), ".tako");
const TOOLS_DIR = join(TAKO_DIR, "tools");

async function verifyClaudeCode() {
  console.log("🔍 验证 Claude Code 包解析\n");

  const clientId = "claude-code";
  const packageName = "@anthropic-ai/claude-code";
  const command = "claude";

  const clientDir = join(TOOLS_DIR, clientId);
  const packageJsonPath = join(clientDir, "node_modules", packageName, "package.json");

  console.log(`客户端目录: ${clientDir}`);
  console.log(`Package.json 路径: ${packageJsonPath}\n`);

  try {
    const file = Bun.file(packageJsonPath);

    if (!(await file.exists())) {
      console.log("❌ Package.json 不存在");
      console.log("   请先运行 tako --claude 安装 Claude Code\n");
      return false;
    }

    console.log("✅ Package.json 存在\n");

    const packageJson = await file.json();
    console.log("📦 Package 信息:");
    console.log(`   名称: ${packageJson.name}`);
    console.log(`   版本: ${packageJson.version}`);
    console.log(`   Bin 字段: ${JSON.stringify(packageJson.bin, null, 2)}\n`);

    const binField = packageJson.bin;

    if (!binField) {
      console.log("❌ 没有 bin 字段");
      return false;
    }

    let entryFile: string | null = null;

    if (typeof binField === "string") {
      entryFile = binField;
    } else if (typeof binField === "object" && binField[command]) {
      entryFile = binField[command];
    }

    if (!entryFile) {
      console.log(`❌ 无法解析命令 "${command}" 的入口文件`);
      return false;
    }

    console.log(`✅ 解析到入口文件: ${entryFile}\n`);

    // 验证入口文件是否存在
    const fullPath = join(clientDir, "node_modules", packageName, entryFile);
    console.log(`完整路径: ${fullPath}`);

    const entryFileObj = Bun.file(fullPath);
    if (await entryFileObj.exists()) {
      const size = entryFileObj.size;
      console.log(`✅ 入口文件存在 (${(size / 1024).toFixed(2)} KB)\n`);
      return true;
    } else {
      console.log("❌ 入口文件不存在\n");
      return false;
    }
  } catch (error) {
    console.log(`❌ 验证失败: ${error instanceof Error ? error.message : "未知错误"}\n`);
    return false;
  }
}

const success = await verifyClaudeCode();

if (success) {
  console.log("🎉 验证成功！新的入口解析逻辑能够正确工作。");
} else {
  console.log("⚠️  验证失败。可能需要先安装 Claude Code。");
}
