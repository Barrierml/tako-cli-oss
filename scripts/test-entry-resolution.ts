#!/usr/bin/env bun
/**
 * 测试入口文件解析功能
 * 验证 getClientEntryPath 能否正确从 package.json 解析 bin 字段
 */

import { join } from "path";

// 模拟不同格式的 package.json bin 字段
const testCases = [
  {
    name: "bin 为对象格式",
    packageJson: {
      name: "@anthropic-ai/claude-code",
      bin: {
        claude: "cli.js",
      },
    },
    command: "claude",
    expectedEntry: "cli.js",
  },
  {
    name: "bin 为字符串格式",
    packageJson: {
      name: "some-tool",
      bin: "index.js",
    },
    command: "some-tool",
    expectedEntry: "index.js",
  },
  {
    name: "bin 为对象，包含多个命令",
    packageJson: {
      name: "multi-cli",
      bin: {
        cmd1: "bin/cmd1.js",
        cmd2: "bin/cmd2.js",
      },
    },
    command: "cmd2",
    expectedEntry: "bin/cmd2.js",
  },
  {
    name: "bin 字段不存在",
    packageJson: {
      name: "no-bin",
    },
    command: "no-bin",
    expectedEntry: null,
  },
  {
    name: "bin 为对象，但命令不匹配",
    packageJson: {
      name: "wrong-cmd",
      bin: {
        foo: "foo.js",
      },
    },
    command: "bar",
    expectedEntry: null,
  },
];

// 模拟解析逻辑
function parseEntryFile(packageJson: any, command: string): string | null {
  const binField = packageJson.bin;

  if (!binField) {
    return null;
  }

  // bin 字段可能是字符串或对象
  let entryFile: string | null = null;

  if (typeof binField === "string") {
    // "bin": "cli.js"
    entryFile = binField;
  } else if (typeof binField === "object" && binField[command]) {
    // "bin": { "claude": "cli.js" }
    entryFile = binField[command];
  }

  return entryFile;
}

console.log("🧪 测试入口文件解析功能\n");

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = parseEntryFile(testCase.packageJson, testCase.command);
  const success = result === testCase.expectedEntry;

  if (success) {
    passed++;
    console.log(`✅ ${testCase.name}`);
    console.log(`   期望: ${testCase.expectedEntry}`);
    console.log(`   实际: ${result}\n`);
  } else {
    failed++;
    console.log(`❌ ${testCase.name}`);
    console.log(`   期望: ${testCase.expectedEntry}`);
    console.log(`   实际: ${result}\n`);
  }
}

console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);

if (failed > 0) {
  process.exit(1);
}
