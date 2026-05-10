# Tako CLI Windows Install Script
# Usage: irm https://cdn.jsdelivr.net/npm/tako-cli/install.ps1 | iex
# Or: powershell -c "irm https://cdn.jsdelivr.net/npm/tako-cli/install.ps1 | iex"

$ErrorActionPreference = "Stop"

# Config
$TAKO_DIR = "$env:USERPROFILE\.tako"
$TAKO_BUN_DIR = "$TAKO_DIR\bun"
$TAKO_CLI_DIR = "$TAKO_DIR\cli"
$TAKO_BIN_DIR = "$TAKO_DIR\bin"

# Output helpers
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red; exit 1 }

# Detect network region
function Detect-Region {
    Write-Info "Detecting network region..."

    $region = "global"

    try {
        $response = Invoke-RestMethod -Uri "http://ip-api.com/line/?fields=countryCode" -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response -match "CN") {
            $region = "cn"
        }
    } catch {
        try {
            $response = Invoke-RestMethod -Uri "https://ipinfo.io/country" -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($response -match "CN") {
                $region = "cn"
            }
        } catch {}
    }

    if ($region -eq "cn") {
        Write-Info "Detected China network, using mirror"
    } else {
        Write-Info "Using global registry"
    }

    return $region
}

# Check and install Git (required by Claude Code)
function Ensure-Git {
    param([string]$Region)

    if (Get-Command git -ErrorAction SilentlyContinue) {
        return
    }

    Write-Warn "Git is not installed. Claude Code requires Git to work properly."

    # Try winget first (Windows 10 1709+)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info "Installing Git via winget..."
        try {
            winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { Write-Host $_ }
            # Refresh PATH for current session
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Get-Command git -ErrorAction SilentlyContinue) {
                Write-Info "Git installed successfully"
                return
            }
        } catch {
            Write-Warn "winget install failed, please install Git manually"
        }
    }

    # Fallback: prompt user to install manually
    if ($Region -eq "cn") {
        Write-Warn "Please install Git manually: https://registry.npmmirror.com/binary.html?path=git-for-windows/"
    } else {
        Write-Warn "Please install Git manually: https://git-scm.com/downloads/win"
    }
    Write-Warn "After installing Git, reopen your terminal and run 'tako' again."
}

# Install Tako dedicated Bun
function Install-Bun {
    param([string]$Region)

    $bunExe = "$TAKO_BUN_DIR\bin\bun.exe"

    if (Test-Path $bunExe) {
        Write-Info "Tako Bun already installed: $TAKO_BUN_DIR"
        return
    }

    Write-Info "Installing Tako dedicated Bun runtime..."
    Write-Info "(This won't affect your system Node.js or Bun)"

    # Create directories
    New-Item -ItemType Directory -Force -Path $TAKO_BUN_DIR | Out-Null
    New-Item -ItemType Directory -Force -Path "$TAKO_BUN_DIR\bin" | Out-Null

    # China users download directly from mirror
    if ($Region -eq "cn") {
        Install-Bun-Direct -Mirror "https://registry.npmmirror.com/-/binary/bun"
    } else {
        Install-Bun-Direct -Mirror "https://github.com/oven-sh/bun/releases/latest/download"
    }

    if (-not (Test-Path $bunExe)) {
        Write-Err "Bun installation failed, please check network connection"
    }

    Write-Info "Tako Bun installed: $TAKO_BUN_DIR"
}

# Direct download Bun (without official script)
function Install-Bun-Direct {
    param([string]$Mirror)

    $bunExe = "$TAKO_BUN_DIR\bin\bun.exe"
    $zipFile = "$TAKO_BUN_DIR\bun.zip"

    # Detect architecture
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x64" }
    $zipName = "bun-windows-$arch.zip"

    # Build download URL
    if ($Mirror -like "*npmmirror*") {
        # npmmirror format: https://registry.npmmirror.com/-/binary/bun/bun-v1.1.38/bun-windows-x64.zip
        Write-Info "Fetching latest Bun version..."
        try {
            $versions = Invoke-RestMethod -Uri "https://registry.npmmirror.com/-/binary/bun/" -TimeoutSec 10
            # Parse version list, find latest bun-v* version
            $latestVersion = ($versions | Select-String -Pattern 'bun-v[\d.]+' -AllMatches).Matches.Value |
                Sort-Object { [version]($_ -replace 'bun-v', '') } -Descending |
                Select-Object -First 1
            if (-not $latestVersion) {
                $latestVersion = "bun-v1.1.38"  # Fallback version
            }
            Write-Info "Latest version: $latestVersion"
            $downloadUrl = "$Mirror/$latestVersion/$zipName"
        } catch {
            Write-Warn "Failed to fetch version, using default"
            $downloadUrl = "$Mirror/bun-v1.1.38/$zipName"
        }
    } else {
        # GitHub format
        $downloadUrl = "$Mirror/$zipName"
    }

    Write-Info "Downloading Bun: $downloadUrl"

    # Download
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 120
    } catch {
        Write-Err "Failed to download Bun: $_"
    }

    # Extract
    Write-Info "Extracting Bun..."
    try {
        Expand-Archive -Path $zipFile -DestinationPath $TAKO_BUN_DIR -Force

        # Bun zip has a nested directory, need to move files
        $extractedDir = Get-ChildItem -Path $TAKO_BUN_DIR -Directory | Where-Object { $_.Name -like "bun-*" } | Select-Object -First 1
        if ($extractedDir) {
            # Move bun.exe to bin directory
            $bunExeInZip = Join-Path $extractedDir.FullName "bun.exe"
            if (Test-Path $bunExeInZip) {
                Move-Item -Path $bunExeInZip -Destination $bunExe -Force
            }
            # Clean up extracted directory
            Remove-Item -Path $extractedDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Err "Failed to extract Bun: $_"
    } finally {
        # Clean up zip file
        Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue
    }
}

