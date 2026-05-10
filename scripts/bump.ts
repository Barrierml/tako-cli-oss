#!/usr/bin/env bun
/**
 * 版本号更新脚本
 * 用法:
 *   bun scripts/bump.ts patch    # 0.1.2 -> 0.1.3
 *   bun scripts/bump.ts minor    # 0.1.2 -> 0.2.0
 *   bun scripts/bump.ts major    # 0.1.2 -> 1.0.0
 *   bun scripts/bump.ts 0.2.0    # 直接指定版本
 */

const PACKAGE_JSON = "package.json";

type BumpType = "patch" | "minor" | "major";

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "-h" || arg === "--help") {
    console.log("用法: bun run bump <patch|minor|major|x.y.z>");
    console.log("");
    console.log("示例:");
    console.log("  bun run bump patch    # 0.1.2 -> 0.1.3");
    console.log("  bun run bump minor    # 0.1.2 -> 0.2.0");
    console.log("  bun run bump major    # 0.1.2 -> 1.0.0");
    console.log("  bun run bump 0.2.0    # 直接指定版本");
    console.log("");
    console.log("快捷命令:");
    console.log("  bun run release       # bump patch + npm publish");
    process.exit(0);
  }

  // 读取当前版本
  const pkg = await Bun.file(PACKAGE_JSON).json();
  const currentVersion = pkg.version;

  // 计算新版本
  let newVersion: string;
  if (["patch", "minor", "major"].includes(arg)) {
    newVersion = bumpVersion(currentVersion, arg as BumpType);
  } else if (isValidVersion(arg)) {
    newVersion = arg;
  } else {
    console.error(`无效的版本号或类型: ${arg}`);
    process.exit(1);
  }

  console.log(`版本更新: ${currentVersion} -> ${newVersion}`);

  // 更新 package.json
  pkg.version = newVersion;
  await Bun.write(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ✓ ${PACKAGE_JSON}`);

  console.log(`\n完成! 新版本: ${newVersion}`);
  console.log(`(版本号会在构建时自动注入)`);
}

main();
