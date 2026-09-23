@echo off
setlocal EnableExtensions
cd /d "%~dp0"
start "Natural Selection Launcher" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\launch-natural-selection.ps1"
endlocal
