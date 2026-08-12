Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  INICIANDO SISTEMA (MODO RED LOCAL)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$backendDir = Join-Path $PSScriptRoot "backend"

# Kill any leftover processes
Get-Process "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[1/3] Actualizando codigo desde GitHub..." -ForegroundColor Yellow
try {
    if (Test-Path (Join-Path $PSScriptRoot ".git")) {
        $gitResult = git -C $PSScriptRoot pull 2>&1
        Write-Host "       $gitResult" -ForegroundColor Gray
    } else {
        Write-Host "       [aviso] no es un repositorio git; omitiendo pull" -ForegroundColor Gray
    }
} catch {
    Write-Host "       ERROR: No se pudo hacer git pull - $_" -ForegroundColor Red
    pause
    exit 1
}

# Install/update Python dependencies
Write-Host "       Instalando dependencias del backend..." -ForegroundColor Gray
try {
    $pipResult = cmd.exe /c "cd /d `"$backendDir`" && call venv\Scripts\activate.bat && pip install -r requirements.txt -q" 2>&1
} catch {}

Write-Host "[2/3] Iniciando backend..." -ForegroundColor Yellow
$backendJob = Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$backendDir`" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"
Start-Sleep -Seconds 3

Write-Host "[3/3] Arrancando el frontend compilado (servido por el backend)..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $PSScriptRoot "frontend\dist\index.html"))) {
    Write-Host "       Frontend no compilado. Compilando..." -ForegroundColor Gray
    try {
        $npmResult = cmd.exe /c "cd /d `"$(Join-Path $PSScriptRoot "frontend")`" && npm ci && npm run build" 2>&1
        Write-Host "       $npmResult" -ForegroundColor Gray
    } catch {
        Write-Host "       ERROR: no se pudo compilar el frontend (¿Node.js instalado?)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SISTEMA INICIADO CORRECTAMENTE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Accede desde este equipo:   http://localhost:8000" -ForegroundColor White
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "  Accede desde la red local:  http://$ip`:8000" -ForegroundColor White
}
Write-Host ""
Write-Host "  No cierres esta ventana." -ForegroundColor Yellow
Write-Host ""
pause