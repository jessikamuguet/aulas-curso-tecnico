// Camada de acesso à API. No modo demonstração (arquivo único) usa o mock em memória.
const API = (() => {
  const demo = !!window.__DEMO__ || location.protocol === "file:";
  async function call(method, path, body) {
    if (demo) return Mock.handle(method, path, body);
    const r = await fetch("/api" + path, { method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.erro || "Erro " + r.status); e.status = r.status; throw e; }
    return data;
  }
  return { demo, get: p => call("GET", p), post: (p, b) => call("POST", p, b || {}) };
})();
