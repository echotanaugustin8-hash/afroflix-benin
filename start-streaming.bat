@echo off
cd /d "%~dp0.."
echo Demarrage du serveur AfroFlix et du serveur TV...
docker compose up -d
echo.
echo Serveurs demarres.
echo AfroFlix : http://localhost:3000
 echo HLS : http://localhost:8888/afroflix-tv/index.m3u8
pause
