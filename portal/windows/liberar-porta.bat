@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Clique com o botao DIREITO neste arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
netsh advfirewall firewall add rule name="Portal Endossos" dir=in action=allow protocol=TCP localport=5000
echo.
echo Porta 5000 liberada no firewall do Windows (necessario para outros computadores acessarem).
pause
