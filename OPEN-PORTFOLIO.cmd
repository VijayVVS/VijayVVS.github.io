@echo off
REM ============================================================
REM  OPEN-PORTFOLIO.cmd  --  double-click this to view the site.
REM
REM  Why this exists: index.html uses ES modules (<script type="module">),
REM  and browsers block those over file:// as a cross-origin request. Opening
REM  index.html directly gives you the content and styling but no JavaScript,
REM  so no 3D hero, no scroll animations and no horizontal rail.
REM
REM  This serves the folder over http://localhost so everything runs.
REM  Close this window to stop the server.
REM ============================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo   Vijay Venkatasamy - portfolio preview
echo   =====================================
echo.

REM ---- find a working Python -------------------------------------------
set "PY="
for %%C in (python py python3) do (
    if not defined PY (
        %%C -c "import sys" >nul 2>&1
        if !errorlevel! equ 0 set "PY=%%C"
    )
)

if not defined PY (
    echo   Python was not found on this machine.
    echo.
    echo   Either install Python from https://python.org
    echo   or, if you have Node.js, run this instead:
    echo       npx --yes serve .
    echo.
    pause
    exit /b 1
)

REM ---- find a free port ------------------------------------------------
set "PORT="
for %%P in (8080 8081 8082 8090 8123 9080) do (
    if not defined PORT (
        netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul 2>&1
        if !errorlevel! neq 0 set "PORT=%%P"
    )
)
if not defined PORT set "PORT=8080"

echo   Serving this folder on http://localhost:%PORT%
echo   Opening your browser...
echo.
echo   Leave this window open while you browse.
echo   Close it (or press Ctrl+C) to stop the server.
echo.

REM Give the server a moment to bind before the browser asks for the page.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/"

%PY% -m http.server %PORT% --bind 127.0.0.1

endlocal
