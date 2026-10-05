"""Portal de Movimentações | Endossos - backend (Flask + SQLite).

Rodar:  pip install -r requirements.txt && python app.py
Variáveis opcionais: ADMIN_PASSWORD, SECRET_KEY, PORT, HTTPS=1 (cookie seguro), TRUST_PROXY=1, PORTAL_DB
"""
import hashlib, json, logging, os, re, secrets, smtplib, sqlite3, threading, time
from email.message import EmailMessage
from urllib.parse import quote
import requests
from datetime import date, datetime, timedelta, timezone
from flask import Flask, Response, g, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))


def _carregar_config():
    """Lê o arquivo config.env (CHAVE=valor, uma por linha) ao lado do app. Variáveis já definidas no sistema têm prioridade."""
    caminho = os.path.join(BASE, "config.env")
    if os.path.exists(caminho):
        for linha in open(caminho, encoding="utf-8-sig"):
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                os.environ.setdefault(chave.strip(), valor.strip().strip('"'))


_carregar_config()
DB_PATH = os.environ.get("PORTAL_DB", os.path.join(BASE, "portal.db"))
SP = timezone(timedelta(hours=-3))  # horário de Brasília (sem horário de verão)
BASE_DIAS = 365
PRAZO_HORAS_UTEIS = 48  # prazo para devolver o endosso
EXPEDIENTE = (8, 17)  # horas úteis: das 08:00 às 17:00, seg a sex
TIPOS = ("INCLUSÃO", "EXCLUSÃO", "SUBSTITUIÇÃO")
MAX_PDF = 10 * 1024 * 1024  # 10 MB por anexo
ANEXOS = {"endosso": "Endosso", "boleto": "Boleto"}
MAX_ADMINS = 5  # no máximo 5 administradores ativos
# Parcelamento: até 10x, parcela mínima de R$ 500,00; o nº de parcelas acompanha (pró rata) o prazo que resta dos 365 dias de
# vigência (12 meses) e só é liberado até 10 meses de vigência decorridos.
PARCELA_MINIMA_CENTAVOS = 50000
MAX_PARCELAS = 10
SEM_PLACA = "SEM PLACA"  # veículo 0 km ainda sem placa (só inclusão); identificado pelo chassi
MAX_PLANILHA = 5 * 1024 * 1024  # importação de .xls

app = Flask(__name__, static_folder="static", static_url_path="")


def _secret():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = os.path.join(BASE, ".secret_key")
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
    return open(path).read().strip()


if os.environ.get("TRUST_PROXY") == "1":  # atrás de nginx/IIS: usa o IP e o https reais enviados pelo proxy
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

app.secret_key = _secret()
app.config.update(MAX_CONTENT_LENGTH=25 * 1024 * 1024, SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=os.environ.get("HTTPS") == "1")  # em produção (HTTPS), defina HTTPS=1

# ---------------------------------------------------------------- banco
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','cliente')), ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0, sessao INTEGER NOT NULL DEFAULT 0, email TEXT);
CREATE TABLE IF NOT EXISTS solicitacoes (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  criado_em TEXT NOT NULL, prazo_em TEXT NOT NULL, vigencia TEXT,
  status TEXT NOT NULL DEFAULT 'em_emissao', numero_endosso TEXT, observacao TEXT,
  devolvida_em TEXT, ciente_em TEXT, divergencia TEXT, devolvida_por INTEGER REFERENCES users(id),
  parcelas INTEGER NOT NULL DEFAULT 1, cancelada_em TEXT, cancelada_por INTEGER REFERENCES users(id), cancelamento_motivo TEXT);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), hash TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('convite','reset')), expira_em TEXT NOT NULL, usado_em TEXT, criado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
  marca_modelo TEXT, placa TEXT, chassi TEXT, contrato TEXT, tipo TEXT,
  placa_substituida TEXT, data_endosso TEXT, valor_inicial REAL, dias INTEGER,
  valor_calculado REAL, acionamento INTEGER DEFAULT 0, valor_final REAL, confirmado INTEGER DEFAULT 0,
  ano_fab INTEGER, ano_mod INTEGER);
CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('endosso','boleto')), nome TEXT, conteudo BLOB NOT NULL, criado_em TEXT NOT NULL,
  sp_url TEXT, sp_erro TEXT,
  UNIQUE (solicitacao_id, tipo));
