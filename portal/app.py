"""Portal de Movimentações | Endossos - backend (Flask + SQLite).

Rodar:  pip install -r requirements.txt && python app.py
Variáveis opcionais: ADMIN_PASSWORD, SECRET_KEY, PORT, HTTPS=1 (cookie seguro), PORTAL_DB
"""
import json, os, re, secrets, sqlite3, time
from datetime import date, datetime, timedelta, timezone
from flask import Flask, Response, g, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("PORTAL_DB", os.path.join(BASE, "portal.db"))
SP = timezone(timedelta(hours=-3))  # horário de Brasília (sem horário de verão)
BASE_DIAS = 365
PRAZO_HORAS_UTEIS = 48  # prazo para devolver o endosso
EXPEDIENTE = (8, 17)  # horas úteis: das 08:00 às 17:00, seg a sex
TIPOS = ("INCLUSÃO", "EXCLUSÃO", "SUBSTITUIÇÃO")
MAX_PDF = 10 * 1024 * 1024  # 10 MB por anexo
ANEXOS = {"endosso": "Endosso", "boleto": "Boleto"}

app = Flask(__name__, static_folder="static", static_url_path="")


def _secret():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = os.path.join(BASE, ".secret_key")
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
    return open(path).read().strip()


app.secret_key = _secret()
app.config.update(MAX_CONTENT_LENGTH=25 * 1024 * 1024, SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=os.environ.get("HTTPS") == "1")  # em produção (HTTPS), defina HTTPS=1

# ---------------------------------------------------------------- banco
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','cliente')));
CREATE TABLE IF NOT EXISTS solicitacoes (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  criado_em TEXT NOT NULL, prazo_em TEXT NOT NULL, vigencia TEXT,
  status TEXT NOT NULL DEFAULT 'em_emissao', numero_endosso TEXT, observacao TEXT,
  devolvida_em TEXT, ciente_em TEXT, divergencia TEXT);
CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
  marca_modelo TEXT, placa TEXT, chassi TEXT, contrato TEXT, tipo TEXT,
  placa_substituida TEXT, data_endosso TEXT, valor_inicial REAL, dias INTEGER,
  valor_calculado REAL, acionamento INTEGER DEFAULT 0, valor_final REAL, confirmado INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY, solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('endosso','boleto')), nome TEXT, conteudo BLOB NOT NULL, criado_em TEXT NOT NULL,
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
    if not con.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        senha = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
        con.execute("INSERT INTO users(username,nome,password_hash,role) VALUES('admin','Administrador',?, 'admin')",
                    (generate_password_hash(senha),))
        con.commit()
        print(f"\n>>> Usuário admin criado. Login: admin | Senha: {senha}\n"
              ">>> Guarde esta senha (ela não será mostrada de novo).\n")
    con.close()


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
    return db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def exige_login(admin=False):
    u = usuario()
    if not u:
        return None, erro("Faça login para continuar.", 401)
    if admin and u["role"] != "admin":
        return None, erro("Acesso restrito ao administrador.", 403)
    return u, None


def serializa(s):
    veics = db().execute("SELECT * FROM veiculos WHERE solicitacao_id=? ORDER BY id", (s["id"],)).fetchall()
    u = db().execute("SELECT id,nome,username FROM users WHERE id=?", (s["user_id"],)).fetchone()
    vs = [dict(v, acionamento=bool(v["acionamento"]), confirmado=bool(v["confirmado"])) for v in veics]
    soma = lambda k: round(sum(v[k] or 0 for v in vs), 2)
    anexos = [dict(r) for r in db().execute(
        "SELECT tipo, nome, length(conteudo) AS tamanho FROM anexos WHERE solicitacao_id=? ORDER BY tipo = 'boleto'", (s["id"],))]
    return dict(s, usuario=dict(u), veiculos=vs, anexos=anexos, total_calculado=soma("valor_calculado"), total_final=soma("valor_final"))


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
    u = db().execute("SELECT * FROM users WHERE username=?", (nome,)).fetchone()
    if not u or not check_password_hash(u["password_hash"], senha):
        tent += 1
        _falhas[chave] = (tent, time.time() + 60 if tent >= 5 else 0)
        return erro("Usuário ou senha inválidos.", 401)
    _falhas.pop(chave, None)
    session.clear()
    session["uid"] = u["id"]
    return jsonify(user=dict(id=u["id"], nome=u["nome"], username=u["username"], role=u["role"]))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    u, e = exige_login()
    if e:
        return e
    return jsonify(user=dict(id=u["id"], nome=u["nome"], username=u["username"], role=u["role"]))


