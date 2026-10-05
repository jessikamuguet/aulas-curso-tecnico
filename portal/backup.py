"""Cópia de segurança do banco (portal.db) em backups/portal-AAAAMMDD-HHMM.db. Mantém as 30 mais recentes.

Pasta de destino: PORTAL_BACKUP_DIR (padrão: pasta backups ao lado do app). Use uma pasta de OUTRO disco ou da rede.
"""
import glob
import os
import sqlite3
from datetime import datetime

from app import BASE, DB_PATH

destino = os.environ.get("PORTAL_BACKUP_DIR", os.path.join(BASE, "backups"))
os.makedirs(destino, exist_ok=True)
arquivo = os.path.join(destino, datetime.now().strftime("portal-%Y%m%d-%H%M.db"))
origem, copia = sqlite3.connect(DB_PATH), sqlite3.connect(arquivo)
origem.backup(copia)  # cópia consistente, mesmo com o portal em uso
copia.close(), origem.close()
for velho in sorted(glob.glob(os.path.join(destino, "portal-*.db")))[:-30]:
    os.remove(velho)
print("Backup criado:", arquivo)
