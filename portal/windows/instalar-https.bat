@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Clique com o botao DIREITO neste arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
if not exist "C:\caddy\caddy.exe" (
  echo Nao encontrei C:\caddy\caddy.exe. Baixe o Caddy para Windows em https://caddyserver.com/download e coloque o arquivo caddy.exe em C:\caddy
  pause
  exit /b 1
)
if not exist "C:\caddy\Caddyfile" (
  echo Nao encontrei C:\caddy\Caddyfile. Copie windows\Caddyfile.exemplo para C:\caddy\Caddyfile, troque o endereco e salve sem extensao.
  pause
  exit /b 1
)
echo Liberando as portas 80 e 443 no firewall do Windows...
netsh advfirewall firewall add rule name="Portal HTTPS" dir=in action=allow protocol=TCP localport=80,443
echo Criando a tarefa que liga o HTTPS sozinho com o Windows...
schtasks /Create /TN "Portal Caddy" /TR "\"C:\caddy\caddy.exe\" run --config \"C:\caddy\Caddyfile\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 (
  echo Falha ao criar a tarefa.
  pause
  exit /b 1
)
schtasks /Run /TN "Portal Caddy"
echo.
echo PRONTO. Agora ajuste o config.env (Passo 11 do guia) e reinicie o portal.
pause
