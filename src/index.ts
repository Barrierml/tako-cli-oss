#!/usr/bin/env bun

// 导入客户端（自动注册）
import "./clients";

// 导入模块
import { main } from "./ui";
import { checkAndUpdate } from "./updater";
import { getClient } from "./clients/base";
import { launchClientUnified } from "./launcher";
import { t } from "./i18n";
import { track, identify, shutdown } from "./analytics";
import { statusLineCommand, injectStatusLineConfig } from "./statusline";
import { selectProviderForClient } from "./ui/providers";
import { loadCatalog, refreshCatalog } from "./models";
import { refreshAllTakoCatalogs } from "./models/tako";
import {
  getProviders,
  getClientProvider,
  getDefaultProvider,
  getProvidersForClient,
  resolveProviderContext,
} from "./providers";
import { getClientLaunchOptions, getAllClients } from "./clients/base";
import { listAvailableVersions, installAtVersion, getInstalledVersion } from "./installer-versions";
import { IS_DEV } from "./config";

const VERSION = process.env.VERSION || "dev";

function showHelp() {
  console.log(`
${t("cli.version", { version: VERSION })}

${t("cli.usage")}

${t("cli.options")}
${t("cli.optionVersion")}
${t("cli.optionHelp")}
${t("cli.optionModels")}

${t("cli.commands")}
${t("cli.cmdAgent")}
${t("cli.cmdInstall")}

${t("cli.shortcuts")}
${t("cli.shortcutClaude")}
${t("cli.shortcutCodex")}
${t("cli.shortcutGemini")}

${t("cli.quickFlags")}
${t("cli.quickFlagModel")}
${t("cli.quickFlagYolo")}
${t("cli.quickFlagPrint")}
${t("cli.quickFlagPassthrough")}

${t("cli.examples")}
${t("cli.exampleInteractive")}
${t("cli.exampleModels")}
${t("cli.exampleClaude")}
${t("cli.exampleCodex")}
${t("cli.exampleGemini")}
${t("cli.exampleFull")}
${t("cli.examplePassthrough")}
`);
}

/**
 * tako install <client> [version]
 *  - 仅 client：列出该 client 对应 npm 包的所有版本（标记当前安装版本）
 *  - client+version：安装指定版本到 TOOLS_DIR/<client>
 */
async function runInstallCommand(rest: string[]): Promise<void> {
  const [clientId, version] = rest;
  if (!clientId) {
    console.error("用法: tako install <client> [version]");
    console.error("  tako install claude-code              # 列出所有可用版本");
    console.error("  tako install claude-code 1.0.5        # 安装指定版本");
    process.exit(1);
  }
  const client = getClient(clientId);
  if (!client) {
    console.error(`未知 client: ${clientId}`);
    process.exit(1);
  }

  if (!version) {
    try {
      const versions = await listAvailableVersions(client.package);
      const current = await getInstalledVersion(client);
      const top = versions.slice(0, 30);
      console.log(`${client.name} (${client.package}) 最近 ${top.length} 个版本：`);
      for (const v of top) {
        const marker = v.version === current ? " ← 当前" : "";
        const t = v.publishedAt ? `  ${v.publishedAt.slice(0, 10)}` : "";
        console.log(`  ${v.version}${t}${marker}`);
      }
      console.log(`\n安装：tako install ${clientId} <version>`);
    } catch (e) {
      console.error("获取版本列表失败:", (e as Error).message);
      process.exit(1);
    }
    return;
  }

  console.log(`正在安装 ${client.package}@${version} 到 ${client.id}...`);
  try {
    await installAtVersion(client, version);
    console.log(`✓ ${client.name} 已切换到 ${version}`);
  } catch (e) {
    console.error("安装失败:", (e as Error).message);
    process.exit(1);
  }
}

/**
 * 快捷启动（--claude, --codex, --gemini）
 * 自动选 Provider，不弹 Ink 菜单
 */
/**
 * tako --models — 列出每个 client 可用的模型 id（用于 --model 参数）
 *
 * claude-code / codex 走 launchOptions(provider)：动态项来自 par 服务器目录，
 * 没缓存时回落到内置 whitelist。gemini 没有 launchOptions，给一行透传提示。
 */
