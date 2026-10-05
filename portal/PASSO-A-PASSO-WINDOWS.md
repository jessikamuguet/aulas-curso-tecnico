# Colocar o Portal de Movimentações | Endossos no ar, no Windows

Guia para quem não é da área técnica. Siga na ordem. Leva cerca de 30 minutos.

> **Aviso honesto:** os arquivos deste guia foram testados no Linux. Os arquivos `.bat` (instalador e agendamentos) são
> simples e seguem o padrão do Windows, mas **não foram executados em um Windows de verdade**. Se algum passo der erro,
> copie a mensagem da janela preta e peça ajuda. Nada aqui apaga ou muda outros programas do servidor.

---

## Passo 0. Escolha como o portal vai ser acessado

| | **Opção A: só dentro da rede da empresa** | **Opção B: pela internet** |
|---|---|---|
| Quem acessa | Computadores da rede ou da VPN | Qualquer pessoa, de qualquer lugar |
| Endereço | `http://192.168.0.25:5000` (o número do servidor) | `https://endossos.suaempresa.com.br` |
| Dificuldade | Fácil, este guia resolve | Precisa da **TI** para o HTTPS (veja o Passo 11) |
| Segurança | Senhas viajam sem criptografia dentro da rede | Senhas criptografadas (HTTPS) |

**Recomendação:** faça a Opção A primeiro para testar. Para os **clientes de fora da empresa**, a Opção B é obrigatória:
nunca coloque o portal na internet sem HTTPS.

**Você vai precisar de:** um computador ou servidor com Windows ligado o tempo todo, uma conta de **administrador** nele,
internet no servidor (só durante a instalação) e uma pasta em **outro disco ou na rede** para guardar os backups.

---

## Passo 1. Instalar o Python

1. No navegador do servidor, abra **https://www.python.org/downloads/** e baixe o Python mais novo (versão 3.11 ou maior).
2. Abra o arquivo baixado. Na **primeira tela**:
   - marque **"Add python.exe to PATH"** (caixinha lá embaixo);
   - clique em **"Customize installation"**.
3. Clique **Next**. Na tela seguinte marque **"Install Python for all users"** (importante, senão o portal não liga sozinho).
4. Clique **Install** e espere terminar.

**Conferir:** aperte a tecla Windows, digite `cmd`, Enter. Na janela preta digite `python --version` e Enter.
Deve aparecer algo como `Python 3.12.x`.

## Passo 2. Copiar o portal para o servidor

1. Abra **https://github.com/jessikamuguet/aulas-curso-tecnico**, escolha a branch
   **`claude/portal-pro-rata-calculator-t8qmiv`** (menu "main" no alto da lista) e clique em **Code → Download ZIP**.
2. Abra o ZIP baixado e **copie a pasta `portal`** para dentro de **`C:\`**. Ela deve ficar em **`C:\portal`**
   (caminho curto, sem acentos nem espaços).

**Conferir:** existe o arquivo `C:\portal\app.py` e a pasta `C:\portal\windows`.

## Passo 3. Instalar os componentes

1. Abra a pasta `C:\portal\windows`.
2. Dê **dois cliques em `instalar.bat`**.
3. Aguarde a janela preta trabalhar (1 a 3 minutos). No fim aparece **"PRONTO"**. Aperte uma tecla para fechar.

Se aparecer "PYTHON NAO ENCONTRADO", refaça o Passo 1 marcando as caixinhas.

## Passo 4. Configurar a senha do administrador

1. Em `C:\portal` apareceu um arquivo chamado **`config.env`**. Clique com o botão direito → **Abrir com → Bloco de Notas**.
2. Troque `TROQUE-ESTA-SENHA` por uma **senha forte** (12 caracteres ou mais, com letras e números). Sem aspas, sem espaços.
3. Deixe o resto como está (Opção A). **Arquivo → Salvar** e feche.

Essa senha é do usuário **`admin`** e só vale na **primeira vez** que o portal inicia. Depois de entrar com ela, você pode
apagar essa linha do arquivo, para a senha não ficar escrita no servidor.

## Passo 5. Testar

1. Em `C:\portal\windows`, dê dois cliques em **`iniciar.bat`**.
2. Abre uma janela preta com a frase **"Portal ... rodando em http://0.0.0.0:5000"**. Deixe aberta.
3. No navegador do próprio servidor, abra **http://localhost:5000**.
4. Entre com usuário **`admin`** e a senha do Passo 4.

Entrou? Ótimo. **Feche a janela preta** (isso desliga o portal; o próximo passo o deixa ligado para sempre).

## Passo 6. Fazer o portal ligar sozinho

1. Em `C:\portal\windows`, clique com o **botão direito** em **`instalar-servico.bat`** → **Executar como administrador**
   → **Sim**.
2. Deve aparecer "PRONTO. O portal foi ligado". Desde agora ele liga sozinho quando o servidor iniciar.
3. Teste de novo: **http://localhost:5000**.

## Passo 7. Liberar o acesso para outros computadores (Opção A)

1. Botão direito em **`liberar-porta.bat`** → **Executar como administrador**.
2. Descubra o endereço certo: dê dois cliques em **`descobrir-endereco.bat`**. (O `iniciar.bat` também mostra isso na janela
   preta.) Aparece algo como `http://192.168.0.25:5000` em "Endereços para abrir em OUTROS computadores da rede".