# ---------------------------------------------------------------- usuários (admin)
@app.get("/api/usuarios")
def usuarios():
    _, e = exige_login(admin=True)
    if e:
        return e
    rows = db().execute("SELECT id,username,nome,role FROM users ORDER BY role, nome").fetchall()
    return jsonify(usuarios=[dict(r) for r in rows])


@app.post("/api/usuarios")
def criar_usuario():
    _, e = exige_login(admin=True)
    if e:
        return e
    d = request.get_json(silent=True) or {}
    nome, user, senha = str(d.get("nome", "")).strip(), str(d.get("username", "")).strip().lower(), str(d.get("password", ""))
    if not nome or not re.fullmatch(r"[a-z0-9._-]{3,30}", user):
        return erro("Informe o nome e um usuário de 3 a 30 caracteres (letras, números, ponto, hífen).")
    if len(senha) < 8:
        return erro("A senha precisa ter pelo menos 8 caracteres.")
    try:
        db().execute("INSERT INTO users(username,nome,password_hash,role) VALUES(?,?,?,'cliente')",
                     (user, nome, generate_password_hash(senha)))
        db().commit()
    except sqlite3.IntegrityError:
        return erro("Esse usuário já existe.", 409)
    return jsonify(ok=True), 201


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
    placas, linhas = set(), []
    try:
        vig = _data(d.get("vigencia"), "Vigência inicial") if any(v.get("tipo") != "SUBSTITUIÇÃO" for v in veics) else None
        for i, v in enumerate(veics, 1):
            tipo = v.get("tipo")
            if tipo not in TIPOS:
                raise ValueError(f"Veículo {i}: tipo de endosso inválido.")
            placa = re.sub(r"[- ]", "", str(v.get("placa", "")).upper())
            chassi = str(v.get("chassi", "")).strip().upper()
            mm = str(v.get("marca_modelo", "")).strip()
            if not re.fullmatch(r"[A-Z]{3}\d[A-Z0-9]\d{2}", placa):
                raise ValueError(f"Veículo {i}: placa inválida.")
            if not re.fullmatch(r"[A-Z0-9]{17}", chassi):
                raise ValueError(f"Veículo {i}: chassi deve ter 17 caracteres.")
            if not mm:
                raise ValueError(f"Veículo {i}: informe marca/modelo.")
            if placa in placas:
                raise ValueError(f"Placa repetida na solicitação: {placa}.")
            placas.add(placa)
            ps = re.sub(r"[- ]", "", str(v.get("placa_substituida", "")).upper())
            if tipo == "SUBSTITUIÇÃO" and not ps:
                raise ValueError(f"Veículo {i}: informe a placa do veículo substituído.")
            dias = valor_calc = data_e = vi = None
            if tipo != "SUBSTITUIÇÃO":
                de = _data(v.get("data_endosso"), f"Veículo {i}: data do endosso")
                vi = float(v.get("valor_inicial"))
                if vi < 0:
                    raise ValueError(f"Veículo {i}: valor inicial inválido.")
                dias, valor_calc = calcular(tipo, vig, de, vi)
                data_e = de.isoformat()
            linhas.append((mm[:120], placa, chassi, str(v.get("contrato", "")).strip()[:60], tipo,
                           ps or None, data_e, vi, dias, valor_calc))
    except (ValueError, TypeError) as ex:
        return erro(str(ex) if isinstance(ex, ValueError) and str(ex) else "Dados inválidos na solicitação.")
    agora_ = agora()
    cur = db().execute("INSERT INTO solicitacoes(user_id,criado_em,prazo_em,vigencia) VALUES(?,?,?,?)",
                       (u["id"], iso(agora_), iso(prazo_horas_uteis(agora_)), vig.isoformat() if vig else None))
    sid = cur.lastrowid
    db().executemany("""INSERT INTO veiculos(solicitacao_id,marca_modelo,placa,chassi,contrato,tipo,
                        placa_substituida,data_endosso,valor_inicial,dias,valor_calculado) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                     [(sid, *l) for l in linhas])
    db().commit()
    s = db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()
    return jsonify(solicitacao=serializa(s)), 201


@app.post("/api/solicitacoes/<int:sid>/devolver")
def devolver(sid):
    _, e = exige_login(admin=True)
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
    db().execute("UPDATE solicitacoes SET status='devolvida', numero_endosso=?, observacao=?, devolvida_em=? WHERE id=?",
                 (numero[:60], str(d.get("observacao", "")).strip()[:2000], iso(agora()), sid))
    db().commit()
    return jsonify(solicitacao=serializa(db().execute("SELECT * FROM solicitacoes WHERE id=?", (sid,)).fetchone()))


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
