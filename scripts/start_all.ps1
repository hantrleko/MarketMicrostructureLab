# Launch both FastAPI backend and React/Vite frontend

$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      Starting Market Microstructure Lab (MML)            " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Start Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir'; .\.venv\Scripts\uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload"

# Start Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\apps\web'; npm run dev"

Write-Host "[+] Backend launching on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "[+] Frontend launching on http://localhost:5173" -ForegroundColor Green
Write-Host "[+] Both services running in background terminal windows." -ForegroundColor Cyan
