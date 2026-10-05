@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Clique com o botao DIREITO neste arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
set "RAIZ=%~dp0"
echo Criando a tarefa que liga o portal sozinho quando o Windows iniciar...
schtasks /Create /TN "Portal Endossos" /TR "\"%RAIZ%iniciar.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 ( echo Falha ao criar a tarefa. & pause & exit /b 1 )
schtasks /Run /TN "Portal Endossos"
echo.
echo PRONTO. O portal foi ligado e vai ligar sozinho sempre que o servidor reiniciar.
pause
