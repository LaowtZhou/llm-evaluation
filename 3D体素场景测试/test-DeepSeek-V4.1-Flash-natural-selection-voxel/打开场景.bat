@echo off
rem ============================================================
rem  Natural Selection - Voxel Panorama  /  one click launcher
rem  Pure ASCII on purpose: avoids Windows CMD GBK/UTF-8 issues
rem ============================================================
rem  Picks the release .html. Files starting with "_" (debug
rem  builds, temp output) are skipped on purpose, because "_"
rem  sorts before Chinese characters and would otherwise win.
rem ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "TARGET="
for %%f in ("*.html") do (
  set "N=%%~nf"
  if not "!N:~0,1!"=="_" if not defined TARGET set "TARGET=%%~ff"
)

if not defined TARGET (
  echo [ERROR] No release .html found in this folder.
  pause
  exit /b 1
)

echo Opening: %TARGET%
start "" "%TARGET%"
exit /b 0
