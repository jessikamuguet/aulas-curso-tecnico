"""Gera portal-demo.html: versão em arquivo único, com servidor simulado no navegador (só para demonstração)."""
import base64, os, re, sys
B = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(B, "static")
rd = lambda n: open(os.path.join(S, n), encoding="utf-8").read()
h = rd("index.html")
h = h.replace('<link rel="stylesheet" href="style.css">', "<style>" + rd("style.css") + "</style>")
h = h.replace("window.__DEMO__ = false;", "window.__DEMO__ = true;")
for n in ["prorata.js", "common.js", "mock.js", "api.js", "wizard.js", "app.js"]:
    h = h.replace(f'<script src="{n}"></script>', "<script>" + rd(n).replace("</script", "<\\/script") + "</script>")
logo = base64.b64encode(open(os.path.join(S, "logo.webp"), "rb").read()).decode()
h = h.replace('src="logo.webp"', f'src="data:image/webp;base64,{logo}"')
open(os.path.join(B, "portal-demo.html"), "w", encoding="utf-8").write(h)
print("portal-demo.html gerado")

# Variante para publicar como página (sem <html>/<head>/<body>; downloads desativados)
if len(sys.argv) > 1:
    titulo = re.search(r"<title>.*?</title>", h, re.S).group(0)
    estilo = re.search(r"<style>.*?</style>", h, re.S).group(0)
    corpo = re.search(r"<body>(.*)</body>", h, re.S).group(1).replace("<script>window.__DEMO__ = true;</script>", "<script>window.__DEMO__ = true; window.__ARTIFACT__ = true;</script>")
    open(sys.argv[1], "w", encoding="utf-8").write(f"{titulo}\n{estilo}\n{corpo}")
    print("variante gerada em", sys.argv[1])
