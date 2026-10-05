@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Clique com o botao DIREITO neste arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
set "RAIZ=%~dp0"
schtasks /Create /TN "Portal Endossos Backup" /TR "\"%RAIZ%backup.bat\"" /SC DAILY /ST 22:00 /RU SYSTEM /F
echo.
echo PRONTO. O backup sera feito todo dia as 22:00.
pause