3. Em **outro computador da rede**, abra esse endereço. A tela de login deve aparecer.

> **Atenção: endereço que começa com `169.254` NÃO funciona para os outros.** Ele aparece quando o computador **não recebeu
> um IP da rede** (cabo ou Wi-Fi desconectado, ou a rede não entregou o endereço). Quem abre pelo próprio servidor ainda
> consegue entrar, mas ninguém mais. Conecte o servidor à rede da empresa e, se continuar assim, peça à TI um **IP fixo**.
> Um endereço de VPN, de Hyper-V ou de WSL também não serve: use o da placa ligada à rede da empresa.

**Se o endereço está certo e ainda não abre nos outros computadores:**
1. O `config.env` tem `PORTAL_HOST=0.0.0.0`? (Se estiver `127.0.0.1`, só o próprio servidor acessa.) Depois de mudar, reinicie (Passo 12).
2. Rodou o `liberar-porta.bat` como administrador? Se há antivírus com firewall próprio, a TI precisa liberar a porta **5000** nele também.
3. Teste do outro computador: tecla Windows, digite `powershell`, Enter, e rode
   `Test-NetConnection 192.168.0.25 -Port 5000` (com o seu número). Se aparecer `TcpTestSucceeded : True`, a rede está
   certa; se `False`, é firewall ou rede (peça à TI).
4. Os dois computadores estão na **mesma rede**? Redes de visitantes e Wi-Fi com "isolamento de clientes" bloqueiam isso.

**Dica:** peça à TI um **IP fixo** para o servidor (senão o endereço pode mudar) e, se quiserem, um nome fácil, como
`http://endossos`.

## Passo 8. Cadastrar os clientes

1. Entre como `admin`, clique em **Usuários**.
2. Preencha nome, usuário e senha (mínimo 8 caracteres) e clique **Criar usuário**.
3. Passe o usuário e a senha ao cliente por um canal seguro.

**Outros administradores:** na mesma tela, escolha o perfil **Administrador**. O limite é de **5 administradores ativos**;
se precisar de outra vaga, clique em **Desativar** em um deles. Cada administrador entra com o próprio usuário e senha, e o portal
registra quem devolveu cada endosso.

## Passo 9. Backup automático (não pule este passo)

Tudo (solicitações, usuários, PDFs) fica no arquivo `C:\portal\portal.db`. Se o disco quebrar, sem backup tudo se perde.

1. Abra `C:\portal\config.env` no Bloco de Notas, apague o `#` da linha `PORTAL_BACKUP_DIR` e coloque uma pasta
   **de outro disco ou da rede**, por exemplo `PORTAL_BACKUP_DIR=D:\Backups\Portal`. Salve.
2. Botão direito em **`agendar-backup.bat`** → **Executar como administrador**. O backup passa a ser feito **todo dia às 22:00**
   (guarda os 30 mais recentes).
3. Teste agora: dois cliques em **`backup.bat`**. Veja se apareceu um arquivo `portal-AAAAMMDD-HHMM.db` na pasta escolhida.

**Para restaurar um backup:** desligue o portal (Passo 12), copie o arquivo de backup para `C:\portal`, renomeie para
`portal.db` (substituindo o atual) e ligue de novo.

## Passo 10. Esqueceram a senha

- **Cliente ou outro administrador:** entre como administrador → **Usuários** → botão **Redefinir senha** na linha da pessoa.
  Use **Gerar senha** (ou digite uma), clique **Redefinir senha** e passe a senha temporária por um canal seguro (anote: ela
  não é mostrada de novo). Ao entrar, a pessoa é **obrigada a escolher uma senha nova**.
- **Trocar a própria senha:** botão **Alterar senha** no alto da tela.
- **Você esqueceu a sua e não há outro administrador para ajudar:** dois cliques em **`redefinir-senha.bat`** no servidor, digite
  a nova senha duas vezes (ela não aparece enquanto você digita). Para outro usuário, use `venv\Scripts\python redefinir_senha.py usuario`.

## E-mails do portal (opcional, mas recomendado)

Com o e-mail configurado, o portal envia o **convite de cadastro** e o link do **"esqueci minha senha"**. Sem ele tudo funciona,
só que o administrador precisa copiar e repassar os links que aparecem na tela.

