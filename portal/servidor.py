"""Inicia o portal para uso em servidor (Windows ou Linux) com o servidor Waitress.

Lê config.env (se existir). Endereço e porta: PORTAL_HOST (padrão 127.0.0.1) e PORTAL_PORT (padrão 5000).
"""
import os

from waitress import serve

import app as portal  # carrega config.env e prepara o banco

host = os.environ.get("PORTAL_HOST", "127.0.0.1")
porta = int(os.environ.get("PORTAL_PORT", "5000"))
print(f"Portal de Movimentações | Endossos rodando em http://{host}:{porta}  (feche esta janela para parar)")
serve(portal.app, host=host, port=porta, threads=8)