"""


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def _close(_exc):
    c = g.pop("db", None)
    if c:
        c.close()


def init_db():
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    for col in ('ano_fab', 'ano_mod'):  # bancos criados antes dos anos do veículo
        if col not in {r[1] for r in con.execute('PRAGMA table_info(veiculos)')}:
            con.execute(f'ALTER TABLE veiculos ADD COLUMN {col} INTEGER')
    if 'email' not in {r[1] for r in con.execute('PRAGMA table_info(users)')}:  # bancos criados antes do login por e-mail
        con.execute('ALTER TABLE users ADD COLUMN email TEXT')
    con.execute('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email) WHERE email IS NOT NULL')
    adm_email = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()  # e-mail do admin original, para bancos criados antes do login por e-mail
    if adm_email and not con.execute("SELECT 1 FROM users WHERE email=?", (adm_email,)).fetchone():
        con.execute("UPDATE users SET email=? WHERE username='admin' AND email IS NULL", (adm_email,))
    for col in ('cancelada_em', 'cancelada_por', 'cancelamento_motivo'):  # bancos criados antes do cancelamento
        if col not in {r[1] for r in con.execute('PRAGMA table_info(solicitacoes)')}:
            con.execute(f'ALTER TABLE solicitacoes ADD COLUMN {col} ' + ('INTEGER' if col == 'cancelada_por' else 'TEXT'))
    for col, padrao in (('ativo', 1), ('trocar_senha', 0), ('sessao', 0)):  # bancos criados antes da gestão de usuários e senhas
        if col not in {r[1] for r in con.execute('PRAGMA table_info(users)')}:
            con.execute(f'ALTER TABLE users ADD COLUMN {col} INTEGER NOT NULL DEFAULT {padrao}')
    if 'parcelas' not in {r[1] for r in con.execute('PRAGMA table_info(solicitacoes)')}:  # bancos criados antes do parcelamento
        con.execute('ALTER TABLE solicitacoes ADD COLUMN parcelas INTEGER NOT NULL DEFAULT 1')
    if 'devolvida_por' not in {r[1] for r in con.execute('PRAGMA table_info(solicitacoes)')}:
        con.execute('ALTER TABLE solicitacoes ADD COLUMN devolvida_por INTEGER')
    for col in ('sp_url', 'sp_erro'):  # bancos criados antes da integração com SharePoint
        if col not in {r[1] for r in con.execute('PRAGMA table_info(anexos)')}:
            con.execute(f'ALTER TABLE anexos ADD COLUMN {col} TEXT')
    if not con.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        senha = os.environ.get("ADMIN_PASSWORD")
        gerada = not senha
        senha = senha or secrets.token_urlsafe(9)
        con.execute("INSERT INTO users(username,nome,password_hash,role,email) VALUES('admin','Administrador',?, 'admin',?)",
                    (generate_password_hash(senha), (os.environ.get('ADMIN_EMAIL') or '').strip().lower() or None))
        con.commit()
        if gerada:  # só mostra a senha quando ela foi gerada aqui; se veio da configuração, nunca é impressa
            print(f"\n>>> Usuário admin criado. Login: admin | Senha: {senha}\n"
                  ">>> Guarde esta senha (ela não será mostrada de novo).\n")
        else:
            print("Usuário admin criado com a senha definida em ADMIN_PASSWORD.")
    con.close()


# ---------------------------------------------------------------- SharePoint (arquivo dos PDFs)
# Desligado por padrão. Ligue definindo SP_TENANT_ID, SP_CLIENT_ID e SP_CLIENT_SECRET (app registrado no Microsoft Entra ID,
# permissão Graph "Sites.Selected" com acesso de escrita ao site). Os PDFs continuam no banco; o SharePoint recebe uma cópia.
SP_HOST = os.environ.get("SP_HOST", "gruposvc.sharepoint.com")
SP_SITE_PATH = os.environ.get("SP_SITE_PATH", "")  # "" = site raiz; ex.: "/sites/Comercial"
SP_LIBRARY = os.environ.get("SP_LIBRARY", "Comercial")
SP_PASTA = os.environ.get("SP_PASTA", "ENDOSSOS")  # destino: <ano>/<SP_PASTA>/Solicitação 00001 - Cliente/
GRAPH = os.environ.get("SP_GRAPH_URL", "https://graph.microsoft.com/v1.0")
LOGIN = os.environ.get("SP_LOGIN_URL", "https://login.microsoftonline.com")
_tok, _drive = {"v": None, "exp": 0}, {"id": None}


def sp_ativo():
    return all(os.environ.get(k) for k in ("SP_TENANT_ID", "SP_CLIENT_ID", "SP_CLIENT_SECRET"))


def _sp_token():
    if _tok["v"] and _tok["exp"] > time.time() + 60:
        return _tok["v"]
    r = requests.post(f"{LOGIN}/{os.environ['SP_TENANT_ID']}/oauth2/v2.0/token", timeout=20, data={
        "grant_type": "client_credentials", "client_id": os.environ["SP_CLIENT_ID"],
        "client_secret": os.environ["SP_CLIENT_SECRET"], "scope": "https://graph.microsoft.com/.default"})
    if not r.ok:
        raise RuntimeError(f"Login no Microsoft falhou ({r.status_code}).")
    j = r.json()
    _tok.update(v=j["access_token"], exp=time.time() + int(j.get("expires_in", 3600)))
    return _tok["v"]


def _graph(method, path, **kw):
    h = {"Authorization": "Bearer " + _sp_token(), **kw.pop("headers", {})}
    r = requests.request(method, GRAPH + path, headers=h, timeout=60, **kw)
    if not r.ok:
        raise RuntimeError(f"SharePoint {r.status_code}: {r.text[:200]}")
    return r


def _sp_drive():
    if _drive["id"]:
        return _drive["id"]
    site = _graph("GET", f"/sites/{SP_HOST}:{SP_SITE_PATH}" if SP_SITE_PATH else f"/sites/{SP_HOST}").json()["id"]
    drives = _graph("GET", f"/sites/{site}/drives").json().get("value", [])
    alvo = next((d for d in drives if d.get("name", "").lower() == SP_LIBRARY.lower()
                 or d.get("webUrl", "").rstrip("/").lower().endswith("/" + SP_LIBRARY.lower())), None)
    if not alvo:
        raise RuntimeError(f'Biblioteca "{SP_LIBRARY}" não encontrada (existem: {", ".join(d.get("name", "?") for d in drives)}).')
    _drive["id"] = alvo["id"]
    return alvo["id"]


def _sp_nome(s):
    return re.sub(r'[\\/:*?"<>|#%~&{}]+', "_", str(s)).strip(" .")[:100] or "_"


def sp_enviar(caminho, conteudo):
    """Envia um arquivo para a biblioteca (cria as pastas que faltarem) e devolve o link no SharePoint."""
    drive, p = _sp_drive(), quote(caminho)
    if len(conteudo) <= 4 * 1024 * 1024:
        r = _graph("PUT", f"/drives/{drive}/root:/{p}:/content?@microsoft.graph.conflictBehavior=replace",
                   data=conteudo, headers={"Content-Type": "application/pdf"})
        return r.json()["webUrl"]
    url = _graph("POST", f"/drives/{drive}/root:/{p}:/createUploadSession",
                 json={"item": {"@microsoft.graph.conflictBehavior": "replace"}}).json()["uploadUrl"]
    passo = 320 * 1024 * 10  # múltiplo de 320 KiB, exigência do Graph
    for ini in range(0, len(conteudo), passo):
        parte = conteudo[ini:ini + passo]
        r = requests.put(url, data=parte, timeout=120, headers={
            "Content-Range": f"bytes {ini}-{ini + len(parte) - 1}/{len(conteudo)}"})
        if r.status_code not in (200, 201, 202):
            raise RuntimeError(f"SharePoint {r.status_code}: {r.text[:200]}")
    return r.json()["webUrl"]


def arquivar_sharepoint(sid):
    """Copia os PDFs da solicitação para o SharePoint. Nunca levanta erro: registra o resultado por anexo."""
    s = db().execute("SELECT s.*, u.nome AS cliente FROM solicitacoes s JOIN users u ON u.id=s.user_id WHERE s.id=?", (sid,)).fetchone()
    pasta = f"{s['criado_em'][:4]}/{SP_PASTA}/Solicitação {sid:05d} - {_sp_nome(s['cliente'])}"
    for a in db().execute("SELECT * FROM anexos WHERE solicitacao_id=?", (sid,)).fetchall():
        arq = f"{ANEXOS[a['tipo']]} {_sp_nome(s['numero_endosso'] or sid)}.pdf"
        try:
            url, erro_ = sp_enviar(f"{pasta}/{arq}", a["conteudo"]), None
        except Exception as ex:  # rede, permissão, biblioteca inexistente...
            url, erro_ = None, str(ex)[:300]
        db().execute("UPDATE anexos SET sp_url=?, sp_erro=? WHERE id=?", (url, erro_, a["id"]))
    db().commit()


# ---------------------------------------------------------------- e-mail (convite de cadastro e redefinição de senha)
# Desligado por padrão. Ligue definindo SMTP_HOST e SMTP_FROM (e, se o servidor exigir, SMTP_USER / SMTP_PASSWORD).
# SMTP_PORT (587), SMTP_SEGURANCA = starttls (padrão) | ssl | nenhuma. PORTAL_URL = endereço público do portal, usado nos links.
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
VALIDADE_CONVITE_H, VALIDADE_RESET_H = 48, 1
log = logging.getLogger("portal")


def email_ativo():
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def _smtp_enviar(dest, assunto, corpo):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = os.environ["SMTP_FROM"], dest, assunto
    msg.set_content(corpo)
    host, porta = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587"))
    modo = os.environ.get("SMTP_SEGURANCA", "starttls").lower()
    srv = smtplib.SMTP_SSL(host, porta, timeout=20) if modo == "ssl" else smtplib.SMTP(host, porta, timeout=20)
    try:
        if modo == "starttls":
            srv.starttls()
        if os.environ.get("SMTP_USER"):
            srv.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
        srv.send_message(msg)
    finally:
        try:
            srv.quit()
        except Exception:
            pass


def enviar_email(dest, assunto, corpo):
    """Envia em segundo plano (a resposta ao usuário não depende do e-mail, nem revela se o endereço existe)."""
    def tarefa():
        try:
            _smtp_enviar(dest, assunto, corpo)
        except Exception as ex:  # rede, senha do SMTP, destinatário recusado...
            log.error("Falha ao enviar e-mail para %s: %s", dest, ex)
    t = threading.Thread(target=tarefa, daemon=True)
    t.start()
    return t


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def criar_token(uid, tipo):
    """Cria um link de uso único (só o hash fica no banco). Tokens antigos não usados do mesmo usuário são invalidados."""
    token = secrets.token_urlsafe(32)
    horas = VALIDADE_CONVITE_H if tipo == "convite" else VALIDADE_RESET_H
    db().execute("UPDATE tokens SET usado_em=? WHERE user_id=? AND usado_em IS NULL", (iso(agora()), uid))
    db().execute("INSERT INTO tokens(user_id,hash,tipo,expira_em,criado_em) VALUES(?,?,?,?,?)",
                 (uid, _hash_token(token), tipo, iso(agora() + timedelta(hours=horas)), iso(agora())))
    db().commit()
    return token


def link_senha(token):
    base = os.environ.get("PORTAL_URL", "").rstrip("/") or request.host_url.rstrip("/")
    return f"{base}/#/definir-senha/{token}"


def enviar_link(u, tipo):
    """Cria o link e tenta enviar por e-mail. Devolve (enviado, link). Sem SMTP, devolve o link para o administrador repassar."""
    token = criar_token(u["id"], tipo)
    link = link_senha(token)
    if not email_ativo() or not u["email"]:
        return False, link
    if tipo == "convite":
        assunto = "Seu acesso ao Portal de Movimentações | Endossos"
        corpo = (f"Olá, {u['nome']}.\n\nSeu acesso ao Portal de Movimentações | Endossos foi criado.\n"
                 f"Para definir a sua senha, abra o link abaixo (vale por {VALIDADE_CONVITE_H} horas e só pode ser usado uma vez):\n\n{link}\n\n"
                 f"Depois, entre com este e-mail ({u['email']}) ou com o usuário \"{u['username']}\".\n")
    else:
        assunto = "Redefinição de senha - Portal de Movimentações | Endossos"
        corpo = (f"Olá, {u['nome']}.\n\nRecebemos um pedido para redefinir a sua senha. Abra o link abaixo para escolher uma nova "
                 f"(vale por {VALIDADE_RESET_H} hora e só pode ser usado uma vez):\n\n{link}\n\n"
                 "Se você não pediu isso, ignore este e-mail: a sua senha continua a mesma.\n")
    enviar_email(u["email"], assunto, corpo)
    return True, None


# ---------------------------------------------------------------- regras
def agora():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def prazo_horas_uteis(inicio, horas=PRAZO_HORAS_UTEIS):
    """Prazo = início + N horas úteis. Hora útil: seg a sex, das 08:00 às 17:00 (horário de Brasília).
    Pedido fora do expediente começa a contar no próximo dia útil às 08:00. Feriados não são considerados."""
    def util(d):
        return d.weekday() < 5

    def abre(d):
        return d.replace(hour=EXPEDIENTE[0], minute=0, second=0, microsecond=0)

    def fecha(d):
        return d.replace(hour=EXPEDIENTE[1], minute=0, second=0, microsecond=0)

    def proximo_dia_util(d):
        d = abre(d) + timedelta(days=1)
        while not util(d):
            d += timedelta(days=1)
        return d

    d = inicio.astimezone(SP)
    if not util(d) or d >= fecha(d):
        d = proximo_dia_util(d)
    elif d < abre(d):
        d = abre(d)
    resto = timedelta(hours=horas)
    while True:
        disponivel = fecha(d) - d
        if resto <= disponivel:
            return d + resto
        resto -= disponivel
        d = proximo_dia_util(d)


def parcelamento(total, dias):
    """Opções de parcelamento para `total` (R$) com `dias` de vigência já decorridos.
    Devolve dict(max, motivo, opcoes=[(n, parcela, primeira_parcela)]); `max` < 2 significa que só há pagamento à vista."""
    centavos = round(total * 100)
    if centavos <= 0:
        return dict(max=1, motivo="Não há valor a pagar para parcelar.", opcoes=[])
    por_prazo = min(MAX_PARCELAS, (BASE_DIAS - dias) * 12 // BASE_DIAS)  # meses que restam da vigência
    por_valor = centavos // PARCELA_MINIMA_CENTAVOS
    n = min(por_prazo, por_valor)
    if por_prazo < 2:
        motivo = "O parcelamento só é liberado até 10 meses de vigência do contrato."
    elif por_valor < 2:
        motivo = "A parcela mínima é de R$ 500,00: o valor não permite parcelar."
    else:
        motivo = None
    opcoes = []
    for k in range(2, n + 1):
        base = centavos // k
        opcoes.append((k, base / 100, (base + centavos - base * k) / 100))  # os centavos que sobram entram na 1ª parcela
    return dict(max=max(n, 1), motivo=motivo, opcoes=opcoes)


def calcular(tipo, vigencia, data_endosso, valor_inicial):
    """Mesma regra do front: custo dia = valor/365; saldo = valor - custo*dias.
    Exclusão sempre negativa. Substituição não é calculada no portal."""
    dias = (data_endosso - vigencia).days
    if dias < 0:
        raise ValueError("A data do endosso é anterior à vigência inicial.")
    if dias > BASE_DIAS:
        raise ValueError("A data do endosso passa de 365 dias da vigência.")
    saldo = valor_inicial - (valor_inicial / BASE_DIAS) * dias
    valor = -abs(saldo) if tipo == "EXCLUSÃO" else saldo
    return dias, round(valor, 2)


def erro(msg, code=400):
    return jsonify(erro=msg), code


def usuario():
    uid = session.get("uid")
    if not uid:
        return None
    u = db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if u and (not u["ativo"] or session.get("sv", 0) != u["sessao"]):
        session.clear()  # desativado, ou senha trocada/redefinida: a sessão aberta perde o acesso na hora
        return None
    return u


def admins_ativos():
    return db().execute("SELECT count(*) FROM users WHERE role='admin' AND ativo=1").fetchone()[0]


def exige_login(admin=False):
    u = usuario()
    if not u:
        return None, erro("Faça login para continuar.", 401)
    if u["trocar_senha"] and request.endpoint not in ("me", "logout", "minha_senha"):
        return None, (jsonify(erro="Defina uma nova senha para continuar.", trocar_senha=True), 403)
    if admin and u["role"] != "admin":
        return None, erro("Acesso restrito ao administrador.", 403)
    return u, None


def serializa(s):
    veics = db().execute("SELECT * FROM veiculos WHERE solicitacao_id=? ORDER BY id", (s["id"],)).fetchall()
    u = db().execute("SELECT id,nome,username FROM users WHERE id=?", (s["user_id"],)).fetchone()
    vs = [dict(v, acionamento=bool(v["acionamento"]), confirmado=bool(v["confirmado"])) for v in veics]
    soma = lambda k: round(sum(v[k] or 0 for v in vs), 2)
    anexos = [dict(r) for r in db().execute(
        "SELECT tipo, nome, length(conteudo) AS tamanho, sp_url, sp_erro FROM anexos WHERE solicitacao_id=? ORDER BY tipo = 'boleto'", (s["id"],))]
    quem = usuario()
    if not (quem and quem["role"] == "admin"):  # cliente não vê dados internos do SharePoint
        for x in anexos:
            x.pop("sp_url"), x.pop("sp_erro")
    r = dict(s, usuario=dict(u), veiculos=vs, anexos=anexos, total_calculado=soma("valor_calculado"), total_final=soma("valor_final"))
    canc = db().execute("SELECT u.nome, u.role FROM users u WHERE u.id=?", (s["cancelada_por"],)).fetchone() if s["cancelada_por"] else None
    r["cancelada_por_perfil"] = canc["role"] if canc else None  # o cliente só sabe se foi ele ou o atendimento
    if quem and quem["role"] == "admin":
        r["cancelada_por"] = {"nome": canc["nome"]} if canc else None
        resp = db().execute("SELECT id,nome,username FROM users WHERE id=?", (s["devolvida_por"],)).fetchone() if s["devolvida_por"] else None
        r["devolvida_por"] = dict(resp) if resp else None
    else:
        r.pop("devolvida_por", None)  # o cliente não vê qual administrador atendeu
        r.pop("cancelada_por", None)
    return r


# ---------------------------------------------------------------- auth
_falhas = {}  # (ip, usuario) -> (tentativas, bloqueado_até)


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    nome, senha = str(d.get("username", "")).strip().lower(), str(d.get("password", ""))
    chave = (request.remote_addr, nome)
    tent, ate = _falhas.get(chave, (0, 0))
    if ate > time.time():
        return erro("Muitas tentativas. Aguarde um minuto e tente de novo.", 429)
    u = db().execute("SELECT * FROM users WHERE username=? OR email=?", (nome, nome)).fetchone()
    if not u or not u["ativo"] or not check_password_hash(u["password_hash"], senha):
        tent += 1
        _falhas[chave] = (tent, time.time() + 60 if tent >= 5 else 0)
        return erro("Usuário ou senha inválidos.", 401)
    _falhas.pop(chave, None)
    session.clear()
    session["uid"] = u["id"]
    session["sv"] = u["sessao"]
    return jsonify(user=dict(id=u["id"], nome=u["nome"], username=u["username"], role=u["role"],
                             sharepoint=sp_ativo() and u["role"] == "admin",
                             trocar_senha=bool(u["trocar_senha"]), email=u["email"]))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    u, e = exige_login()
    if e:
        return e
    return jsonify(user=dict(id=u["id"], nome=u["nome"], username=u["username"], role=u["role"],
                             sharepoint=sp_ativo() and u["role"] == "admin",
                             trocar_senha=bool(u["trocar_senha"]), email=u["email"]))


def _bloqueado(chave):
    return _falhas.get(chave, (0, 0))[1] > time.time()


def _falhou(chave):
    tent = _falhas.get(chave, (0, 0))[0] + 1
    _falhas[chave] = (tent, time.time() + 60 if tent >= 5 else 0)


@app.post("/api/minha-senha")
def minha_senha():
    """Troca da própria senha (também usada para trocar a senha temporária no primeiro acesso)."""
    u, e = exige_login()
    if e:
        return e
    d = request.get_json(silent=True) or {}
    atual, nova = str(d.get("atual", "")), str(d.get("nova", ""))
    chave = (request.remote_addr, "senha:" + u["username"])
    if _bloqueado(chave):
        return erro("Muitas tentativas. Aguarde um minuto e tente de novo.", 429)
    if not check_password_hash(u["password_hash"], atual):
        _falhou(chave)
        return erro("A senha atual está incorreta.")
    if len(nova) < 8:
        return erro("A nova senha precisa ter pelo menos 8 caracteres.")
    if nova == atual:
        return erro("A nova senha precisa ser diferente da atual.")
    _falhas.pop(chave, None)
    db().execute("UPDATE users SET password_hash=?, trocar_senha=0, sessao=sessao+1 WHERE id=?",
                 (generate_password_hash(nova), u["id"]))
    db().commit()
    session["sv"] = u["sessao"] + 1  # mantém ESTA sessão; as outras caem
    return jsonify(ok=True)


# ---------------------------------------------------------------- usuários (admin)
@app.get("/api/usuarios")
def usuarios():
    _, e = exige_login(admin=True)
    if e:
        return e
    rows = db().execute("SELECT id,username,nome,role,ativo,email FROM users ORDER BY role, nome").fetchall()
    return jsonify(usuarios=[dict(r, ativo=bool(r["ativo"])) for r in rows], limite_admins=MAX_ADMINS, admins_ativos=admins_ativos())


def _usuario_livre(base):
    """Nome de usuário derivado do e-mail (parte antes do @), único."""
    base = re.sub(r"[^a-z0-9._-]", "", base.lower())[:24] or "usuario"
    base = base if len(base) >= 3 else base + "usr"
    cand, n = base, 1
    while db().execute("SELECT 1 FROM users WHERE username=?", (cand,)).fetchone():
        n += 1
        cand = f"{base}{n}"
    return cand


def _email_valido(txt):
    txt = str(txt or "").strip().lower()
    return txt if EMAIL_RE.match(txt) else None


@app.post("/api/usuarios")
def criar_usuario():
    """Cadastro. Sem senha informada, a pessoa recebe um convite por e-mail para definir a própria senha."""
    _, e = exige_login(admin=True)
    if e:
        return e
    d = request.get_json(silent=True) or {}
    nome, senha = str(d.get("nome", "")).strip(), str(d.get("password", ""))
    email = _email_valido(d.get("email"))
    if not nome:
        return erro("Informe o nome.")
    if not email:
        return erro("Informe um e-mail válido.")
    user = str(d.get("username", "")).strip().lower() or _usuario_livre(email.split("@")[0])
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", user):
        return erro("O usuário deve ter de 3 a 30 caracteres (letras, números, ponto, hífen).")
    if senha and len(senha) < 8:
        return erro("A senha precisa ter pelo menos 8 caracteres.")
    perfil = d.get("role", "cliente")
    if perfil not in ("cliente", "admin"):
        return erro("Perfil inválido.")
    if perfil == "admin" and admins_ativos() >= MAX_ADMINS:
        return erro(f"Limite de {MAX_ADMINS} administradores atingido. Desative um administrador para cadastrar outro.", 409)
    if db().execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return erro("Já existe um usuário com esse e-mail.", 409)
    try:
        cur = db().execute("INSERT INTO users(username,nome,password_hash,role,email) VALUES(?,?,?,?,?)",
                           (user, nome, generate_password_hash(senha or secrets.token_urlsafe(32)), perfil, email))
        db().commit()
    except sqlite3.IntegrityError:
        return erro("Esse usuário já existe.", 409)
    resp = dict(ok=True, username=user)
    if not senha:  # convite: a pessoa define a própria senha pelo link
        novo_u = db().execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
        enviado, link = enviar_link(novo_u, "convite")
        resp.update(convite="enviado" if enviado else "link", link=link)
    elif email_ativo():  # senha definida pelo administrador: avisa do cadastro (sem a senha, que é passada à parte)
        base = os.environ.get("PORTAL_URL", "").rstrip("/") or request.host_url.rstrip("/")
        enviar_email(email, "Seu cadastro no Portal de Movimentações | Endossos",
                     f"Olá, {nome}.\n\nSeu cadastro no Portal de Movimentações | Endossos foi criado.\n\nEndereço: {base}\n"
                     f"Entre com este e-mail ({email}) ou com o usuário \"{user}\". A senha será informada pelo administrador.\n")
        resp.update(convite="aviso")
    return jsonify(resp), 201


@app.post("/api/usuarios/<int:uid>/enviar-link")
def enviar_link_usuario(uid):
    """Reenvia por e-mail o link para a pessoa definir uma nova senha (convite ou redefinição)."""
    _, e = exige_login(admin=True)
    if e:
        return e
    alvo = db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not alvo:
        return erro("Usuário não encontrado.", 404)
    if not alvo["ativo"]:
        return erro("Reative o usuário antes de enviar o link.", 409)
    enviado, link = enviar_link(alvo, "convite")
    return jsonify(ok=True, convite="enviado" if enviado else "link", link=link)


@app.post("/api/usuarios/<int:uid>/email")
def alterar_email(uid):
    _, e = exige_login(admin=True)
    if e:
        return e
    email = _email_valido((request.get_json(silent=True) or {}).get("email"))
    if not email:
        return erro("Informe um e-mail válido.")
    if not db().execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
        return erro("Usuário não encontrado.", 404)
    if db().execute("SELECT 1 FROM users WHERE email=? AND id<>?", (email, uid)).fetchone():
        return erro("Já existe um usuário com esse e-mail.", 409)
    db().execute("UPDATE users SET email=? WHERE id=?", (email, uid))
    db().commit()
    return jsonify(ok=True)


# ---- "Esqueci minha senha" e definição de senha pelo link (sem login)
@app.post("/api/esqueci-senha")
def esqueci_senha():
    chave = (request.remote_addr, "esqueci")
    if _bloqueado(chave):
        return erro("Muitos pedidos. Aguarde alguns minutos e tente de novo.", 429)
    _falhou(chave)  # limita pedidos por IP (5 por vez)
    if not email_ativo():
        return erro("O envio de e-mails não está configurado neste portal. Peça a um administrador para redefinir a sua senha.", 503)
    email = _email_valido((request.get_json(silent=True) or {}).get("email"))
    if email:
        u = db().execute("SELECT * FROM users WHERE email=? AND ativo=1", (email,)).fetchone()
        if u:
            enviar_link(u, "reset")
    # resposta igual exista ou não o e-mail: não revela quem tem cadastro
    return jsonify(ok=True, mensagem="Se esse e-mail estiver cadastrado, você receberá um link para definir uma nova senha em alguns minutos.")


def _token_valido(token):
    row = db().execute("SELECT * FROM tokens WHERE hash=?", (_hash_token(str(token)),)).fetchone()
    if not row or row["usado_em"] or row["expira_em"] < iso(agora()):
        return None
    u = db().execute("SELECT * FROM users WHERE id=?", (row["user_id"],)).fetchone()
    return (row, u) if u and u["ativo"] else None


@app.get("/api/definir-senha/<token>")
def conferir_link(token):
    r = _token_valido(token)
    if not r:
        return erro("Este link é inválido ou expirou. Peça um novo.", 404)
    return jsonify(nome=r[1]["nome"], tipo=r[0]["tipo"])


@app.post("/api/definir-senha")
def definir_senha():
    chave = (request.remote_addr, "definir")
    if _bloqueado(chave):
        return erro("Muitas tentativas. Aguarde um minuto e tente de novo.", 429)
    d = request.get_json(silent=True) or {}
    r = _token_valido(d.get("token", ""))
    if not r:
        _falhou(chave)
        return erro("Este link é inválido ou expirou. Peça um novo.", 400)
    senha = str(d.get("senha", ""))
    if len(senha) < 8:
        return erro("A senha precisa ter pelo menos 8 caracteres.")
    row, u = r
    db().execute("UPDATE users SET password_hash=?, trocar_senha=0, sessao=sessao+1 WHERE id=?", (generate_password_hash(senha), u["id"]))
    db().execute("UPDATE tokens SET usado_em=? WHERE id=?", (iso(agora()), row["id"]))
    db().commit()
    return jsonify(ok=True, usuario=u["username"], email=u["email"])


@app.post("/api/usuarios/<int:uid>/senha")
def redefinir_senha_usuario(uid):
    """Administrador define uma senha TEMPORÁRIA para um usuário (cliente ou administrador); a pessoa precisa trocá-la ao entrar."""
    eu, e = exige_login(admin=True)
    if e:
        return e
    if uid == eu["id"]:
        return erro("Para trocar a sua própria senha, use \"Alterar senha\".", 409)
    senha = str((request.get_json(silent=True) or {}).get("password", ""))
    if len(senha) < 8:
        return erro("A senha temporária precisa ter pelo menos 8 caracteres.")
    alvo = db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not alvo:
        return erro("Usuário não encontrado.", 404)
    db().execute("UPDATE users SET password_hash=?, trocar_senha=1, sessao=sessao+1 WHERE id=?", (generate_password_hash(senha), uid))
    db().commit()
    for k in [k for k in _falhas if k[1] in (alvo["username"], "senha:" + alvo["username"])]:
        del _falhas[k]  # tira o bloqueio por tentativas, se houver
    return jsonify(ok=True)


@app.post("/api/usuarios/<int:uid>/ativo")
def alterar_ativo(uid):
    eu, e = exige_login(admin=True)
    if e:
        return e
    ativo = (request.get_json(silent=True) or {}).get("ativo")
    if not isinstance(ativo, bool):
        return erro("Informe ativo: true ou false.")
    alvo = db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not alvo:
        return erro("Usuário não encontrado.", 404)
    if alvo["id"] == eu["id"]:
        return erro("Você não pode desativar o seu próprio usuário.", 409)
    if ativo and alvo["role"] == "admin" and not alvo["ativo"] and admins_ativos() >= MAX_ADMINS:
        return erro(f"Limite de {MAX_ADMINS} administradores atingido. Desative um administrador antes.", 409)
    db().execute("UPDATE users SET ativo=? WHERE id=?", (int(ativo), uid))
    db().commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------- solicitações
@app.get("/api/solicitacoes")
def listar():
    u, e = exige_login()
    if e:
        return e
    if u["role"] == "admin":
        rows = db().execute("SELECT * FROM solicitacoes ORDER BY id DESC").fetchall()
    else:
        rows = db().execute("SELECT * FROM solicitacoes WHERE user_id=? ORDER BY id DESC", (u["id"],)).fetchall()
    return jsonify(solicitacoes=[serializa(r) for r in rows])


@app.get("/api/solicitacoes/<int:sid>")
def detalhe(sid):
    u, e = exige_login()
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    if not s or (u["role"] != "admin" and s["user_id"] != u["id"]):
        return erro("Solicitação não encontrada.", 404)
    return jsonify(solicitacao=serializa(s))


def _data(txt, campo):
    try:
        return date.fromisoformat(str(txt))
    except ValueError:
        raise ValueError(f"{campo} inválida.")


@app.post("/api/solicitacoes")
def criar_solicitacao():
    u, e = exige_login()
    if e:
        return e
    if u["role"] == "admin":
        return erro("Use uma conta de cliente para abrir solicitações.", 403)
    d = request.get_json(silent=True) or {}
    veics = d.get("veiculos")
    if not isinstance(veics, list) or not veics or len(veics) > 500:
        return erro("Informe de 1 a 500 veículos.")
    placas, chassis, linhas = set(), set(), []
    try:
        vig = _data(d.get("vigencia"), "Vigência inicial") if any(v.get("tipo") != "SUBSTITUIÇÃO" for v in veics) else None
        for i, v in enumerate(veics, 1):
            tipo = v.get("tipo")
            if tipo not in TIPOS:
                raise ValueError(f"Veículo {i}: tipo de endosso inválido.")
            placa = re.sub(r"[- ]", "", str(v.get("placa", "")).upper())
            chassi = str(v.get("chassi", "")).strip().upper()
            mm = str(v.get("marca_modelo", "")).strip()
            if placa == "" or re.fullmatch(r"[A-Z]{3}0000", placa):  # 0 km ainda sem placa: só em inclusão
                if tipo != "INCLUSÃO":
                    raise ValueError(f"Veículo {i}: a placa é obrigatória na {tipo.lower()}.")
                placa = SEM_PLACA
            elif not re.fullmatch(r"[A-Z]{3}\d[A-Z0-9]\d{2}", placa):
                raise ValueError(f"Veículo {i}: placa inválida.")
            if not re.fullmatch(r"[A-Z0-9]{17}", chassi):
                raise ValueError(f"Veículo {i}: chassi deve ter 17 caracteres.")
            if not mm:
                raise ValueError(f"Veículo {i}: informe marca/modelo.")
            if placa != SEM_PLACA and placa in placas:
                raise ValueError(f"Placa repetida na solicitação: {placa}.")
            if chassi in chassis:
                raise ValueError(f"Chassi repetido na solicitação: {chassi}.")
            placas.add(placa)
            chassis.add(chassi)
            try:
                af, am = int(v.get("ano_fab")), int(v.get("ano_mod"))
            except (TypeError, ValueError):
                raise ValueError(f"Veículo {i}: informe o ano de fabricação e o ano do modelo.")
            if not (1950 <= af <= 2100 and 1950 <= am <= 2100):
                raise ValueError(f"Veículo {i}: ano de fabricação/modelo inválido.")
            ps = re.sub(r"[- ]", "", str(v.get("placa_substituida", "")).upper())
            if tipo == "SUBSTITUIÇÃO" and not ps:
                raise ValueError(f"Veículo {i}: informe a placa do veículo substituído.")
            dias = valor_calc = data_e = vi = None
            de = _data(v.get("data_endosso"), f"Veículo {i}: data de vigência")  # obrigatória nos 3 tipos
            data_e = de.isoformat()
            if tipo != "SUBSTITUIÇÃO":
                vi = float(v.get("valor_inicial"))
                if vi < 0:
                    raise ValueError(f"Veículo {i}: valor inicial inválido.")
                dias, valor_calc = calcular(tipo, vig, de, vi)
            linhas.append((mm[:120], placa, chassi, str(v.get("contrato", "")).strip()[:60], tipo,
                           ps or None, data_e, vi, dias, valor_calc, af, am))
    except (ValueError, TypeError) as ex:
        return erro(str(ex) if isinstance(ex, ValueError) and str(ex) else "Dados inválidos na solicitação.")
    try:
        parcelas = int(d.get("parcelas", 1) or 1)
    except (TypeError, ValueError):
        return erro("Número de parcelas inválido.")
    if parcelas != 1:
        calculados = [l for l in linhas if l[9] is not None]
        opc = parcelamento(sum(l[9] for l in calculados), max((l[8] for l in calculados), default=0))
        if parcelas not in [o[0] for o in opc["opcoes"]]:
            return erro(f"Parcelamento em {parcelas}x não é permitido." + (f" {opc['motivo']}" if opc["motivo"] else f" O máximo é {opc['max']}x."))
    agora_ = agora()
    cur = db().execute("INSERT INTO solicitacoes(user_id,criado_em,prazo_em,vigencia,parcelas) VALUES(?,?,?,?,?)",
                       (u["id"], iso(agora_), iso(prazo_horas_uteis(agora_)), vig.isoformat() if vig else None, parcelas))
    sid = cur.lastrowid
    db().executemany("""INSERT INTO veiculos(solicitacao_id,marca_modelo,placa,chassi,contrato,tipo,
                        placa_substituida,data_endosso,valor_inicial,dias,valor_calculado,ano_fab,ano_mod) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     [(sid, *l) for l in linhas])
    db().commit()
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    return jsonify(solicitacao=serializa(s)), 201


