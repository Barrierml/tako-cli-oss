#!/usr/bin/env bun
/**
 * 构建脚本 - 打包为 JS bundle
 */

const pkg = await Bun.file("package.json").json();
const version = pkg.version;

console.log(`Building Tako CLI v${version}...`);

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  naming: "index.js",
  minify: true,
  target: "bun",
  // ink 内部 devtools 引入 react-devtools-core 作为可选 dep，运行时若没装也不会用，
  // 标 external 避免 bundler 找不到时报错
  external: ["react-devtools-core"],
  define: {
    "process.env.VERSION": JSON.stringify(version),
  },
});

if (result.success) {
  const file = result.outputs[0];
  const size = (file.size / 1024).toFixed(2);
  console.log(`  ✓ dist/index.js (${size} KB)`);

  // 确保有 shebang，这样 Unix 系统可以直接执行
  // Windows 不使用 shebang，有没有都不影响
  let content = await Bun.file("dist/index.js").text();
  if (!content.startsWith("#!/usr/bin/env bun")) {
    content = "#!/usr/bin/env bun\n" + content;
    await Bun.write("dist/index.js", content);
    console.log(`  ✓ 已添加 shebang`);
  }
} else {
  console.error("Build failed:");
  result.logs.forEach((log) => console.error(log));
  process.exit(1);
}
