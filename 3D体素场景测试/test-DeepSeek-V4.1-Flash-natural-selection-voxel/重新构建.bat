@echo off
rem ============================================================
rem  Rebuild the single-file HTML from sources.
rem  Pure ASCII on purpose: avoids Windows CMD GBK/UTF-8 issues
rem ============================================================
cd /d "%~dp0"

set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2\node.exe"
if not exist "%NODE%" set "NODE=node"

echo [1/3] Sculpt self-check...
"%NODE%" tools\selfcheck.mjs
if errorlevel 1 (
  echo [ERROR] Self-check failed. Sculpture went out of the safe band.
  pause
  exit /b 1
)

echo.
echo [2/3] Bundling with esbuild...
"%NODE%" build.mjs
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Rendering offline preview images...
"%NODE%" --max-old-space-size=4096 tools\preview.mjs
if errorlevel 1 (
  echo [WARN] Preview rendering failed, but the HTML build is fine.
)

echo.
echo Done. Double-click the .html file to view the scene.
echo.
echo Tip: if the page reports an error, run  build.mjs --debug  to get
echo      an unminified build (_debug.html) with readable stack traces.
pause
exit /b 0