@app.post("/api/solicitacoes/<int:sid>/devolver")
def devolver(sid):
    eu, e = exige_login(admin=True)
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    if not s:
        return erro("Solicitação não encontrada.", 404)
    if s["status"] != "em_emissao":
        return erro("Esta solicitação já foi devolvida.", 409)
    if request.files or request.form:  # multipart: campo "dados" (JSON) + arquivos "endosso" e "boleto"
        try:
            d = json.loads(request.form.get("dados", "{}"))
        except ValueError:
            return erro("Dados inválidos.")
    else:
        d = request.get_json(silent=True) or {}
    numero = str(d.get("numero_endosso", "")).strip()
    if not numero:
        return erro("Informe o número do endosso.")
    anexos = {}
    for tipo, rotulo in ANEXOS.items():
        f = request.files.get(tipo)
        if not f or not f.filename:
            if tipo == "endosso":
                return erro("Anexe o PDF do endosso.")
            continue  # boleto é opcional
        conteudo = f.read(MAX_PDF + 1)
        if len(conteudo) > MAX_PDF:
            return erro(f"O PDF do {rotulo.lower()} passa de 10 MB.")
        if not conteudo.startswith(b"%PDF-"):
            return erro(f"O arquivo do {rotulo.lower()} não é um PDF válido.")
        nome = re.sub(r"[^\w .()\-]", "_", os.path.basename(f.filename))[:120]
        anexos[tipo] = (nome, conteudo)
    por_id = {int(x.get("id")): x for x in d.get("veiculos", []) if str(x.get("id", "")).isdigit()}
    updates = []
    for v in db().execute("SELECT * FROM veiculos WHERE solicitacao_id=?", (sid,)).fetchall():
        x = por_id.get(v["id"])
        if x is None:
            return erro(f"Falta o valor final do veículo {v['placa']}.")
        acion = bool(x.get("acionamento")) and v["tipo"] == "EXCLUSÃO"
        try:
            vf = 0.0 if acion else float(x.get("valor_final"))
        except (TypeError, ValueError):
            return erro(f"Valor final inválido para {v['placa']}.")
        if v["tipo"] == "EXCLUSÃO":
            vf = -abs(vf)  # exclusão nunca é positiva
        updates.append((int(acion), round(vf, 2) + 0.0, v["id"]))
    db().executemany("UPDATE veiculos SET acionamento=?, valor_final=? WHERE id=?", updates)
    db().executemany("INSERT INTO anexos(solicitacao_id,tipo,nome,conteudo,criado_em) VALUES(?,?,?,?,?)",
                     [(sid, t, n, c, iso(agora())) for t, (n, c) in anexos.items()])
    db().execute("UPDATE solicitacoes SET status='devolvida', numero_endosso=?, observacao=?, devolvida_em=?, devolvida_por=? WHERE id=?",
                 (numero[:60], str(d.get("observacao", "")).strip()[:2000], iso(agora()), eu["id"], sid))
    db().commit()
    if sp_ativo():
        arquivar_sharepoint(sid)  # falha aqui não bloqueia a devolução: o admin vê o erro e pode tentar de novo
    return jsonify(solicitacao=serializa(db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()))