async function runListModelsCommand(): Promise<void> {
  loadCatalog();

  // 把所有 tako/custom provider 的两套 catalog（openai / claude）都同步刷一遍，
  // 让本次列表能命中 par 服务端最新模型。冷启动会等 cold buckets，热的后台跑。
  const providers = await getProviders();
  await refreshAllTakoCatalogs(providers).catch(() => {});

  const clients = getAllClients();
  for (const client of clients) {
    // 用该 client 当前绑定的 provider（没绑定走 default）
    const bound = await getClientProvider(client.id);
    const provider = bound ?? (await getDefaultProvider());

    const opts = getClientLaunchOptions(client, provider);
    const models = opts.filter((o) => o.id.startsWith("model-"));

    const headerProvider = provider ? ` (${provider.name})` : "";
    console.log(`\n${client.name}${headerProvider}`);
    if (models.length === 0) {
      if (client.id === "gemini") {
        console.log("  (透传到 gemini CLI：tako --gemini --model gemini-2.5-pro)");
      } else {
        console.log("  (无可用模型 — 请先配置服务商)");
      }
      continue;
    }
    for (const m of models) {
      const id = m.id.slice("model-".length);
      console.log(`  ${id.padEnd(32)} ${m.shortLabel}`);
    }
  }

  console.log(`\n用法: tako --<client> --model <id>`);
  console.log(`示例: tako --codex --model deepseek-v4-pro`);
}

interface Shortcuts {
  model?: string;
  yolo: boolean;
  task?: string;
  rest: string[];
}

/**
 * 从透传参数里抽出 tako 层识别的快捷 flag：
 *   --model <X> / -m <X> / --model=X
 *   --yolo
 *   -p <task> / --print <task>
 * 其余原样保留。
 */
function extractShortcuts(args: string[]): Shortcuts {
  const rest: string[] = [];
  let model: string | undefined;
  let yolo = false;
  let task: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model" || a === "-m") {
      const v = args[i + 1];
      if (v && !v.startsWith("-")) { model = v; i++; continue; }
      rest.push(a);
      continue;
    }
    if (a.startsWith("--model=")) { model = a.slice("--model=".length); continue; }
    if (a === "--yolo") { yolo = true; continue; }
    if (a === "-p" || a === "--print") {
      const v = args[i + 1];
      if (v !== undefined) { task = v; i++; continue; }
      rest.push(a);
      continue;
    }
    if (a.startsWith("--print=")) { task = a.slice("--print=".length); continue; }
    rest.push(a);
  }
  return { model, yolo, task, rest };
}

/**
 * 给定 --model X，在该 client 的所有兼容 provider 中找到目录里包含此 model 的那个。
 * 这一步让 `tako --claude --model deepseek-v4-pro` 自动路由到 par 而不是 OAuth 订阅。
 * 找不到返回 null（让上层回落到默认绑定，让用户看到原生报错）。
 *
 * 副作用：返回匹配 launchOption 的 args（已带 [1m] 后缀等正确标记）。
 */
async function findProviderForModel(
  client: ReturnType<typeof getClient>,
  model: string,
): Promise<{ providerCtx: ReturnType<typeof resolveProviderContext>; modelArgs: string[] } | null> {
  if (!client) return null;
  const providers = await getProvidersForClient(client.id);
  for (const p of providers) {
    const opts = getClientLaunchOptions(client, p);
    const match = opts.find((o) => o.id === `model-${model}`);
    if (match) {
      return { providerCtx: resolveProviderContext(p), modelArgs: match.args };
    }
  }
  return null;
}

/**
 * 把 tako 层 --yolo / -p / --model 翻译成各 client 的原生 args。
 *
 *   claude-code: --model X[1m] / --dangerously-skip-permissions / -p "task"
 *   codex:       exec / --model X / --dangerously-bypass-approvals-and-sandbox / "task"
 *                （codex 模型靠 config.toml；CLI 仍带 --model 兼容 codex#7782 后只剩 responses）
 *   gemini:      --model X / --yolo / -p "task"
 *
 * 顺序很关键：codex 的 exec 必须在最前；prompt 是末尾位置参数。
 */
function buildClientArgs(
  clientId: string,
  modelArgs: string[],
  yolo: boolean,
  task: string | undefined,
  rest: string[],
): string[] {
  const out: string[] = [];
  switch (clientId) {
    case "claude-code":
      out.push(...modelArgs);
      if (yolo) out.push("--dangerously-skip-permissions");
      if (task) out.push("-p", task);
      out.push(...rest);
      return out;
    case "codex":
      if (task) out.push("exec");
      out.push(...modelArgs);
      if (yolo) out.push("--dangerously-bypass-approvals-and-sandbox");
      out.push(...rest);
      if (task) out.push(task);
      return out;
    case "gemini":
      out.push(...modelArgs);
      if (yolo) out.push("--yolo");
      if (task) out.push("-p", task);
      out.push(...rest);
      return out;
    default:
      return [...modelArgs, ...rest, ...(task ? [task] : [])];
  }
}

