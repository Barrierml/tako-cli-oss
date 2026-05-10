/**
 * Internationalization (i18n) Module
 *
 * Provides bilingual support (English/Chinese) based on system locale.
 */

export type Locale = "en" | "zh";

// Manual locale override
let manualLocale: Locale | null = null;

/**
 * Detect system locale from environment variables
 *
 * Checks multiple sources:
 * - LANG, LANGUAGE, LC_ALL (Unix/Linux/macOS)
 * - Node.js Intl API (cross-platform)
 */
export function detectLocale(): Locale {
  // Check manual override first
  if (manualLocale) {
    return manualLocale;
  }

  // Try environment variables first (Unix-like systems)
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || "";
  if (envLang.toLowerCase().includes("zh") || envLang.toLowerCase().includes("chinese")) {
    return "zh";
  }

  // Try Node.js Intl API (works on all platforms including Windows)
  try {
    const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (systemLocale.toLowerCase().startsWith("zh")) {
      return "zh";
    }
  } catch {
    // Intl API not available, continue
  }

  // Default to Chinese
  return "zh";
}

/**
 * Set manual locale override
 */
export function setLocale(locale: Locale): void {
  manualLocale = locale;
}

/**
 * Clear manual locale override
 */
export function clearLocaleOverride(): void {
  manualLocale = null;
}

/**
 * Translation dictionary
 */