# Install Tako CLI
function Install-Tako {
    param([string]$Region)

    Write-Info "Installing Tako CLI..."

    $bun = "$TAKO_BUN_DIR\bin\bun.exe"
    $registry = "https://registry.npmjs.org"

    if ($Region -eq "cn") {
        $registry = "https://registry.npmmirror.com"
    }

    # Create local install directory
    New-Item -ItemType Directory -Force -Path $TAKO_CLI_DIR | Out-Null

    # Switch to install directory
    Push-Location $TAKO_CLI_DIR

    try {
        # Initialize package.json
        if (-not (Test-Path "package.json")) {
            '{"name":"tako-local","private":true}' | Out-File -FilePath "package.json" -Encoding UTF8
        }

        # Disable Bun color output to avoid ANSI code pollution
        $env:NO_COLOR = "1"

        # Install tako-cli using BUN_CONFIG_REGISTRY (bun add doesn't support --registry)
        $env:BUN_CONFIG_REGISTRY = $registry
        $prevErrorAction = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        Write-Info "Using npm registry: $registry"
        & $bun add "tako-cli@latest" 2>&1 | ForEach-Object { Write-Host $_ }
        $ErrorActionPreference = $prevErrorAction

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Tako CLI installation failed"
        }
    } finally {
        Pop-Location
        Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
        Remove-Item Env:BUN_CONFIG_REGISTRY -ErrorAction SilentlyContinue
    }

    $takoEntry = "$TAKO_CLI_DIR\node_modules\tako-cli\dist\index.js"
    if (-not (Test-Path $takoEntry)) {
        Write-Err "Tako CLI installation error: $takoEntry not found"
    }

    Write-Info "Tako CLI installed: $TAKO_CLI_DIR"

    return $takoEntry
}

# Create command
function Create-Command {
    param([string]$TakoEntry)

    Write-Info "Setting up tako command..."

    $bun = "$TAKO_BUN_DIR\bin\bun.exe"

    # Create bin directory
    New-Item -ItemType Directory -Force -Path $TAKO_BIN_DIR | Out-Null

    # Create tako.cmd batch file
    $cmdContent = @"
@echo off
"$bun" "$TakoEntry" %*
exit /b %ERRORLEVEL%
"@

    $bytes = [System.Text.Encoding]::ASCII.GetBytes($cmdContent)
    [System.IO.File]::WriteAllBytes("$TAKO_BIN_DIR\tako.cmd", $bytes)

    # Create tako.ps1 PowerShell script (optional)
    $ps1Content = @"
& "$bun" "$TakoEntry" @args
exit `$LASTEXITCODE
"@
    $ps1Bytes = [System.Text.Encoding]::UTF8.GetBytes($ps1Content)
    [System.IO.File]::WriteAllBytes("$TAKO_BIN_DIR\tako.ps1", $ps1Bytes)

    Write-Info "tako command created:"
    Write-Info "  - $TAKO_BIN_DIR\tako.cmd"
    Write-Info "  - $TAKO_BIN_DIR\tako.ps1"
}

# Setup PATH environment variable
function Setup-Path {
    Write-Info "Configuring PATH..."

    # Get current user PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")

    # Check if Tako bin directory is already in PATH
    if ($userPath -notlike "*$TAKO_BIN_DIR*") {
        # Add to user PATH
        $newPath = "$TAKO_BIN_DIR;$userPath"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Info "Added $TAKO_BIN_DIR to user PATH"

        # Also update current session PATH
        $env:Path = "$TAKO_BIN_DIR;$env:Path"
    } else {
        Write-Info "PATH already contains Tako bin directory"
    }
}

# Verify and auto-launch
function Verify-And-Launch {
    param([string]$TakoEntry)

    $bun = "$TAKO_BUN_DIR\bin\bun.exe"

    if (-not (Test-Path $bun) -or -not (Test-Path $TakoEntry)) {
        Write-Err "Installation verification failed"
    }

    Write-Info "Installation successful! Launching Tako CLI..."
    Write-Host ""

    # Auto-launch Tako CLI
    & $bun $TakoEntry
}

# Main
function Main {
    Write-Host ""
    Write-Host "  +====================================+" -ForegroundColor Cyan
    Write-Host "  |       Tako CLI Installer           |" -ForegroundColor Cyan
    Write-Host "  +====================================+" -ForegroundColor Cyan
    Write-Host ""

    $region = Detect-Region
    Install-Bun -Region $region
    Ensure-Git -Region $region
    $takoEntry = Install-Tako -Region $region
    Create-Command -TakoEntry $takoEntry
    Setup-Path
    Verify-And-Launch -TakoEntry $takoEntry
}

# Run
Main