1. Peça à **TI** os dados de uma **conta de e-mail para o portal** (por exemplo `portal@suaempresa.com.br`): servidor SMTP, porta,
   tipo de segurança, usuário e senha. (No Microsoft 365 costuma ser `smtp.office365.com`, porta 587, e a TI precisa liberar o
   envio SMTP autenticado para essa caixa.)
2. No `config.env`, apague o `#` das linhas `SMTP_...` e `PORTAL_URL` e preencha. Em `PORTAL_URL` vai o endereço que os clientes usam
   para abrir o portal (é o que aparece nos links dos e-mails). Para o seu e-mail de administrador entrar por e-mail, preencha
   `ADMIN_EMAIL`.
3. Reinicie o portal (Passo 12).
4. Teste: em **Usuários**, cadastre uma pessoa **sem senha** (use um e-mail seu) e veja se o convite chega. Se não chegar, olhe a
   caixa de spam e peça à TI para conferir a conta SMTP.

**Importante:** usuários antigos (criados antes desta versão) não têm e-mail. Em **Usuários**, clique em **E-mail** na linha de cada um
para cadastrar. Até lá eles continuam entrando com o usuário e a senha de antes.

## Passo 11. Transformar em um site na internet (Opção B)

Até aqui o portal abre por um número, como `http://192.168.0.25:5000`, e só dentro da rede. Para ser **um site de verdade**
(`https://endossos.suaempresa.com.br`, com cadeado, acessível de qualquer lugar) são necessárias **quatro coisas**:

| O que | Para quê | Quem faz |
|---|---|---|
| 1. Um **endereço** (domínio) | O nome que as pessoas digitam | TI (cria no DNS da empresa um nome como `endossos.suaempresa.com.br` apontando para o **IP público** do servidor) |
| 2. **Portas 80 e 443 abertas** até o servidor | Para a internet chegar nele | TI (roteador/firewall da empresa) |
| 3. **HTTPS** (certificado) | Cadeado e senhas protegidas | O Caddy faz sozinho e de graça (passos abaixo) |
| 4. O portal rodando só por dentro | O Caddy fica na frente e o portal atrás | Você (config.env) |

> **Sem HTTPS, não coloque o portal na internet:** as senhas dos clientes viajariam abertas.

**Caminho fácil: Caddy.** Ele é um programa pequeno que cuida do HTTPS e do certificado, e renova sozinho.

1. **Antes de tudo**, peça à TI os itens 1 e 2 da tabela. Mande este pedido:
   > "Precisamos de um endereço **endossos.suaempresa.com.br** apontando para o IP público do servidor do portal, e das portas
   > **80 e 443** (TCP) encaminhadas para ele. A porta 5000 **não** deve ser aberta para a internet."
2. Baixe o Caddy para Windows em **https://caddyserver.com/download** (Windows, amd64) e coloque o `caddy.exe` em **`C:\caddy`**.
3. Copie `C:\portal\windows\Caddyfile.exemplo` para `C:\caddy` e renomeie para **`Caddyfile`** (sem extensão). Abra no Bloco de Notas
   e troque `endossos.suaempresa.com.br` pelo seu endereço.
4. Botão direito em **`C:\portal\windows\instalar-https.bat`** → **Executar como administrador**. Ele libera as portas 80 e 443 no
   Windows e liga o Caddy sozinho a cada início do servidor.
5. No `C:\portal\config.env`:
   - troque `PORTAL_HOST=0.0.0.0` por **`PORTAL_HOST=127.0.0.1`**;
   - apague o `#` de **`HTTPS=1`** e **`TRUST_PROXY=1`**;
   - preencha **`PORTAL_URL=https://endossos.suaempresa.com.br`** (aparece nos links dos e-mails).
6. Reinicie o portal (Passo 12).
7. **Teste:** em um celular com a internet do plano (fora do Wi-Fi da empresa), abra `https://endossos.suaempresa.com.br`.
   Deve aparecer o login com o **cadeado**. Se a página não abrir, quase sempre é o DNS ou as portas 80/443 (volte à TI).
8. **Feche a porta antiga:** se você usou o `liberar-porta.bat` (Passo 7), rode no `cmd` como administrador:
   `netsh advfirewall firewall delete rule name="Portal Endossos"`. Assim a porta 5000 deixa de ser acessível por fora.

> Os arquivos do Caddy (`Caddyfile.exemplo` e `instalar-https.bat`) seguem o padrão do programa, mas **não foram executados em um
> Windows de verdade**. O lado do portal (HTTPS, cookie seguro, IP real do cliente atrás de proxy) foi testado.

**Se a TI preferir outra ferramenta** (IIS com ARR, Nginx), o pedido é o mesmo: HTTPS válido apontando para
`http://127.0.0.1:5000`, repassando `X-Forwarded-For` e `X-Forwarded-Proto`.

