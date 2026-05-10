#!/bin/bash
set -e

# Tako CLI 一键安装脚本
# 用法: curl -fsSL https://cdn.jsdelivr.net/npm/tako-cli/install.sh | bash
# 本地测试: bash install.sh --local /path/to/tako-cli.tgz

TAKO_DIR="$HOME/.tako"
TAKO_BUN_DIR="$TAKO_DIR/bun"
INSTALL_DIR="/usr/local/bin"
LOCAL_TARBALL=""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REGION=""

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# 检测用户所在地区
detect_region() {
    info "检测网络环境..."

    local country=""
    country=$(curl -s --connect-timeout 2 "http://ip-api.com/line/?fields=countryCode" 2>/dev/null || echo "")

    if [ -z "$country" ]; then
        country=$(curl -s --connect-timeout 2 "https://ipinfo.io/country" 2>/dev/null || echo "")
    fi

    if [ -z "$country" ]; then
        country=$(curl -s --connect-timeout 2 "https://api.ip.sb/geoip" 2>/dev/null | grep -o '"country_code":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
    fi

    if [ "$country" = "CN" ]; then
        REGION="cn"
        info "检测到中国大陆网络，使用国内镜像"
    elif [ -n "$country" ]; then
        REGION="global"
        info "使用国际源"
    else
        # 所有检测都失败，默认使用国内镜像（保守策略，与 TS 代码一致）
        REGION="cn"
        info "网络检测超时，默认使用国内镜像"
    fi
}

# 安装系统依赖
install_dependencies() {
    local deps_needed=""

    command -v curl &> /dev/null || deps_needed="$deps_needed curl"
    command -v unzip &> /dev/null || deps_needed="$deps_needed unzip"

    if [ -z "$deps_needed" ]; then
        return 0
    fi

    info "安装系统依赖:$deps_needed"

    # 检测是否需要 sudo
    if [ -w "/usr" ] 2>/dev/null; then
        SUDO=""
    else
        SUDO="sudo"
    fi

    if command -v apt-get &> /dev/null; then
        $SUDO apt-get update -qq
        $SUDO apt-get install -y -qq $deps_needed
    elif command -v yum &> /dev/null; then
        $SUDO yum install -y -q $deps_needed
    elif command -v dnf &> /dev/null; then
        $SUDO dnf install -y -q $deps_needed
    elif command -v pacman &> /dev/null; then
        $SUDO pacman -S --noconfirm $deps_needed
    elif command -v apk &> /dev/null; then
        $SUDO apk add --quiet $deps_needed
    else
        error "无法自动安装依赖，请手动安装: $deps_needed"
    fi
}

# 检查并安装 Git（Claude Code 必需）
ensure_git() {
    if command -v git &> /dev/null; then
        return 0
    fi

    warn "Git 未安装，Claude Code 需要 Git 才能正常工作"

    local os
    os=$(uname -s)

    if [ "$os" = "Darwin" ]; then
        # macOS: 通过 Xcode Command Line Tools 安装（系统自带，无需第三方工具）
        info "正在安装 Xcode Command Line Tools（包含 Git）..."
        info "请在弹出的对话框中点击「安装」"
        xcode-select --install 2>/dev/null || true
        # 等待安装完成（xcode-select --install 是异步 GUI 弹窗）
        local waited=0
        while ! command -v git &> /dev/null; do
            sleep 3
            waited=$((waited + 3))
            if [ $waited -ge 300 ]; then
                warn "等待超时，请手动完成 Xcode Command Line Tools 安装后重新运行此脚本"
                return 1
            fi
        done
        info "Git 安装完成"
    else
        # Linux: 通过包管理器安装
        info "安装 Git..."

        if [ -w "/usr" ] 2>/dev/null; then
            SUDO=""
        else
            SUDO="sudo"
        fi

        if command -v apt-get &> /dev/null; then
            $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git
        elif command -v yum &> /dev/null; then
            $SUDO yum install -y -q git
        elif command -v dnf &> /dev/null; then
            $SUDO dnf install -y -q git
        elif command -v pacman &> /dev/null; then
            $SUDO pacman -S --noconfirm git
        elif command -v apk &> /dev/null; then
            $SUDO apk add --quiet git
        else
            if [ "$REGION" = "cn" ]; then
                warn "无法自动安装 Git，请手动安装: https://registry.npmmirror.com/binary.html?path=git-for-linux/"
            else
                warn "无法自动安装 Git，请手动安装: https://git-scm.com/downloads"
            fi
            return 1
        fi

        if command -v git &> /dev/null; then
            info "Git 安装完成"
        else
            warn "Git 安装失败，请手动安装"
        fi
    fi
}

# 从 npmmirror 直接下载安装 Bun（国内专用，不依赖 bun.sh 和 GitHub）
install_bun_from_npmmirror() {
    local mirror="https://registry.npmmirror.com/-/binary/bun"

    # 检测平台和架构
    local os arch target
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case "$os" in
        linux)  os="linux" ;;
        darwin) os="darwin" ;;
        *)      error "不支持的操作系统: $os" ;;
    esac

    case "$arch" in
        x86_64|amd64)   arch="x64" ;;
        aarch64|arm64)  arch="aarch64" ;;
        *)              error "不支持的架构: $arch" ;;
    esac

    # Alpine Linux 使用 musl 版本
    target="bun-${os}-${arch}"
    if [ "$os" = "linux" ] && [ -f /etc/alpine-release ]; then
        target="${target}-musl"
    fi

    # 获取最新版本号
    info "正在获取最新版本..."
    local latest_version
    latest_version=$(curl -s --connect-timeout 5 "$mirror/" 2>/dev/null \
        | grep -o '"name":"bun-v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/"' \
        | sed 's/"name":"bun-v//;s/\/"//' \
        | sort -t. -k1,1rn -k2,2rn -k3,3rn \
        | head -1)

    if [ -z "$latest_version" ]; then
        error "无法获取 Bun 最新版本号"
    fi

    # 补回前缀
    latest_version="bun-v${latest_version}"

    local download_url="${mirror}/${latest_version}/${target}.zip"
    local zip_file="/tmp/bun-install-$$.zip"

    info "下载 Bun (${latest_version}) from npmmirror..."
    curl --fail --location --progress-bar --output "$zip_file" "$download_url" || \
        error "下载失败: $download_url"

    # 解压到目标目录
    local bin_dir="$TAKO_BUN_DIR/bin"
    mkdir -p "$bin_dir"

    unzip -oq "$zip_file" -d /tmp/bun-install-$$ || error "解压失败"
    mv "/tmp/bun-install-$$/${target}/bun" "$bin_dir/bun"
    chmod +x "$bin_dir/bun"

    # 清理临时文件
    rm -rf "$zip_file" "/tmp/bun-install-$$"
}

