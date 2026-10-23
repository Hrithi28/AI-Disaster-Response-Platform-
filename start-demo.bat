@echo off
REM One-click demo for Windows: AI engine (8000) + cloud HQ node (4200) + control-room node (4000)
REM Works with NO internet once dependencies have been installed one time (first run needs internet).
cd /d "%~dp0"

echo [1/5] Checking AI/ML engine dependencies...
python -c "import fastapi, uvicorn, sklearn, pandas, joblib" 2>nul
if errorlevel 1 (
  echo       Installing Python packages - needs internet the first time...
  python -m pip install -q -r ml-service\requirements.txt
  python -m pip install -q -r ml-service\requirements-nlp.txt || echo       spaCy optional - skipped
) else (
  echo       Already installed - skipping, works offline
)

echo [2/5] Checking API dependencies...
set NEED_NPM=0
if not exist backend\node_modules set NEED_NPM=1
if not exist backend\node_modules\@electric-sql\pglite set NEED_NPM=1
if not exist backend\node_modules\sts-whisper-base set NEED_NPM=1
if "%NEED_NPM%"=="1" (
  echo       Installing Node packages incl. offline database and voice model - needs internet once, about 300 MB...
  cd backend
  call npm install --no-audit --no-fund
  cd ..
) else (
  echo       Already installed - skipping, works offline
)

if not exist frontend\dist\index.html (
  echo [3/5] Building web app...
  cd frontend
  call npm install --no-audit --no-fund
  call npm run build
  cd ..
) else (
  echo [3/5] Web app already built
)

echo [4/5] Starting services in new windows...
start "DRP - AI/ML Engine :8000" cmd /k "cd ml-service && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
start "DRP - State HQ cloud :4200" cmd /k "cd backend && npm run cloud"
timeout /t 10 /nobreak > nul
start "DRP - Control room :4000" cmd /k "cd backend && set CLOUD_SYNC_URL=http://localhost:4200&& node src/server.js"
echo       Waiting for the control room to finish starting (first run trains the AI, about 1 minute)...
timeout /t 15 /nobreak > nul
echo [5/5] Opening browser...
start http://localhost:4000
echo Done. Login: admin@drp.in / admin123
echo Data is saved in backend\data\ - run reset-demo-data.bat to start fresh.
echo If the page says "Cannot reach the control-room server", wait until the "Control room :4000" window
echo prints "DRP EDGE node ... running", then refresh the page.
