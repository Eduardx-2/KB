# Backend — usar cuando tengas Supabase + OpenAI configurados en .env
# En Windows, pip suele no estar en PATH; usamos el launcher py:

$Python = "py"
if (Get-Command py -ErrorAction SilentlyContinue) {
    $ver = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
    if ($ver) { $Python = "py -3.11" }
}

Write-Host "Instalando dependencias..." -ForegroundColor Yellow
Invoke-Expression "$Python -m pip install -r requirements.txt"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Levantando API en http://localhost:8000 ..." -ForegroundColor Green
Invoke-Expression "$Python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