@app.post("/api/importar-xls")
def importar_xls():
    """Lê uma planilha .xls (Excel antigo) e devolve o conteúdo de todas as abas; a validação é feita na tela."""
    _, e = exige_login()
    if e:
        return e
    f = request.files.get("arquivo")
    if not f:
        return erro("Envie o arquivo da planilha.")
    dados = f.read(MAX_PLANILHA + 1)
    if len(dados) > MAX_PLANILHA:
        return erro("A planilha passa de 5 MB.")
    try:
        import xlrd
        livro = xlrd.open_workbook(file_contents=dados)
    except Exception:  # arquivo corrompido, protegido por senha ou não é .xls
        return erro("Não foi possível ler o arquivo .xls. Salve a planilha como .xlsx e tente de novo.")

    def celula(v):
        if v == "" or v is None:
            return None
        return str(int(v)) if isinstance(v, float) and v == int(v) else str(v)

    abas = []
    for aba in livro.sheets():
        if aba.nrows > 5000 or aba.ncols > 200:
            continue
        abas.append({"nome": aba.name, "linhas": [[celula(v) for v in aba.row_values(i)] for i in range(aba.nrows)]})
    return jsonify(abas=abas)


@app.get("/api/solicitacoes/<int:sid>/anexos/<tipo>")
def baixar_anexo(sid, tipo):
    u, e = exige_login()
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    a = db().execute("SELECT * FROM anexos WHERE solicitacao_id=? AND tipo=?", (sid, tipo)).fetchone()
    if not s or not a or (u["role"] != "admin" and s["user_id"] != u["id"]):
        return erro("Anexo não encontrado.", 404)
    r = Response(a["conteudo"], mimetype="application/pdf")
    r.headers["Content-Disposition"] = f'inline; filename="{tipo}-{sid}.pdf"'  # nome fixo: não usa o nome enviado
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["Cache-Control"] = "private, no-store"
    return r


