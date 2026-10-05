"""Redefine a senha de um usuário (padrão: admin). Uso:  venv\\Scripts\\python redefinir_senha.py [usuario]"""
import getpass
import sqlite3
import sys

from werkzeug.security import generate_password_hash

from app import DB_PATH

usuario = (sys.argv[1] if len(sys.argv) > 1 else "admin").strip().lower()
con = sqlite3.connect(DB_PATH)
if not con.execute("SELECT 1 FROM users WHERE username=?", (usuario,)).fetchone():
    sys.exit(f"Usuário '{usuario}' não existe.")
senha = getpass.getpass(f"Nova senha para {usuario} (mínimo 8 caracteres): ")
if len(senha) < 8 or senha != getpass.getpass("Repita a nova senha: "):
    sys.exit("Senhas diferentes ou com menos de 8 caracteres. Nada foi alterado.")
con.execute("UPDATE users SET password_hash=? WHERE username=?", (generate_password_hash(senha), usuario))
con.commit()
print("Senha alterada. Pode entrar no portal com a nova senha.")
