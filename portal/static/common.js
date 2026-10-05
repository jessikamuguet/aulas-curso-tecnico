const $ = id => document.getElementById(id);
const brl = v => (v == null ? "-" : v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }));
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtDataHora = iso => new Date(iso).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short", timeZone:"America/Sao_Paulo" });
const fmtData = iso => iso ? iso.split("-").reverse().join("/") : "-";