@app.post("/api/solicitacoes/<int:sid>/cancelar")
def cancelar(sid):
    """Cancela uma solicitação ainda não devolvida. O cliente cancela as próprias; o administrador, qualquer uma. Exige justificativa."""
    u, e = exige_login()
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    if not s or (u["role"] != "admin" and s["user_id"] != u["id"]):
        return erro("Solicitação não encontrada.", 404)
    if s["status"] == "cancelada":
        return erro("Esta solicitação já foi cancelada.", 409)
    if s["status"] != "em_emissao":
        return erro("Só é possível cancelar solicitações que ainda não foram devolvidas.", 409)
    motivo = str((request.get_json(silent=True) or {}).get("motivo", "")).strip()
    if len(motivo) < 10:
        return erro("Descreva a justificativa do cancelamento (mínimo de 10 caracteres).")
    db().execute("UPDATE solicitacoes SET status='cancelada', cancelada_em=?, cancelada_por=?, cancelamento_motivo=? WHERE id=?",
                 (iso(agora()), u["id"], motivo[:2000], sid))
    db().commit()
    return jsonify(solicitacao=serializa(db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()))


@app.post("/api/solicitacoes/<int:sid>/arquivar")
def reenviar_sharepoint(sid):
    _, e = exige_login(admin=True)
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    if not s:
        return erro("Solicitação não encontrada.", 404)
    if not sp_ativo():
        return erro("A integração com o SharePoint não está configurada.")
    if s["status"] in ("em_emissao", "cancelada"):
        return erro("Só é possível arquivar solicitações já devolvidas.", 409)
    arquivar_sharepoint(sid)
    return jsonify(solicitacao=serializa(s))