# 安装 Tako 专属 Bun
install_bun() {
    # 检查是否已安装
    if [ -x "$TAKO_BUN_DIR/bin/bun" ]; then
        info "Tako 专属 Bun 已安装: $TAKO_BUN_DIR"
        return 0
    fi

    info "安装 Tako 专属 Bun 运行时..."
    info "（不会影响您系统中已安装的 Node.js 或 Bun）"

    mkdir -p "$TAKO_BUN_DIR"

    if [ "$REGION" = "cn" ]; then
        # 国内用户：直接从 npmmirror 下载二进制，完全不经过 bun.sh/GitHub
        install_bun_from_npmmirror
    else
        # 海外用户：使用官方安装脚本
        export BUN_INSTALL="$TAKO_BUN_DIR"
        curl -fsSL https://bun.sh/install | bash
    fi

    if [ ! -x "$TAKO_BUN_DIR/bin/bun" ]; then
        error "Bun 安装失败，请检查网络连接"
    fi

    info "Tako 专属 Bun 安装完成: $TAKO_BUN_DIR"
}

# 安装 Tako CLI
install_tako() {
    info "安装 Tako CLI..."

    local bun="$TAKO_BUN_DIR/bin/bun"
    local registry="https://registry.npmjs.org"
    local tako_install_dir="$TAKO_DIR/cli"

    if [ "$REGION" = "cn" ]; then
        registry="https://registry.npmmirror.com"
    fi

    # 使用本地安装而非全局安装，避免污染 ~/.bun
    mkdir -p "$tako_install_dir"
    cd "$tako_install_dir"

    # 初始化 package.json（如果不存在）
    if [ ! -f "package.json" ]; then
        echo '{"name":"tako-local","private":true}' > package.json
    fi

    # 安装 tako-cli
    if [ -n "$LOCAL_TARBALL" ]; then
        # 本地测试模式：从 tgz 文件安装
        info "从本地文件安装: $LOCAL_TARBALL"
        if ! "$bun" add "$LOCAL_TARBALL"; then
            error "Tako CLI 安装失败"
        fi
    else
        # 正常模式：从 npm 安装
        if ! "$bun" add tako-cli --registry "$registry"; then
            error "Tako CLI 安装失败"
        fi
    fi

    # 设置 tako 可执行文件路径
    TAKO_ENTRY="$tako_install_dir/node_modules/tako-cli/dist/index.js"
    if [ ! -f "$TAKO_ENTRY" ]; then
        error "Tako CLI 安装异常: $TAKO_ENTRY 不存在"
    fi

    info "Tako CLI 安装完成: $tako_install_dir"
}

# 添加 PATH 配置到指定文件
add_path_to_file() {
    local file="$1"
    local content="$2"

    # 检查是否已存在 Tako CLI 配置
    if grep -q "Tako CLI PATH" "$file" 2>/dev/null; then
        return 0
    fi

    echo "" >> "$file"
    echo "# Tako CLI PATH" >> "$file"
    echo "$content" >> "$file"
    info "已添加 PATH 配置到 $file"
}

