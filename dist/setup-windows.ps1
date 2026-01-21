# FacebookPro Blaster - One Click Setup for Windows
# This script will automatically setup everything you need

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Self-elevate the script if required
if (-Not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] 'Administrator')) {
    if ([int](Get-CimInstance -Class Win32_OperatingSystem | Select-Object -ExpandProperty BuildNumber) -ge 6000) {
        Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
        # Preserve the working directory by setting it explicitly
        $CommandLine = "-NoExit -Command `"Set-Location '$ScriptDir'; & '$($MyInvocation.MyCommand.Path)'`""
        Start-Process -FilePath PowerShell.exe -Verb Runas -ArgumentList $CommandLine
        Exit
    }
}

# Ensure we're in the script directory
Set-Location $ScriptDir

Write-Host "" 
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  FacebookPro Blaster - Windows Setup (PowerShell)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Running with Administrator privileges" -ForegroundColor Green
Write-Host ""

Write-Host "Starting automated setup..." -ForegroundColor Green
Write-Host ""

# Function to check if command exists
function Test-CommandExists {
    param($command)
    $null = Get-Command $command -ErrorAction SilentlyContinue
    return $?
}

# STEP 1: Check and Install Node.js  
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "STEP 1: Node.js Installation" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

if (Test-CommandExists node) {
    $nodeVersion = node --version
    Write-Host "[+] Node.js already installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[*] Downloading Node.js LTS..." -ForegroundColor Yellow
    
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\nodejs-installer.msi"
    
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
        Write-Host "[*] Installing Node.js (this may take a few minutes)..." -ForegroundColor Yellow
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait
        
        # Refresh environment variables
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = $machinePath + ";" + $userPath
        
        Write-Host "[+] Node.js installed successfully!" -ForegroundColor Green
        Remove-Item $nodeInstaller -Force
    } catch {
        Write-Host "[-] Failed to install Node.js: $_" -ForegroundColor Red
        Write-Host "    Please install manually from: https://nodejs.org" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}


Write-Host ""

# STEP 1.5: Check and Install Python 3.12
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "STEP 1.5: Python 3.12 Installation (Required for Face Swap)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

if (Test-CommandExists python) {
    $pyVersion = python --version 2>&1
    Write-Host "[+] Python already installed: $pyVersion" -ForegroundColor Green
    
    # Check if pip works
    Write-Host "[*] Upgrading pip..." -ForegroundColor Yellow
    python -m pip install --upgrade pip
    
    Write-Host "[*] Installing Face Swap dependencies (InsightFace)..." -ForegroundColor Yellow
    python -m pip install insightface onnxruntime opencv-python gdown
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[+] Python dependencies installed!" -ForegroundColor Green

        # Download Model
        $modelPath = Join-Path $ScriptDir "bot\inswapper_128.onnx"
        if (-not (Test-Path $modelPath)) {
            Write-Host "[*] Downloading Face Swap Model (inswapper_128.onnx)..." -ForegroundColor Yellow
            # Use gdown via python
            python -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O "$modelPath"
            
            if (Test-Path $modelPath) {
                 Write-Host "[+] Face Swap Model downloaded!" -ForegroundColor Green
            } else {
                 Write-Host "[-] Failed to download Face Swap Model." -ForegroundColor Red
            }
        } else {
             Write-Host "[+] Face Swap Model already exists." -ForegroundColor Green
        }

    } else {
        Write-Host "[-] Failed to install Python dependencies. Please install 'insightface onnxruntime opencv-python' manually." -ForegroundColor Red
    }
} else {
    Write-Host "[*] Downloading Python 3.12..." -ForegroundColor Yellow
    
    $pyUrl = "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe"
    $pyInstaller = "$env:TEMP\python-installer.exe"
    
    try {
        Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing
        Write-Host "[*] Installing Python 3.12 (Silent Mode)..." -ForegroundColor Yellow
        
        # Install Python silently with Path enabled
        Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "[+] Python 3.12 installed!" -ForegroundColor Green
        Remove-Item $pyInstaller -Force
        
        # Try installing dependencies after fresh install
        Write-Host "[*] Installing Face Swap dependencies..." -ForegroundColor Yellow
        & "python" -m pip install --upgrade pip
        & "python" -m pip install insightface onnxruntime opencv-python gdown
        
        # Download Model after fresh install
        $modelPath = Join-Path $ScriptDir "bot\inswapper_128.onnx"
        if (-not (Test-Path $modelPath)) {
            Write-Host "[*] Downloading Face Swap Model (inswapper_128.onnx)..." -ForegroundColor Yellow
            & "python" -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O "$modelPath"
             if (Test-Path $modelPath) {
                 Write-Host "[+] Face Swap Model downloaded!" -ForegroundColor Green
            }
        }

    } catch {
        Write-Host "[-] Failed to install Python: $_" -ForegroundColor Red
        Write-Host "    Please install Python 3.12 manually from https://python.org" -ForegroundColor Yellow
    }
}

Write-Host ""

# STEP 2: Prepare Folders
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "STEP 2: Preparing Folders" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$requiredFolders = @(
    "accounts",
    "videos",
    "photos",
    "logs",
    "logs\scheduler",
    "logs\telegram",
    "logs\maintenance",
    "logs\error",
    "config"
)

foreach ($folder in $requiredFolders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Host "[+] Created: $folder" -ForegroundColor Green
    } else {
        Write-Host "[*] Exists:  $folder" -ForegroundColor Gray
    }
}

Write-Host ""

# STEP 3: Install NPM Dependencies
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "STEP 3: Installing NPM Dependencies" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

if (Test-Path "package.json") {
    Write-Host "[*] Installing dependencies with npm install..." -ForegroundColor Yellow
    npm install
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[+] Dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "[-] npm install failed!" -ForegroundColor Red
        Write-Host "    Please check your internet connection and try again" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "[-] package.json not found!" -ForegroundColor Red
    Write-Host "    Make sure you're in the correct directory" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Setup completed successfully!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Configure your accounts in the 'accounts' folder" -ForegroundColor White
Write-Host "  2. Run 'node bot/executor status' to check system status" -ForegroundColor White
Write-Host "  3. Start the bot with your preferred command" -ForegroundColor White
Write-Host ""
Write-Host "For help, visit: https://github.com/scwhhhhg/fbpro-blaster" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
