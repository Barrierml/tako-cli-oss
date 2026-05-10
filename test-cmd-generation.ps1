# 测试 tako.cmd 生成
# 模拟 install.ps1 中的变量
$TAKO_BUN_DIR = "C:\Users\TestUser\.tako\bun"
$TAKO_CLI_DIR = "C:\Users\TestUser\.tako\cli"
$TAKO_BIN_DIR = "C:\Users\TestUser\.tako\bin"
$TakoEntry = "$TAKO_CLI_DIR\node_modules\tako-cli\dist\index.js"
$bun = "$TAKO_BUN_DIR\bin\bun.exe"

Write-Host "=== 测试 tako.cmd 生成 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "变量值:" -ForegroundColor Yellow
Write-Host "  BUN_PATH: $bun"
Write-Host "  TAKO_ENTRY: $TakoEntry"
Write-Host ""

# 创建临时目录
$testDir = "test-output"
New-Item -ItemType Directory -Force -Path $testDir | Out-Null

# 方法 1: 使用双引号 here-string（当前方法）
Write-Host "--- 方法 1: 双引号 here-string + Out-File -Encoding OEM ---" -ForegroundColor Green
$cmdContent = @"
@echo off
"$bun" "$TakoEntry" %*
exit /b %ERRORLEVEL%
"@

$cmdContent | Out-File -FilePath "$testDir\tako-method1.cmd" -Encoding OEM -NoNewline
Add-Content -Path "$testDir\tako-method1.cmd" -Value "" -Encoding OEM

Write-Host "生成的内容 (十六进制):"
$bytes = [System.IO.File]::ReadAllBytes("$testDir\tako-method1.cmd")
$hex = ($bytes | ForEach-Object { $_.ToString("X2") }) -join " "
Write-Host $hex -ForegroundColor Gray
Write-Host ""
Write-Host "生成的内容 (文本):"
Get-Content "$testDir\tako-method1.cmd" -Raw | Write-Host -ForegroundColor Cyan
Write-Host ""

# 方法 2: 使用 ASCII 编码
Write-Host "--- 方法 2: Out-File -Encoding ASCII ---" -ForegroundColor Green
$cmdContent | Out-File -FilePath "$testDir\tako-method2.cmd" -Encoding ASCII

Write-Host "生成的内容:"
Get-Content "$testDir\tako-method2.cmd" -Raw | Write-Host -ForegroundColor Cyan
Write-Host ""

# 方法 3: 使用 Default 编码
Write-Host "--- 方法 3: Out-File -Encoding Default ---" -ForegroundColor Green
$cmdContent | Out-File -FilePath "$testDir\tako-method3.cmd" -Encoding Default

Write-Host "生成的内容:"
Get-Content "$testDir\tako-method3.cmd" -Raw | Write-Host -ForegroundColor Cyan
Write-Host ""

# 方法 4: 直接使用 Set-Content
Write-Host "--- 方法 4: Set-Content -Encoding ASCII ---" -ForegroundColor Green
Set-Content -Path "$testDir\tako-method4.cmd" -Value $cmdContent -Encoding ASCII

Write-Host "生成的内容:"
Get-Content "$testDir\tako-method4.cmd" -Raw | Write-Host -ForegroundColor Cyan
Write-Host ""

Write-Host "=== 文件已生成到 $testDir 目录 ===" -ForegroundColor Green
Write-Host "请在 Windows 上检查这些文件并测试哪个方法生成的文件可以正常运行" -ForegroundColor Yellow
