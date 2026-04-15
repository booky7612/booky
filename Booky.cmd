@echo off
cd /d "%~dp0"
where pyw >nul 2>&1
if %errorlevel%==0 (
  start "" pyw "%~dp0booky.pyw"
) else (
  start "" py "%~dp0booky.pyw"
)
exit /b