async function quickLaunch(
  clientId: string,
  clientName: string,
  passthroughArgs: string[],
): Promise<void> {
  const client = getClient(clientId);
  if (!client) {
    console.error(t("cli.clientNotFound", { client: clientName }));
    process.exit(1);
  }

  const { model, yolo, task, rest } = extractShortcuts(passthroughArgs);

  // 模型 → provider 路由：用户显式指定模型时，找一个目录包含该模型的 provider，
  // 不被 client 当前绑定（可能是 OAuth 订阅，访问不到 deepseek 等模型）卡住。
  let providerContext = null;
  let modelArgs: string[] = [];
  if (model) {
    // 先把 par 目录刷一下，避免冷启动找不到匹配 provider 而误回落默认
    const allProviders = await getProviders();
    await refreshAllTakoCatalogs(allProviders).catch(() => {});

    const found = await findProviderForModel(client, model);
    if (found) {
      providerContext = found.providerCtx;
      modelArgs = found.modelArgs;
    } else {
      // 没匹配上：保持默认 provider，args 用裸 --model X，让子进程把真实错误抛出来
      modelArgs = ["--model", model];
    }
  }

  if (!providerContext) {
    providerContext = await selectProviderForClient(clientId);
    if (!providerContext) {
      console.error("未配置可用的服务商");
      process.exit(1);
    }
  }

  const finalArgs = buildClientArgs(clientId, modelArgs, yolo, task, rest);
  const selectedOptionIds = model ? [`model-${model}`] : undefined;

  const result = await launchClientUnified(client, {
    providerContext,
    args: finalArgs,
    selectedOptionIds,
  });
  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }
}

async function run() {
  const args = process.argv.slice(2);

  // statusline 命令（被 Claude Code 调用，需要快速响应）
  if (args[0] === "statusline") {
    loadCatalog(); // 同步加载模型目录（统计窗口大小用）
    await statusLineCommand();
    return;
  }

  // install 命令：tako install <client> [version]
  // - 不带 version：列出 npm registry 上的所有版本
  // - 带 version：安装该版本到 TOOLS_DIR/<client>
  if (args[0] === "install") {
    await runInstallCommand(args.slice(1));
    return;
  }

  // agent 子命令：管理 claude/codex session（list/start/send/cancel/close/...）
  if (args[0] === "agent") {
    const { runAgentCommand } = await import("./agent/cmd");
    await runAgentCommand(args.slice(1));
    return;
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(`Tako CLI v${VERSION}`);
    return;
  }

  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    return;
  }

  // dev 模式不自动更新：源码直跑（VERSION=dev）/ 显式 TAKO_DEV / localhost server
  const isDev = VERSION === "dev" || IS_DEV;

  // tako --models — 列模型，不进 Ink TUI
  if (args.includes("--models")) {
    await runListModelsCommand();
    return;
  }

  // 初始化埋点
  identify();
  track("cli_started");

  // 快捷启动命令 — 除快捷 flag 自身外的所有参数都透传给底层 client
  // 支持 `--` 分隔符：`tako --claude -- --model sonnet "hi"`
  const shortcut = args.find((a) => a === "--claude" || a === "--codex" || a === "--gemini");
  if (shortcut) {
    const rest = args.filter((a) => a !== shortcut);
    const sepIdx = rest.indexOf("--");
    const passthrough = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest;
    if (!isDev) await checkAndUpdate();
    if (shortcut === "--claude") await quickLaunch("claude-code", "Claude Code", passthrough);
    else if (shortcut === "--codex") await quickLaunch("codex", "Codex", passthrough);
    else await quickLaunch("gemini", "Gemini CLI", passthrough);
    return;
  }

  // 检查自动更新
  if (!isDev) await checkAndUpdate();

  // 注入 statusline 配置到 Claude Code
  injectStatusLineConfig().catch(() => {});

  // 模型目录：先同步加载本地缓存，再后台刷新最新（不阻塞主程序）
  loadCatalog();
  refreshCatalog().catch(() => {});

  // 运行 Ink TUI 主程序
  await main();
}

process.on("beforeExit", async () => { await shutdown(); });
process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });

run().catch(async (error) => {
  console.error(t("cli.cliError"), error);
  await shutdown();
  process.exit(1);
});
