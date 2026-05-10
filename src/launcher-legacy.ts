import { ClientConfig, getClientBinPath, getClientEntryPath } from "./clients/base";
import type { ProviderContext } from "./providers/types";
import { getBunPath } from "./installer";

export interface LaunchOptions {
  projectPath?: string;
  args?: string[];
  selectedOptionIds?: string[];
  providerContext?: ProviderContext;
}

/**
 * 启动客户端 — spawnSync 完全阻塞父进程
 *
 * spawnSync 会冻结 Bun 事件循环，没有 listener、没有 stdin 争抢。
 * 子进程完全拥有终端，Ctrl+C / 输入 等全部正常。
 * 子进程退出后父进程恢复，回到菜单循环。
 */
export async function launchClient(
  client: ClientConfig,
  options?: LaunchOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const workingDir = options?.projectPath || process.cwd();
    const providerContext = options?.providerContext;

    if (!providerContext) {
      return { success: false, error: "未选择服务商" };
    }

    let binPath = await getClientEntryPath(client);
    if (!binPath) binPath = getClientBinPath(client);

    const binFile = Bun.file(binPath);
    if (!(await binFile.exists())) {
      return { success: false, error: `找不到可执行文件: ${binPath}` };
    }

    const clientEnvVars = client.getEnvVars(providerContext);
    const env = { ...process.env, ...clientEnvVars };

    let command: string[];
    if (client.runtime === "native") {
      command = [binPath];
    } else {
      const bunPath = await getBunPath();
      command = [bunPath, binPath];
    }

    if (options?.args && options.args.length > 0) {
      command = [...command, ...options.args];
    }

    const isWindows = process.platform === "win32";

    // 释放 stdin — 清除 Ink 所有残留
    // Windows 上 ConPTY 句柄一旦 setRawMode(false) + removeAllListeners 后
    // 难以完整恢复给子进程（Bun #9853 + ConPTY 透传问题），导致子进程 TUI
    // 拿到的 stdin 不是 raw TTY，渲染失效、按键无响应。
    // 故 Windows 上跳过这步，子进程独占终端时 raw mode 状态由它自己接管。
    if (!isWindows) {
      try {
        process.stdin.removeAllListeners();
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch { /* ignore */ }
    }

    // 清空屏幕 + scrollback —— 否则 launcher 的 Ink 输出会留在终端历史里，
    // 子进程（如 Claude Code）启动后用户向上滚动会看到 Tako 菜单残留，
    // 无法回到子进程自身的最早输出。
    // \x1b[2J 清可见区域，\x1b[3J 清 scrollback，\x1b[H 光标归位。
    if (process.stdout.isTTY) {
      try { process.stdout.write("\x1b[2J\x1b[3J\x1b[H"); } catch { /* ignore */ }
    }

    if (isWindows) {
      // Windows：用 node:child_process 的 spawnSync。
      // Bun.spawnSync 在 Windows 上对 stdio: "inherit" 的 ConPTY 透传不完整，
      // 导致子进程（Codex 的 ratatui TUI）拿到的 stdin 不是真 TTY。
      // node:child_process 走 libuv，对 ConPTY 句柄透传更稳定。
      const { spawnSync: nodeSpawnSync } = await import("node:child_process");
      nodeSpawnSync(command[0], command.slice(1), {
        env,
        stdio: "inherit",
        cwd: workingDir,
        windowsHide: false,
      });
    } else {
      // Linux/macOS：Bun.spawnSync 完全阻塞事件循环，子进程独占终端
      // 需要 Linux kernel 5.13+，macOS 全版本支持
      try {
        Bun.spawnSync(command, {
          env,
          stdio: ["inherit", "inherit", "inherit"],
          cwd: workingDir,
        });
      } catch {
        // fallback: 异步 spawn（极老内核不支持 spawnSync）
        const proc = Bun.spawn(command, {
          env,
          stdio: ["inherit", "inherit", "inherit"],
          cwd: workingDir,
        });
        await proc.exited;
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "启动失败",
    };
  }
}
