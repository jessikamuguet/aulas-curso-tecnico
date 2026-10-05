// Camada de acesso à API. No modo demonstração (arquivo único) usa o mock em memória.
const API = (() => {
  const demo = !!window.__DEMO__ || location.protocol === "file:";
  async function call(method, path, body) {
    if (demo) return Mock.handle(method, path, body);
    const r = await fetch("/api" + path, { method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.erro || "Erro " + r.status); e.status = r.status; e.trocar_senha = !!data.trocar_senha; throw e; }
    return data;
  }
  // Envio com arquivos (multipart): dados em JSON + { campo: File }
  async function postForm(path, dados, files) {
    if (demo) return Mock.handle("POST", path, { __form: true, dados, files });
    const fd = new FormData(); fd.append("dados", JSON.stringify(dados));
    Object.entries(files).forEach(([k, f]) => { if (f) fd.append(k, f); });
    const r = await fetch("/api" + path, { method: "POST", credentials: "same-origin", body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.erro || "Erro " + r.status); e.status = r.status; throw e; }
    return data;
  }
  const urlAnexo = (sid, tipo) => demo ? Mock.anexoUrl(sid, tipo) : `/api/solicitacoes/${sid}/anexos/${tipo}`;
  return { demo, get: p => call("GET", p), post: (p, b) => call("POST", p, b || {}), postForm, urlAnexo };
})();