**Alternativa sem servidor próprio: hospedar na nuvem.** Serviços como Render, Railway ou um servidor virtual (VPS) já vêm com
endereço e HTTPS. É o caminho mais simples se a empresa não quer abrir portas, mas atenção a três pontos:
1. precisa de **disco persistente** para o `portal.db` (senão os dados somem a cada atualização) e de backup;
2. o comando de início é `gunicorn -w 1 --threads 4 -b 0.0.0.0:$PORT app:app` e as variáveis do `config.env` entram como
   variáveis de ambiente do serviço (`ADMIN_PASSWORD`, `HTTPS=1`, `TRUST_PROXY=1`, `PORTAL_URL`, `SMTP_...`);
3. os dados (e-mails, placas, PDFs) ficam fora da empresa: confira com quem cuida de **LGPD/segurança** se isso é permitido.

**Depois de colocar no ar:** cadastre os clientes (Passo 8), configure os e-mails (seção "E-mails do portal") e confirme o backup
(Passo 9).

## Passo 12. Desligar, ligar e reiniciar

Tecla Windows → digite **Agendador de Tarefas** → abra → **Biblioteca do Agendador de Tarefas** → **Portal Endossos**.
Botão direito: **Finalizar** (desliga) e **Executar** (liga). Para reiniciar, faça os dois, um depois do outro.
Sempre que mudar o `config.env`, reinicie.

## Passo 13. Atualizar o portal quando sair uma versão nova

O portal instalado **não se atualiza sozinho**: você copia os arquivos novos por cima e roda um arquivo que cuida do resto.
Seus dados (usuários, solicitações, PDFs, senhas, configuração) **não são apagados**.

1. **Baixe a versão nova** como no Passo 2 (GitHub → branch → **Code → Download ZIP**) e abra o ZIP.
2. **Copie o conteúdo da pasta `portal` do ZIP para `C:\portal`** e, quando o Windows perguntar, escolha
   **"Substituir os arquivos no destino"**. Pode copiar tudo: o ZIP não contém `portal.db`, `config.env` nem `venv`,
   então eles não são tocados.
3. Botão direito em **`C:\portal\windows\atualizar.bat`** → **Executar como administrador**. Ele faz, nesta ordem:
   backup do banco, desliga o portal, atualiza os componentes e liga de novo. Se o backup falhar, ele **cancela**
   sem mexer em nada.
4. Abra o portal no navegador e aperte **Ctrl+F5** (para o navegador não usar a tela antiga).

Mudanças no banco (por exemplo, colunas novas) são feitas **automaticamente** na primeira vez que o portal liga.

**Se algo der errado:** desligue o portal (Passo 12), restaure o último backup (Passo 9) e volte os arquivos da versão anterior.

### Servidor sem internet

O `atualizar.bat` precisa baixar os componentes. Se o servidor **não tem internet**:
1. Em um computador **com internet, mesmo Windows e mesma versão do Python** do servidor, abra o `cmd` na pasta `portal` e rode:
   `pip download -r requirements.txt waitress -d pacotes`
2. Copie a pasta **`pacotes`** que apareceu para dentro de `C:\portal` no servidor.
3. Rode o `atualizar.bat` normalmente: se existir a pasta `pacotes`, ele instala dela, sem internet.

Se a versão nova **não** trouxe componentes novos, o passo 3 do `atualizar.bat` termina rápido e nada precisa ser baixado.

**E a demonstração (o link do Claude)?** Ela é separada: eu a atualizo e o link continua o mesmo, você não faz nada.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "PYTHON NAO ENCONTRADO" | Refaça o Passo 1 marcando "Add python.exe to PATH" |
| Abre no servidor, mas não em outro PC | Veja o Passo 7: o endereço não pode começar com `169.254`; rode `liberar-porta.bat`; confira `PORTAL_HOST=0.0.0.0`; use `descobrir-endereco.bat` |
| Reiniciei o servidor e o portal não ligou | Passo 6 não foi feito, ou o Python foi instalado "só para mim" (refaça o Passo 1 para todos os usuários) |
| "Muitas tentativas" no login | Espere 1 minuto e tente de novo |
| Tela não carrega depois de editar `config.env` | Reinicie o portal (Passo 12); confira que não há aspas nem erro de digitação |
| Quero ver os erros | Pare a tarefa (Passo 12) e abra `windows\iniciar.bat`: a janela preta mostra as mensagens |

## Opcional: guardar os PDFs também no SharePoint

Fica para depois, quando a TI cadastrar o aplicativo no Microsoft 365. As instruções estão no `README.md` (seção
"Arquivo dos PDFs no SharePoint"). Os dados vão no mesmo `config.env`, nas linhas que começam com `SP_`.
