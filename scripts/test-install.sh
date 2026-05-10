#!/bin/bash
# Tako CLI 安装测试
set -e

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "=== Tako CLI 安装测试 ==="
echo ""

# 1. 构建
echo "[1/5] 构建..."
bun run build > /dev/null
pass "构建成功"

# 2. 打包
echo "[2/5] 打包..."
npm pack --quiet 2>/dev/null
TARBALL=$(ls -t tako-cli-*.tgz | head -1)
[ -f "$TARBALL" ] && pass "打包成功: $TARBALL" || fail "打包失败"

# 3. Docker 测试
echo "[3/5] Docker 测试 (Linux ARM64)..."
OUTPUT=$(docker run --rm --platform linux/arm64 \
  -v "$(pwd)/$TARBALL:/tmp/tako.tgz:ro" \
  -v "$(pwd)/install.sh:/tmp/install.sh:ro" \
  ubuntu:22.04 /bin/bash -c '
set -e
apt-get update -qq && apt-get install -y -qq curl unzip > /dev/null 2>&1
bash /tmp/install.sh --local /tmp/tako.tgz 2>&1
export PATH="$HOME/.tako/bin:$PATH"

# 输出关键检查点
echo "CHECK:BUN_INSTALLED=$([ -x ~/.tako/bun/bin/bun ] && echo yes || echo no)"
echo "CHECK:TAKO_CLI_INSTALLED=$([ -f ~/.tako/cli/node_modules/tako-cli/dist/index.js ] && echo yes || echo no)"
echo "CHECK:TAKO_BIN_EXISTS=$([ -x ~/.tako/bin/tako ] || [ -x /usr/local/bin/tako ] && echo yes || echo no)"
echo "CHECK:BUN_VERSION=$(~/.tako/bun/bin/bun --version 2>/dev/null || echo none)"
# 测试 tako 命令
TAKO_CMD=$([ -x /usr/local/bin/tako ] && echo /usr/local/bin/tako || echo ~/.tako/bin/tako)
echo "CHECK:TAKO_VERSION=$($TAKO_CMD --version 2>/dev/null || echo none)"
' 2>&1)

# 4. 解析检查点
echo "[4/5] 验证安装..."

BUN_OK=$(echo "$OUTPUT" | grep "CHECK:BUN_INSTALLED=" | cut -d= -f2)
CLI_OK=$(echo "$OUTPUT" | grep "CHECK:TAKO_CLI_INSTALLED=" | cut -d= -f2)
BIN_OK=$(echo "$OUTPUT" | grep "CHECK:TAKO_BIN_EXISTS=" | cut -d= -f2)
BUN_VER=$(echo "$OUTPUT" | grep "CHECK:BUN_VERSION=" | cut -d= -f2)
TAKO_VER=$(echo "$OUTPUT" | grep "CHECK:TAKO_VERSION=" | cut -d= -f2)

[ "$BUN_OK" = "yes" ] && pass "Bun 安装成功 (v$BUN_VER)" || fail "Bun 安装失败"
[ "$CLI_OK" = "yes" ] && pass "Tako CLI 安装成功" || fail "Tako CLI 安装失败"
[ "$BIN_OK" = "yes" ] && pass "tako 命令创建成功" || fail "tako 命令创建失败"
[ -n "$TAKO_VER" ] && [ "$TAKO_VER" != "none" ] && pass "tako --version 正常 ($TAKO_VER)" || fail "tako --version 失败"

# 5. 清理
echo "[5/5] 清理..."
rm -f "$TARBALL"
pass "清理完成"

echo ""
echo -e "${GREEN}=== 所有测试通过 ===${NC}"
