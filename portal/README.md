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

## Fluxo

1. **Admin** cria os usuários dos clientes (menu *Usuários*).
2. **Cliente** entra, em *Nova solicitação* cadastra/importa os veículos (planilha no modelo FROTA), vê o cálculo, marca o
   termo de acordo e clica em *Prosseguir com endosso*. A solicitação é gravada com usuário e data/hora.
3. **Admin** vê tudo em *Solicitações* (quem pediu, quando, prazo de 48h úteis, atrasadas em destaque, filtro e CSV),
   abre a solicitação, ajusta valores, informa o nº do endosso, anexa o **PDF do endosso** (obrigatório) e o **PDF do
   boleto** (se houver) e **devolve** ao cliente. Os PDFs ficam no banco (até 10 MB cada) e só o admin e o dono da
   solicitação conseguem baixar.
4. Enquanto não devolvida, o cliente vê **"Solicitação em processo de emissão"**.
5. Devolvida, o cliente confere veículo a veículo, pode **comunicar divergência** (veículo que saiu/faltou) e dá a
   **ciência** ("recebi, visualizei e estou de acordo com o que foi calculado"). O admin vê a ciência e a divergência.

## Regras

- **Cálculo:** custo dia = valor inicial ÷ 365; saldo = valor inicial − custo dia × dias (dias = data do endosso − vigência).
  O servidor recalcula tudo; não confia nos valores enviados pelo navegador.
- **Exclusão:** sempre negativa. Antes de restituir é preciso avaliar se a placa teve acionamento: o admin marca
  *Teve acionamento* e o valor vira R$ 0,00 (sem restituição). O valor mostrado ao cliente na solicitação é só estimativa.
- **Substituição:** não é calculada no portal. A placa passa por análise interna e o admin informa o valor ao devolver.
- **Prazo:** 48 horas úteis a partir da solicitação. Hora útil = segunda a sexta, das 08:00 às 17:00 (horário de Brasília),
  ou seja, 9h por dia: 48h úteis são 5 dias úteis e 3h. Pedido fora do expediente (noite, fim de semana) começa a contar no
  próximo dia útil às 08:00. **Feriados não são considerados.** Para mudar, ajuste `PRAZO_HORAS_UTEIS` e `EXPEDIENTE` em `app.py`
  (e o padrão `horas = 48` em `static/prorata.js`).

## Segurança (resumo)

Senhas com hash (werkzeug), sessão por cookie HttpOnly/SameSite, bloqueio de 1 min após 5 tentativas erradas, cliente só vê
as próprias solicitações, rotas de admin protegidas no servidor e todo texto exibido é escapado.
