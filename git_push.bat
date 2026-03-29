@echo off
git status
set /p confirm="Do you want to proceed with git add, commit, and push? (y/n): "
if /i "%confirm%" neq "y" (
    echo Operation cancelled.
    pause
    exit /b
)
git add .
git commit -m "fix"
git push origin main
pause