# 配置 PATH 到 shell 配置文件
setup_shell_path() {
    # 使用动态检测的目录（由 create_command 设置）或默认值
    local bun_bin="${TAKO_BIN_DIR:-$TAKO_BUN_DIR/bin}"
    local path_export="export PATH=\"$bun_bin:\$PATH\""
    local configured=false

    # 检测当前 shell
    local current_shell=""
    current_shell=$(basename "$SHELL" 2>/dev/null || echo "bash")

    # ===== Bash =====
    if [ "$current_shell" = "bash" ]; then
        # 优先使用 .bashrc（交互式），其次 .bash_profile（登录）
        if [ -f "$HOME/.bashrc" ]; then
            add_path_to_file "$HOME/.bashrc" "$path_export"
            configured=true
        elif [ -f "$HOME/.bash_profile" ]; then
            add_path_to_file "$HOME/.bash_profile" "$path_export"
            configured=true
        else
            # 创建 .bashrc
            add_path_to_file "$HOME/.bashrc" "$path_export"
            configured=true
        fi
    fi

    # ===== Zsh =====
    if [ "$current_shell" = "zsh" ] || [ -f "$HOME/.zshrc" ]; then
        add_path_to_file "$HOME/.zshrc" "$path_export"
        configured=true
    fi

    # ===== Fish =====
    local fish_config="$HOME/.config/fish/config.fish"
    if [ "$current_shell" = "fish" ] || [ -f "$fish_config" ]; then
        mkdir -p "$(dirname "$fish_config")"
        add_path_to_file "$fish_config" "set -gx PATH \"$bun_bin\" \$PATH"
        configured=true
    fi

    # ===== 通用 .profile (sh, dash 等 POSIX shell) =====
    if [ "$configured" = false ] || [ -f "$HOME/.profile" ]; then
        add_path_to_file "$HOME/.profile" "$path_export"
    fi

    # 导出到当前 session
    export PATH="$bun_bin:$PATH"
}

# 创建全局命令
create_command() {
    info "配置 tako 命令..."

    local bun="$TAKO_BUN_DIR/bin/bun"
    local tako_bin_dir="$TAKO_DIR/bin"

    # 创建 Tako 的 bin 目录
    mkdir -p "$tako_bin_dir"

    # 创建 wrapper 脚本（使用 Tako 专属 bun 运行本地安装的 tako-cli）
    local wrapper="#!/bin/bash
exec \"$bun\" \"$TAKO_ENTRY\" \"\$@\"
"
    echo "$wrapper" > "$tako_bin_dir/tako"
    chmod +x "$tako_bin_dir/tako"

    # 方案1: 尝试创建符号链接到 /usr/local/bin
    if [ -w "$INSTALL_DIR" ] 2>/dev/null; then
        ln -sf "$tako_bin_dir/tako" "$INSTALL_DIR/tako"
        info "tako 命令已创建: $INSTALL_DIR/tako"
        return 0
    fi

    # 方案2: 尝试 sudo 创建符号链接
    if command -v sudo &> /dev/null; then
        warn "需要 sudo 权限写入 $INSTALL_DIR"
        if sudo ln -sf "$tako_bin_dir/tako" "$INSTALL_DIR/tako" 2>/dev/null; then
            info "tako 命令已创建: $INSTALL_DIR/tako"
            return 0
        fi
    fi

    # 方案3: 配置 PATH（无需 sudo）
    warn "无法写入 $INSTALL_DIR，使用 PATH 配置方案"
    TAKO_BIN_DIR="$tako_bin_dir"
    setup_shell_path

    info "tako 命令已配置到 $tako_bin_dir"
}

# 验证安装并自动启动
verify_and_launch() {
    info "安装成功！正在启动 Tako CLI..."
    echo ""

    # PATH 可能还没生效，直接用已知路径启动
    exec "$TAKO_BUN_DIR/bin/bun" "$TAKO_ENTRY"
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --local)
                LOCAL_TARBALL="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

# 主流程
main() {
    parse_args "$@"

    echo ""
    echo "  ╔════════════════════════════════════╗"
    echo "  ║       Tako CLI 安装程序            ║"
    echo "  ╚════════════════════════════════════╝"
    echo ""

    detect_region
    install_dependencies
    ensure_git
    install_bun
    install_tako
    create_command
    verify_and_launch
}

# 仅在直接执行时跑 main；被 `source` 加载（如测试场景）时只导出函数，不自动运行。
# - bash install.sh:    BASH_SOURCE[0]=install.sh, $0=install.sh   → 跑
# - curl ... | bash:    BASH_SOURCE[0]="",         $0=bash         → 跑（BS 为空）
# - source install.sh:  BASH_SOURCE[0]=install.sh, $0=bash         → 跳过
if [ -z "${BASH_SOURCE[0]:-}" ] || [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
