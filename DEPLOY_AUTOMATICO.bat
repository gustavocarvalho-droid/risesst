@echo off
title DEV SWG - Deploy automatico
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
pause
