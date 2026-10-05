@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Clique com o botao DIREITO neste arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
cd /d "%~dp0.."
echo [1/4] Fazendo backup do banco...
venv\Scripts\python backup.py
if errorlevel 1 (
  echo FALHA NO BACKUP. A atualizacao foi cancelada e nada foi alterado.
  pause
  exit /b 1
)
echo [2/4] Parando o portal...
schtasks /End /TN "Portal Endossos" >nul 2>&1
timeout /t 4 /nobreak >nul
echo [3/4] Atualizando os componentes...
if exist pacotes (
  venv\Scripts\python -m pip install --no-index --find-links pacotes -r requirements.txt waitress
) else (
  venv\Scripts\python -m pip install -r requirements.txt waitress
)
if errorlevel 1 (
  echo FALHA ao instalar os componentes. O servidor tem internet? Se nao tiver, veja o passo "Servidor sem internet" no guia.
  schtasks /Run /TN "Portal Endossos" >nul 2>&1
  pause
  exit /b 1
)
echo [4/4] Ligando o portal...
schtasks /Run /TN "Portal Endossos"
echo.
echo PRONTO. Abra o portal no navegador e aperte Ctrl+F5 para carregar a versao nova.
pause
