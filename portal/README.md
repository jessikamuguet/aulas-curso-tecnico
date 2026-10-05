# Portal de Movimentações | Endossos

Portal da helppi.me para clientes solicitarem endossos (inclusão, exclusão e substituição de veículos) e para o
administrador receber, executar e devolver cada solicitação.

## Como rodar (de verdade, com banco e login)

```bash
cd portal
pip install -r requirements.txt
python app.py          # abre em http://127.0.0.1:5000
```

Na primeira execução é criado o usuário **admin** com uma senha aleatória, mostrada **uma única vez** no terminal.
Para definir a senha: `ADMIN_PASSWORD="sua-senha" python app.py`. Os dados ficam em `portal.db` (SQLite, não vai para o Git).

Em produção use HTTPS e defina `HTTPS=1` (cookie seguro) e `SECRET_KEY`. Rode atrás de um servidor WSGI (ex.: gunicorn).

## Modo demonstração (sem instalar nada)

`portal-demo.html` é um arquivo único que simula o servidor dentro do navegador (dados só naquele navegador, senhas em
texto puro). Serve para conhecer o fluxo: **admin / admin123** e **cliente / cliente123**. Não use em produção.
Para regerar depois de mudar algo em `static/`: `python build_demo.py`.

**Hospedando no Windows?** Siga o [PASSO-A-PASSO-WINDOWS.md](PASSO-A-PASSO-WINDOWS.md) (instalador, início automático e backup prontos).

## Fluxo

1. **Admin** cria os usuários (menu *Usuários*): clientes e **até 5 administradores ativos**. Cada administrador tem login próprio;
   desativar um libera a vaga (o histórico é mantido). Cada devolução registra **quem a fez** (lista, detalhe e CSV, só para
   administradores; o cliente não vê).
2. **Cliente** entra, em *Nova solicitação* cadastra/importa os veículos (planilha no modelo FROTA), vê o cálculo, marca o
   termo de acordo e clica em *Prosseguir com endosso*. A solicitação é gravada com usuário e data/hora.
3. **Admin** vê tudo em *Solicitações* (quem pediu, quando, prazo de 48h úteis, atrasadas em destaque, filtro e CSV),
   abre a solicitação, ajusta valores, informa o nº do endosso, anexa o **PDF do endosso** (obrigatório) e o **PDF do
   boleto** (se houver) e **devolve** ao cliente. Os PDFs ficam no banco (até 10 MB cada) e só o admin e o dono da
   solicitação conseguem baixar.
4. Enquanto não devolvida, o cliente vê **"Solicitação em processo de emissão"**.
5. Devolvida, o cliente confere veículo a veículo, pode **comunicar divergência** (veículo que saiu/faltou) e dá a
   **ciência** ("recebi, visualizei e estou de acordo com o que foi calculado"). O admin vê a ciência e a divergência.

## Importação de planilhas de frota

Aceita `.xlsx`, `.xls` (Excel antigo, lido no servidor) e `.csv`; o formato é reconhecido pelo conteúdo do arquivo.

- **Aba:** qualquer nome. Vale a primeira aba que tiver as colunas MARCA, MODELO, PLACA e CHASSI e o ano. Abas de proposta,
  resumo etc. são ignoradas. A ordem das colunas não importa e colunas extras (Tipo, Guincho, Vidros...) são ignoradas.
- **Ano:** FAB/MOD, Ano fab./Ano mod. ou Ano fabricação/Ano modelo, sempre em colunas separadas. Se a planilha trouxer só uma
  das colunas, a importação avisa e oferece um botão para copiar o ano para o outro campo (decisão de quem importa).
- **Placa:** formato antigo ou Mercosul. Veículo **0 km sem placa** (célula vazia ou `AAA0000`) entra **só como inclusão**, como
  "SEM PLACA", identificado pelo chassi. Exclusão e substituição exigem a placa.
- Chassi com 17 caracteres; placas e chassis repetidos são recusados. Se houver erro, nada é importado e a lista mostra a linha.

## Planilha para o administrativo

Em *Solicitações* (**Exportar CSV**, todas as filtradas) e na página de cada solicitação (**Baixar planilha**) sai um CSV com
uma linha por veículo: Nº da solicitação, data, usuário, **placa, marca/modelo, chassi, ano de fabricação, ano do modelo**, tipo,
contrato, **valor pró rata (calculado)**, valor final (devolvido), acionamento, situação, prazo, nº do endosso, datas,
divergência e anexos. Separador `;`, valores com vírgula (abre direto no Excel em português). O ano de fabricação e o ano do
modelo são obrigatórios no cadastro e na importação.

## Regras

