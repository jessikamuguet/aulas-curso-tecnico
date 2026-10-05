@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo === Instalando o Portal de Movimentacoes ^| Endossos ===
set "PY="
py -3 --version >nul 2>nul
if %errorlevel%==0 set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  echo.
  echo PYTHON NAO ENCONTRADO. Instale o Python em https://www.python.org/downloads/
  echo Na instalacao, marque "Add python.exe to PATH" e use "Install for all users".
  pause
  exit /b 1
)
%PY% -m venv venv
if errorlevel 1 ( echo Falha ao criar o ambiente. & pause & exit /b 1 )
venv\Scripts\python -m pip install --upgrade pip
venv\Scripts\python -m pip install -r requirements.txt waitress
if errorlevel 1 ( echo Falha ao instalar os componentes. Verifique a internet do servidor. & pause & exit /b 1 )
if not exist config.env copy config.env.exemplo config.env >nul
echo.
echo PRONTO. Proximo passo: abra o arquivo config.env no Bloco de Notas e troque ADMIN_PASSWORD por uma senha forte.
pause