const translations = {
  // Launcher
  launcher: {
    starting: {
      en: "Starting {client}...",
      zh: "正在启动 {client}...",
    },
    directoryNotFound: {
      en: "Directory not found: {path}",
      zh: "目录不存在：{path}",
    },
    apiKeyNotConfigured: {
      en: "API Key not configured",
      zh: "API Key 未配置",
    },
    error: {
      en: "Error: {message}",
      zh: "错误：{message}",
    },
  },

  // Menu
  menu: {
    selectAction: {
      en: "Select an action:",
      zh: "请选择操作：",
    },
    launchClient: {
      en: "Launch {client}",
      zh: "启动 {client}",
    },
    advanced: {
      en: "Advanced",
      zh: "高级",
    },
    advancedHint: {
      en: "Usage stats, configuration, etc.",
      zh: "用量统计、配置等",
    },
    exit: {
      en: "Exit",
      zh: "退出",
    },
    advancedOptions: {
      en: "Advanced Options:",
      zh: "高级选项：",
    },
    viewStats: {
      en: "View Usage Statistics",
      zh: "查看用量统计",
    },
    configApiKey: {
      en: "Configure API Key",
      zh: "配置 API Key",
    },
    back: {
      en: "Back",
      zh: "返回",
    },
    changeLanguage: {
      en: "Change Language",
      zh: "切换语言",
    },
    currentLanguage: {
      en: "Current Language: {lang}",
      zh: "当前语言：{lang}",
    },
    languageChanged: {
      en: "Language changed to {lang}",
      zh: "语言已切换为 {lang}",
    },
    selectOptions: {
      en: "Select launch options (Space to toggle, Enter to confirm):",
      zh: "选择启动选项（空格切换，回车确认）：",
    },
    resetOptions: {
      en: "Reset Launch Options",
      zh: "重置启动选项",
    },
    optionsReset: {
      en: "Launch options have been reset. You will be prompted again next time.",
      zh: "启动选项已重置，下次启动时将重新选择。",
    },
  },

  // Language Names
  language: {
    en: {
      en: "English",
      zh: "英语",
    },
    zh: {
      en: "Chinese",
      zh: "中文",
    },
  },

  // Banner
  banner: {
    welcome: {
      en: "Welcome!",
      zh: "欢迎使用！",
    },
  },

  // Usage Stats
  stats: {
    title: {
      en: "📊 Usage Statistics",
      zh: "📊 用量统计",
    },
    totalRequests: {
      en: "Total Requests: {count} times",
      zh: "总调用次数：{count} 次",
    },
    totalCost: {
      en: "Total Cost: {cost}",
      zh: "总消费：{cost}",
    },
    todayCost: {
      en: "Today's Cost: {cost}",
      zh: "今日消费：{cost}",
    },
    modelDistribution: {
      en: "Model Usage Distribution (Today):",
      zh: "模型使用分布（今日）：",
    },
    times: {
      en: "times",
      zh: "次",
    },
    refreshHint: {
      en: "{countdown}s until refresh | Press any key to return",
      zh: "{countdown}s 后刷新 | 按任意键返回",
    },
    fetching: {
      en: "Fetching usage statistics...",
      zh: "获取用量统计...",
    },
    fetchFailed: {
      en: "Failed to fetch: {error}",
      zh: "获取失败：{error}",
    },
  },

  // API Key Prompts
  prompts: {
    enterApiKey: {
      en: "Please enter your API Key:",
      zh: "请输入您的 API Key：",
    },
    apiKeyPlaceholder: {
      en: "cr_xxxxxxxx",
      zh: "cr_xxxxxxxx",
    },
    validating: {
      en: "Validating API Key...",
      zh: "正在验证 API Key...",
    },
    keyInvalidFormat: {
      en: "Invalid format, must start with cr_",
      zh: "格式不正确，必须以 cr_ 开头",
    },
    keyValidationFailed: {
      en: "Validation failed: {error}",
      zh: "验证失败：{error}",
    },
    keyConfigured: {
      en: "API Key configured successfully!",
      zh: "API Key 配置成功！",
    },
  },

  // CLI
  cli: {
    version: {
      en: "Tako CLI v{version}",
      zh: "Tako CLI v{version}",
    },
    usage: {
      en: "Usage: tako [options] [command]",
      zh: "用法：tako [选项] [命令]",
    },
    options: {
      en: "Options:",
      zh: "选项：",
    },
    optionVersion: {
      en: "  -v, --version          Display version number",
      zh: "  -v, --version          显示版本号",
    },
    optionHelp: {
      en: "  -h, --help             Display help information",
      zh: "  -h, --help             显示帮助信息",
    },
    optionModels: {
      en: "  --models               List available models for each client",
      zh: "  --models               列出各 client 可用的模型 id",
    },
    commands: {
      en: "Commands:",
      zh: "命令：",
    },
    cmdAgent: {
      en: "  agent <subcmd>         Manage long-running claude/codex agent sessions",
      zh: "  agent <子命令>         管理 claude/codex agent 会话（start/list/send/...）",
    },
    cmdInstall: {
      en: "  install <client> [v]   Install / list versions of a client",
      zh: "  install <client> [v]   安装/列出 client 版本",
    },
    shortcuts: {
      en: "Shortcuts:",
      zh: "快捷命令：",
    },
    shortcutClaude: {
      en: "  --claude               Launch Claude Code directly",
      zh: "  --claude               直接启动 Claude Code",
    },
    shortcutCodex: {
      en: "  --codex                Launch Codex directly",
      zh: "  --codex                直接启动 Codex",
    },
    shortcutGemini: {
      en: "  --gemini               Launch Gemini CLI directly",
      zh: "  --gemini               直接启动 Gemini CLI",
    },
    quickFlags: {
      en: "Quick-launch flags (combine with --claude/--codex/--gemini):",
      zh: "快捷参数（与 --claude/--codex/--gemini 组合）：",
    },
    quickFlagModel: {
      en: "  --model <id>           Pick model; auto-routes to a provider whose catalog has it",
      zh: "  --model <id>           指定模型；自动路由到目录里包含该模型的服务商",
    },
    quickFlagYolo: {
      en: "  --yolo                 Skip all permission/sandbox prompts (claude=--dangerously-skip-permissions, codex=--dangerously-bypass-approvals-and-sandbox, gemini=--yolo)",
      zh: "  --yolo                 跳过权限/沙箱确认（claude=--dangerously-skip-permissions，codex=--dangerously-bypass-approvals-and-sandbox，gemini=--yolo）",
    },
    quickFlagPrint: {
      en: "  -p, --print <task>     Run one-shot task (claude/gemini=-p, codex=exec subcmd)",
      zh: "  -p, --print <task>     非交互执行任务（claude/gemini 用 -p，codex 用 exec 子命令）",
    },
    quickFlagPassthrough: {
      en: "  --                     Stop parsing tako flags; everything after is forwarded raw",
      zh: "  --                     之后的参数原样透传给底层 client",
    },
    examples: {
      en: "Examples:",
      zh: "示例：",
    },
    exampleInteractive: {
      en: "  tako                                            Interactive tool selection",
      zh: "  tako                                            交互式选择工具",
    },
    exampleModels: {
      en: "  tako --models                                   List available models",
      zh: "  tako --models                                   列出可用模型",
    },
    exampleClaude: {
      en: "  tako --claude                                   Launch Claude Code directly",
      zh: "  tako --claude                                   直接启动 Claude Code",
    },
    exampleCodex: {
      en: "  tako --codex --model deepseek-v4-pro            Pick model + auto-route provider",
      zh: "  tako --codex --model deepseek-v4-pro            指定模型 + 自动路由服务商",
    },
    exampleGemini: {
      en: "  tako --gemini --yolo -p \"summarize README.md\"   One-shot, skip prompts",
      zh: "  tako --gemini --yolo -p \"总结 README.md\"        非交互执行 + 跳过权限",
    },
    exampleFull: {
      en: "  tako --claude --model claude-opus-4-7 --yolo -p \"fix bug in src/foo.ts\"",
      zh: "  tako --claude --model claude-opus-4-7 --yolo -p \"修 src/foo.ts 的 bug\"",
    },
    examplePassthrough: {
      en: "  tako --codex -- --search \"crawl latest docs\"    Pass --search through raw",
      zh: "  tako --codex -- --search \"抓最新文档\"           --search 之后参数原样透传",
    },
    clientNotFound: {
      en: "{client} client not found",
      zh: "{client} 客户端未找到",
    },
    cliError: {
      en: "Tako CLI encountered an error:",
      zh: "Tako CLI 发生错误：",
    },
    launchFailed: {
      en: "Launch failed",
      zh: "启动失败",
    },
  },

  // Auth
  auth: {
    invalidFormat: {
      en: "Invalid format, must start with cr_",
      zh: "格式不正确，必须以 cr_ 开头",
    },
    validationFailed: {
      en: "Validation failed",
      zh: "验证失败",
    },
    networkError: {
      en: "Network request failed",
      zh: "网络请求失败",
    },
  },

  // Updater
  updater: {
    migrating: {
      en: "Detected old installation, migrating...",
      zh: "检测到旧版安装方式，正在迁移...",
    },
    installingLocally: {
      en: "Installing to local directory...",
      zh: "正在安装到本地目录...",
    },
    migrationFailed: {
      en: "Local installation failed, skipping migration",
      zh: "本地安装失败，跳过迁移",
    },
    installComplete: {
      en: "Local installation complete",
      zh: "本地安装完成",
    },
    migrationComplete: {
      en: "Detected old installation, migration complete. Please restart Tako CLI",
      zh: "检测到旧版安装，已完成迁移，请重新启动 Tako CLI",
    },
    newVersionAvailable: {
      en: "New version v{version} available (current v{current})",
      zh: "发现新版本 v{version}（当前 v{current}）",
    },
    pleaseRestart: {
      en: "Please restart Tako CLI to use the new version",
      zh: "请重新启动 Tako CLI 以使用新版本",
    },
  },

  // Region
  region: {
    usingChinaMirror: {
      en: "Detected China mainland network, using domestic mirror",
      zh: "检测到中国大陆网络，使用国内镜像源",
    },
    usingGlobalMirror: {
      en: "Using global mirror",
      zh: "使用国际源",
    },
  },

  // Telemetry
  telemetry: {
    toggle: {
      en: "Toggle Telemetry",
      zh: "切换遥测",
    },
    enabled: {
      en: "Telemetry is enabled",
      zh: "遥测已开启",
    },
    disabled: {
      en: "Telemetry is disabled",
      zh: "遥测已关闭",
    },
    description: {
      en: "Anonymous usage data helps us improve Tako CLI",
      zh: "匿名使用数据帮助我们改进 Tako CLI",
    },
  },

  // Time
  time: {
    justNow: {
      en: "just now",
      zh: "刚刚",
    },
    minutesAgo: {
      en: "{n}m ago",
      zh: "{n}分钟前",
    },
    hoursAgo: {
      en: "{n}h ago",
      zh: "{n}小时前",
    },
    yesterday: {
      en: "yesterday",
      zh: "昨天",
    },
    daysAgo: {
      en: "{n}d ago",
      zh: "{n}天前",
    },
    weeksAgo: {
      en: "{n}w ago",
      zh: "{n}周前",
    },
    monthsAgo: {
      en: "{n}mo ago",
      zh: "{n}月前",
    },
  },

  // Claude Code settings check
  claudeCode: {
    settingsDetected: {
      en: "Detected hardcoded config in Claude Code settings that conflicts with Tako:\n  {fields}",
      zh: "检测到 Claude Code settings 中存在与 Tako 冲突的配置：\n  {fields}",
    },
    confirmClean: {
      en: "Clean these settings? Tako will manage them automatically at launch",
      zh: "是否清理这些配置？Tako 启动时会自动注入正确的值",
    },
    settingsCleaned: {
      en: "Settings cleaned, Tako will manage these configs automatically",
      zh: "已清理完成，Tako 会自动管理这些配置",
    },
    cleanSkipped: {
      en: "Skipped. Note: hardcoded settings may cause issues with Tako",
      zh: "已跳过。注意：写死的配置可能导致 Tako 启动异常",
    },
    subscriptionMissingAuth: {
      en: "Selected Claude account has no captured credentials. Run `claude /login` for that account, then re-detect in Tako.",
      zh: "目标 Claude 账号缺少凭据。请用 `claude /login` 登录该账号后，让 Tako 重新检测一次。",
    },
    subscriptionSwitched: {
      en: "Switched Claude Code login to {email}",
      zh: "已切换 Claude Code 登录账号为 {email}",
    },
    unknownCurrentAccount: {
      en: "Current Claude login ({email}) is not tracked by Tako; its tokens will be overwritten.",
      zh: "当前 Claude 登录账号 ({email}) 未被 Tako 记录，切换后该账号 token 将被覆盖。",
    },
  },

  // Recent Projects
  recentProjects: {
    title: {
      en: "Recent Projects",
      zh: "最近项目",
    },
    launchInCurrent: {
      en: "Launch in current directory",
      zh: "在当前目录启动",
    },
  },

  providers: {
    management: { en: "Manage Providers", zh: "管理服务商" },
    selectProvider: { en: "Select provider:", zh: "选择服务商：" },
    selectType: { en: "Provider type:", zh: "服务商类型：" },
    enterName: { en: "Provider name:", zh: "服务商名称：" },
    enterApiKey: { en: "API Key:", zh: "API Key：" },
    enterBaseUrl: { en: "Base URL:", zh: "基础 URL：" },
    add: { en: "Add Provider", zh: "添加服务商" },
    edit: { en: "Edit Provider", zh: "编辑服务商" },
    delete: { en: "Delete Provider", zh: "删除服务商" },
    setDefault: { en: "Set as Default", zh: "设为默认" },
    rescan: { en: "Re-scan Subscriptions", zh: "重新扫描订阅" },
    back: { en: "Back", zh: "返回" },
    added: { en: "Provider added", zh: "服务商已添加" },
    deleted: { en: "Provider deleted", zh: "服务商已删除" },
    updated: { en: "Provider updated", zh: "服务商已更新" },
    defaultSet: { en: "Default provider set", zh: "默认服务商已设置" },
    noProviders: { en: "No providers configured", zh: "未配置服务商" },
    noCompatible: { en: "No provider supports {client}", zh: "没有支持 {client} 的服务商" },
    defaultLabel: { en: "(default)", zh: "（默认）" },
    detected: { en: "Detected: {name}", zh: "检测到：{name}" },
    confirmDelete: { en: "Delete {name}?", zh: "确认删除 {name}？" },
    scanComplete: { en: "Scan complete, found {count} new provider(s)", zh: "扫描完成，发现 {count} 个新服务商" },
  },
};

/**
 * Get translation for a key
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = detectLocale();

  // Navigate through nested keys
  const keys = key.split(".");
  let value: any = translations;

  for (const k of keys) {
    value = value?.[k];
    if (!value) {
      return key; // Return key if translation not found
    }
  }

  // Get localized string
  let result: string = value[locale] || value.en || key;

  // Replace parameters
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(`{${paramKey}}`, String(paramValue));
    }
  }

  return result;
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return detectLocale();
}
