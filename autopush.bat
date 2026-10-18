@echo off
title GreenCal - Auto Push Watcher
echo Menjalankan GreenCal Auto-Push Watcher...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autopush.ps1"
pause