@app.errorhandler(413)
def grande(_e):
    return erro("Arquivos grandes demais (máximo 10 MB por PDF).", 413)


@app.post("/api/solicitacoes/<int:sid>/ciente")
def ciente(sid):
    u, e = exige_login()
    if e:
        return e
    s = db().execute("SELECT * FROM solicitacoes WHERE id=? AND user_id=?", (sid, u["id"])).fetchone()
    if not s:
        return erro("Solicitação não encontrada.", 404)
    if s["status"] != "devolvida":
        return erro("Esta solicitação não está aguardando ciência.", 409)
    d = request.get_json(silent=True) or {}
    if d.get("de_acordo") is not True:
        return erro("É necessário confirmar que recebeu e está de acordo com as informações.")
    ids = {v["id"] for v in db().execute("SELECT id FROM veiculos WHERE solicitacao_id=?", (sid,))}
    conf = {int(x) for x in d.get("confirmados", []) if str(x).isdigit()} & ids
    diverg = str(d.get("divergencia", "")).strip()[:2000]
    if conf != ids and not diverg:
        return erro("Há veículos não confirmados. Descreva a divergência no campo de comunicação.")
    db().executemany("UPDATE veiculos SET confirmado=? WHERE id=?", [(int(i in conf), i) for i in ids])
    db().execute("UPDATE solicitacoes SET status='ciente', ciente_em=?, divergencia=? WHERE id=?",
                 (iso(agora()), diverg or None, sid))
    db().commit()
    return jsonify(solicitacao=serializa(db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()))


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)))
