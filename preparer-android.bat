@echo off
cd /d "%~dp0"
echo === AfroFlix Android - preparation Etape 24 ===
call npm install
if not exist android (
  call npm run add:android
)
call npm run sync
call npm run open:android
