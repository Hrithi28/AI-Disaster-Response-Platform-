@echo off
REM Deletes the saved demo data (users you registered, incidents, reports). Close the server windows first.
cd /d "%~dp0"
echo This deletes all saved data in backend\data (registered users, incidents, reports).
pause
rmdir /s /q backend\data\local-db 2>nul
rmdir /s /q backend\data\local-db-cloud 2>nul
del /q backend\data\local-docs*.json* 2>nul
echo Done. The next start-demo.bat run begins with fresh demo data.
pause
