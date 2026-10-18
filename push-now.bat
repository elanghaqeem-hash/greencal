@echo off
setlocal
set MSG=%~1
if "%MSG%"=="" (
    set MSG=Update: %DATE% %TIME%
)
echo ==================================================
echo   GreenCal Quick Push
echo ==================================================
git add -A
git commit -m "%MSG%"
git push origin main
echo.
pause
