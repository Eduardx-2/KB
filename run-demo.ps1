# Meeting-to-Tickets PM — arranque rápido en modo DEMO
# No requiere Supabase, Python ni backend.

Write-Host ""
Write-Host "  Meeting-to-Tickets PM — modo DEMO" -ForegroundColor Cyan
Write-Host "  (sin Supabase, sin backend)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Abrí http://localhost:3000 cuando compile." -ForegroundColor Green
Write-Host ""

Set-Location "$PSScriptRoot\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

npm run dev
