@echo off
title 自然选择号 · 体素全景（顶级版）
cd /d "%~dp0"
REM 排除 _debug.html 排查包，_ 排在汉字前
for %%f in ("自然选择号*.html") do (
  set "F=%%f"
  setlocal enabledelayedexpansion
  set "N=!F:~0,1!"
  if "!N!"=="" (
    start "" "%%f"
    goto :end
  )
  if "!N!"=="_" (
    goto :next
  )
  start "" "%%f"
  goto :end
  :next
  endlocal
)
:end
exit /b 0
