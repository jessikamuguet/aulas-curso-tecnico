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
2. Descubra o endereço do servidor: tecla Windows, digite `cmd`, Enter, digite `ipconfig` e Enter. Procure
   **"Endereço IPv4"**, por exemplo `192.168.0.25`.
3. Em **outro computador da rede**, abra `http://192.168.0.25:5000` (com o seu número). A tela de login deve aparecer.

**Dica:** peça à TI para dar um **IP fixo** ao servidor (senão o endereço pode mudar) e, se quiserem, um nome fácil,
como `http://endossos`.

## Passo 8. Cadastrar os clientes

1. Entre como `admin`, clique em **Usuários**.
2. Preencha nome, usuário e senha (mínimo 8 caracteres) e clique **Criar usuário**.
3. Passe o usuário e a senha ao cliente por um canal seguro.

## Passo 9. Backup automático (não pule este passo)

Tudo (solicitações, usuários, PDFs) fica no arquivo `C:\portal\portal.db`. Se o disco quebrar, sem backup tudo se perde.

1. Abra `C:\portal\config.env` no Bloco de Notas, apague o `#` da linha `PORTAL_BACKUP_DIR` e coloque uma pasta
   **de outro disco ou da rede**, por exemplo `PORTAL_BACKUP_DIR=D:\Backups\Portal`. Salve.
2. Botão direito em **`agendar-backup.bat`** → **Executar como administrador**. O backup passa a ser feito **todo dia às 22:00**
   (guarda os 30 mais recentes).
3. Teste agora: dois cliques em **`backup.bat`**. Veja se apareceu um arquivo `portal-AAAAMMDD-HHMM.db` na pasta escolhida.

**Para restaurar um backup:** desligue o portal (Passo 12), copie o arquivo de backup para `C:\portal`, renomeie para
`portal.db` (substituindo o atual) e ligue de novo.

## Passo 10. Se esquecer a senha do admin

Dois cliques em **`redefinir-senha.bat`**, digite a nova senha duas vezes (ela não aparece enquanto você digita).

## Passo 11. Acesso pela internet (Opção B)

Esta parte é da **TI**. Mande este pedido:

> "Precisamos publicar o endereço **endossos.suaempresa.com.br** com **HTTPS** (certificado válido) apontando para
> `http://127.0.0.1:5000` deste servidor, como proxy reverso (IIS com ARR ou Nginx/Caddy). O proxy deve enviar os cabeçalhos
> `X-Forwarded-For` e `X-Forwarded-Proto`. **Não** liberar a porta 5000 diretamente para a internet."

Depois, no `config.env`:
1. troque `PORTAL_HOST=0.0.0.0` por **`PORTAL_HOST=127.0.0.1`**;
2. apague o `#` das linhas **`HTTPS=1`** e **`TRUST_PROXY=1`**;
3. **não** use o `liberar-porta.bat`;
4. reinicie o portal (Passo 12).

## Passo 12. Desligar, ligar e reiniciar

Tecla Windows → digite **Agendador de Tarefas** → abra → **Biblioteca do Agendador de Tarefas** → **Portal Endossos**.
Botão direito: **Finalizar** (desliga) e **Executar** (liga). Para reiniciar, faça os dois, um depois do outro.
Sempre que mudar o `config.env`, reinicie.

## Passo 13. Atualizar o portal no futuro

1. Faça um backup (`backup.bat`) e desligue o portal.
2. Baixe a versão nova (Passo 2) e copie por cima da pasta `C:\portal`, **sem apagar**: `config.env`, `portal.db`,
   `.secret_key`, `venv` e `backups`.
3. Dois cliques em `instalar.bat` e ligue o portal.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "PYTHON NAO ENCONTRADO" | Refaça o Passo 1 marcando "Add python.exe to PATH" |
| Abre no servidor, mas não em outro PC | Rode `liberar-porta.bat` como administrador; confira o IP com `ipconfig`; veja se é a mesma rede |
| Reiniciei o servidor e o portal não ligou | Passo 6 não foi feito, ou o Python foi instalado "só para mim" (refaça o Passo 1 para todos os usuários) |
| "Muitas tentativas" no login | Espere 1 minuto e tente de novo |
| Tela não carrega depois de editar `config.env` | Reinicie o portal (Passo 12); confira que não há aspas nem erro de digitação |
| Quero ver os erros | Pare a tarefa (Passo 12) e abra `windows\iniciar.bat`: a janela preta mostra as mensagens |

## Opcional: guardar os PDFs também no SharePoint

Fica para depois, quando a TI cadastrar o aplicativo no Microsoft 365. As instruções estão no `README.md` (seção
"Arquivo dos PDFs no SharePoint"). Os dados vão no mesmo `config.env`, nas linhas que começam com `SP_`.