- **Senhas:** o administrador redefine a senha de qualquer usuário (cliente ou administrador) em *Usuários → Redefinir senha*.
  É uma senha **temporária**: a pessoa é obrigada a trocá-la ao entrar e qualquer acesso aberto dela é encerrado. Todo usuário pode
  trocar a própria senha em *Alterar senha* (no alto da tela); isso também encerra os outros acessos abertos dele.
- **Cálculo:** custo dia = valor inicial ÷ 365; saldo = valor inicial − custo dia × dias (dias = data do endosso − vigência).
  O servidor recalcula tudo; não confia nos valores enviados pelo navegador.
- **Parcelamento:** até **10x**, **parcela mínima de R$ 500,00**. O contrato dura 365 dias (12 meses) e o número de parcelas acompanha
  (pró rata) os meses que **restam** de vigência, no máximo 10; só é liberado até **10 meses de vigência decorridos** (depois
  disso, só à vista). Exemplos para R$ 8.000: contrato novo ou até ~2 meses = 10x; 5 meses decorridos = 7x; 10 meses = 2x; mais de
  10 meses = não parcela. Com R$ 2.200 o limite pelo valor é 4x. A conta usa o **maior tempo de vigência** entre os veículos (o mais
  restritivo) sobre o **valor líquido a pagar** (exclusões que devolvem valor não são parceladas). O cliente escolhe na solicitação;
  o servidor confere a regra; o administrador vê o pedido e a verificação com o **valor final** na devolução. Os centavos que
  sobram da divisão entram na 1ª parcela. Constantes em `app.py` (`PARCELA_MINIMA_CENTAVOS`, `MAX_PARCELAS`) e `static/prorata.js`.
- **Exclusão:** sempre negativa. Antes de restituir é preciso avaliar se a placa teve acionamento: o admin marca
  *Teve acionamento* e o valor vira R$ 0,00 (sem restituição). O valor mostrado ao cliente na solicitação é só estimativa.
- **Substituição:** não é calculada no portal. A placa passa por análise interna e o admin informa o valor ao devolver.
- **Prazo:** 48 horas úteis a partir da solicitação. Hora útil = segunda a sexta, das 08:00 às 17:00 (horário de Brasília),
  ou seja, 9h por dia: 48h úteis são 5 dias úteis e 3h. Pedido fora do expediente (noite, fim de semana) começa a contar no
  próximo dia útil às 08:00. **Feriados não são considerados.** Para mudar, ajuste `PRAZO_HORAS_UTEIS` e `EXPEDIENTE` em `app.py`
  (e o padrão `horas = 48` em `static/prorata.js`).

## Arquivo dos PDFs no SharePoint (opcional)

Os PDFs ficam sempre no banco do portal (o cliente baixa daqui). Se configurado, uma **cópia de arquivo** é enviada à
biblioteca **Comercial** do SharePoint, em `<ano>/ENDOSSOS/Solicitação 00012 - Nome do cliente/Endosso <nº>.pdf` (e `Boleto <nº>.pdf`).
Se o envio falhar, a devolução ao cliente **não** é bloqueada: o admin vê "não arquivado" com o motivo e o botão
*Tentar novamente*. O portal continua sendo a fonte dos prazos e do andamento; o SharePoint é só o arquivo.

Configuração (quem administra o Microsoft 365 / TI):

1. No **Microsoft Entra ID** → *Registros de aplicativo* → novo registro. Anote o *ID do locatário (tenant)* e o *ID do aplicativo (client)*.
2. *Certificados e segredos* → novo segredo do cliente (anote o valor, ele só aparece uma vez).
3. *Permissões de API* → Microsoft Graph → **Permissões de aplicativo** → `Sites.Selected` → conceder consentimento do administrador.
4. Conceder ao app permissão de **escrita apenas ao site** que contém a biblioteca (via Graph `POST /sites/{id}/permissions`
   com role `write`, ou pelo PowerShell `Grant-PnPAzureADAppSitePermission`). Assim o app não enxerga o resto da empresa.
5. No servidor do portal, defina as variáveis (nunca coloque o segredo no código nem no Git):

```
SP_TENANT_ID=...   SP_CLIENT_ID=...   SP_CLIENT_SECRET=...
SP_HOST=gruposvc.sharepoint.com   SP_LIBRARY=Comercial   SP_PASTA=ENDOSSOS
SP_SITE_PATH=       # vazio = site raiz; use /sites/NomeDoSite se a biblioteca estiver em um site
```

Tamanho: até 10 MB por PDF (arquivos acima de 4 MB são enviados em partes).

## Segurança (resumo)

Senhas com hash (werkzeug), sessão por cookie HttpOnly/SameSite, bloqueio de 1 min após 5 tentativas erradas, cliente só vê
as próprias solicitações, rotas de admin protegidas no servidor e todo texto exibido é escapado.
