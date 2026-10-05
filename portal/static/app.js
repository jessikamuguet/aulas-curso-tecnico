// Navegação, perfis (admin/cliente) e telas do portal
let USER = null;
const VIEWS = ["vLogin","vNova","vMinhas","vAdmin","vUsuarios","vDetalhe"];
const show = id => VIEWS.forEach(v => $(v).hidden = v !== id);
const STATUS_ADMIN = { em_emissao: "Em emissão", devolvida: "Devolvida (aguardando ciência)", ciente: "Com ciência" };
const STATUS_CLIENTE = { em_emissao: "Solicitação em processo de emissão", devolvida: "Endosso devolvido: aguardando sua ciência", ciente: "Concluída" };
const tiposTxt = s => [...new Set(s.veiculos.map(v => v.tipo))].map(t => t[0] + t.slice(1).toLowerCase()).join(", ");

function prazoTxt(s) {
  if (s.status !== "em_emissao") return "";
  const h = (new Date(s.prazo_em) - Date.now()) / 3600e3, a = Math.abs(h);
  const dur = a >= 48 ? Math.floor(a / 24) + " dia(s)" : Math.max(1, Math.round(a)) + " h";
  return h < 0 ? `<span class="tag bad">Atrasada há ${dur}</span>` : `<span class="tag warn">Restam ${dur}</span>`;
}
function badgeAdmin(s) {
  const c = s.status === "em_emissao" ? "warn" : s.status === "ciente" ? "good" : "";
  return `<span class="tag ${c}">${STATUS_ADMIN[s.status]}</span>` + (s.divergencia ? ` <span class="tag bad">Divergência</span>` : "");
}

// ---------- sessão e rotas
function montarMenu() {
  const itens = USER.role === "admin" ? [["#/admin", "Solicitações"], ["#/usuarios", "Usuários"]] : [["#/nova", "Nova solicitação"], ["#/minhas", "Minhas solicitações"]];
  $("nav").innerHTML = itens.map(([h, t]) => `<a href="${h}" data-h="${h}">${t}</a>`).join("");
  $("nav").hidden = $("sair").hidden = false;
  $("quem").textContent = USER.nome;
}
function marcarMenu() { document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.h === (location.hash.split("/").slice(0, 2).join("/")))); }

async function rota() {
  if (!USER) { show("vLogin"); return; }
  const [, p, id] = location.hash.split("/"), admin = USER.role === "admin";
  marcarMenu();
  try {
    if (p === "s" && id) return await telaDetalhe(+id);
    if (admin && p === "usuarios") return await telaUsuarios();
    if (admin && p === "admin") return await telaAdmin();
    if (!admin && p === "minhas") return await telaMinhas();
    if (!admin && p === "nova") { resetWizard(); return show("vNova"); }
    location.hash = admin ? "#/admin" : "#/nova";
  } catch (e) {
    if (e.status === 401) return sair(true);
    alert(e.message);
  }
}
window.addEventListener("hashchange", rota);

async function entrar(user) { USER = user; montarMenu(); if (!location.hash || location.hash === "#/login") location.hash = ""; await rota(); }
async function sair(silencioso) {
  if (!silencioso) { try { await API.post("/logout"); } catch (e) {} }
  USER = null; $("nav").hidden = $("sair").hidden = true; $("quem").textContent = ""; location.hash = ""; show("vLogin");
}
$("sair").onclick = () => sair();
$("fLogin").onsubmit = async e => {
  e.preventDefault(); $("erroLogin").textContent = "";
  try { const { user } = await API.post("/login", { username: $("user").value, password: $("pass").value }); $("pass").value = ""; await entrar(user); }
  catch (err) { $("erroLogin").textContent = err.message; }
};

// ---------- cliente: lista
async function telaMinhas() {
  const { solicitacoes } = await API.get("/solicitacoes");
  $("vazioMinhas").hidden = solicitacoes.length > 0;
  $("listaMinhas").innerHTML = solicitacoes.map(s => `<tr class="click" data-id="${s.id}"><td>${s.id}</td><td>${fmtDataHora(s.criado_em)}</td>
    <td>${esc(tiposTxt(s))}</td><td>${s.veiculos.length}</td><td><span class="tag ${s.status === "ciente" ? "good" : "warn"}">${STATUS_CLIENTE[s.status]}</span></td></tr>`).join("");
  show("vMinhas");
}
for (const t of ["listaMinhas", "listaAdmin"]) $(t).onclick = e => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/s/" + tr.dataset.id; };

// ---------- admin: lista e relatório
let LISTA = [];
async function telaAdmin() {
  ({ solicitacoes: LISTA } = await API.get("/solicitacoes"));
  desenharAdmin(); show("vAdmin");
}
function filtradas() {
  const f = $("filtroStatus").value;
  // abertas primeiro, pelo prazo mais próximo
  return LISTA.filter(s => !f || s.status === f).sort((a, b) => (a.status === "em_emissao" ? 0 : 1) - (b.status === "em_emissao" ? 0 : 1) || new Date(a.prazo_em) - new Date(b.prazo_em));
}
function desenharAdmin() {
  const l = filtradas(); $("vazioAdmin").hidden = l.length > 0;
  $("listaAdmin").innerHTML = l.map(s => `<tr class="click" data-id="${s.id}"><td>${s.id}</td><td>${esc(s.usuario.nome)}<br><small>${esc(s.usuario.username)}</small></td>
    <td>${fmtDataHora(s.criado_em)}</td><td>${fmtDataHora(s.prazo_em)} ${prazoTxt(s)}</td><td>${esc(tiposTxt(s))}</td><td>${s.veiculos.length}</td><td>${badgeAdmin(s)}</td></tr>`).join("");
}
$("filtroStatus").onchange = desenharAdmin;
$("csv").onclick = () => {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["Nº","Usuário","Nome","Data da solicitação","Prazo","Situação","Nº endosso","Devolvida em","Ciência em","Divergência","Anexos","Placa","Tipo","Contrato","Valor calculado","Valor final","Acionamento"];
  const linhas = [cab];
  filtradas().forEach(s => s.veiculos.forEach(v => linhas.push([s.id, s.usuario.username, s.usuario.nome, fmtDataHora(s.criado_em), fmtDataHora(s.prazo_em), STATUS_ADMIN[s.status],
    s.numero_endosso, s.devolvida_em && fmtDataHora(s.devolvida_em), s.ciente_em && fmtDataHora(s.ciente_em), s.divergencia, s.anexos.map(a => NOME_ANEXO[a.tipo]).join(), v.placa, v.tipo, v.contrato,
    v.valor_calculado, v.valor_final, v.acionamento ? "Sim" : "Não"])));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + linhas.map(l => l.map(q).join(";")).join("\n")], { type: "text/csv" }));
  a.download = "solicitacoes-endossos.csv"; a.click();
};

// ---------- admin: usuários
async function telaUsuarios() {
  const { usuarios } = await API.get("/usuarios");
  $("listaUsuarios").innerHTML = usuarios.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.username)}</td><td>${u.role === "admin" ? "Administrador" : "Cliente"}</td></tr>`).join("");
  show("vUsuarios");
}
$("fUsuario").onsubmit = async e => {
  e.preventDefault(); $("erroUsuario").textContent = ""; $("okUsuario").hidden = true;
  try {
    await API.post("/usuarios", { nome: $("uNome").value, username: $("uUser").value, password: $("uPass").value });
    $("okUsuario").hidden = false; $("okUsuario").textContent = `Usuário ${$("uUser").value} criado.`; e.target.reset(); await telaUsuarios();
  } catch (err) { $("erroUsuario").textContent = err.message; }
};

// ---------- detalhe: admin devolve; cliente dá ciência
async function telaDetalhe(id) {
  const { solicitacao: s } = await API.get("/solicitacoes/" + id);
  const admin = USER.role === "admin";
  const cab = `<div class="topo"><h2>Solicitação nº ${s.id}</h2>${admin ? badgeAdmin(s) + " " + prazoTxt(s) : `<span class="tag ${s.status === "ciente" ? "good" : "warn"}">${STATUS_CLIENTE[s.status]}</span>`}</div>
    <div class="kv">
      <div><small>Solicitante</small>${esc(s.usuario.nome)}</div>
      <div><small>Data da solicitação</small>${fmtDataHora(s.criado_em)}</div>
      ${admin ? `<div><small>Prazo de retorno (48h úteis)</small>${fmtDataHora(s.prazo_em)}</div>` : ""}
      ${s.vigencia ? `<div><small>Vigência inicial</small>${fmtData(s.vigencia)}</div>` : ""}
      ${s.numero_endosso ? `<div><small>Nº do endosso</small>${esc(s.numero_endosso)}</div>` : ""}
      ${s.devolvida_em ? `<div><small>Devolvido em</small>${fmtDataHora(s.devolvida_em)}</div>` : ""}
      ${s.ciente_em ? `<div><small>Ciência em</small>${fmtDataHora(s.ciente_em)}</div>` : ""}
    </div>`;
  let corpo;
  if (admin) corpo = s.status === "em_emissao" ? formDevolver(s) : tabelaFinal(s, true);
  else if (s.status === "em_emissao") corpo = `<div class="aviso"><b>Solicitação em processo de emissão.</b></div>${tabelaSolicitada(s)}`;
  else if (s.status === "devolvida") corpo = formCiente(s);
  else corpo = tabelaFinal(s, true);
  $("detalhe").innerHTML = `<div class="card">${cab}${blocoAnexos(s)}${corpo}</div>`;
  if (admin && s.status === "em_emissao") ligarDevolver(s);
  if (!admin && s.status === "devolvida") ligarCiente(s);
  show("vDetalhe");
}

const NOME_ANEXO = { endosso: "Endosso", boleto: "Boleto" };
function blocoAnexos(s) {
  if (!s.anexos || !s.anexos.length) return "";
  return `<div class="docs"><b>Documentos</b>${s.anexos.map(a => `<a class="doc" href="${API.urlAnexo(s.id, a.tipo)}" target="_blank" rel="noopener"${API.demo ? ` download="${esc(a.nome)}"` : ""}>${NOME_ANEXO[a.tipo]} (PDF)</a>`).join("")}</div>`;
}
const tipoTag = v => v.tipo[0] + v.tipo.slice(1).toLowerCase();
function tabelaSolicitada(s) {
  return `<div class="tw"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Chassi</th><th>Contrato</th><th>Tipo</th><th>Placa substituída</th></tr></thead><tbody>${
    s.veiculos.map(v => `<tr><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}</td><td>${esc(v.chassi)}</td><td>${esc(v.contrato)}</td><td>${tipoTag(v)}</td><td>${esc(v.placa_substituida || "-")}</td></tr>`).join("")}</tbody></table></div>`;
}
function valorTxt(v) {
  if (v.tipo === "EXCLUSÃO" && v.acionamento) return `${brl(0)} <span class="tag bad">Acionamento: sem restituição</span>`;
  return brl(v.valor_final);
}
function tabelaFinal(s, obs) {
  return `<div class="tw"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Tipo</th><th>Contrato</th><th>Valor</th>${s.status === "ciente" ? "<th>Confere</th>" : ""}</tr></thead><tbody>${
    s.veiculos.map(v => `<tr><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}${v.placa_substituida ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td><td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td>
      <td class="n">${valorTxt(v)}</td>${s.status === "ciente" ? `<td>${v.confirmado ? "Sim" : "<b>Não</b>"}</td>` : ""}</tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="4" class="n">TOTAL</td><td class="n">${brl(s.total_final)}</td>${s.status === "ciente" ? "<td></td>" : ""}</tr></tfoot></table></div>
    ${obs && s.observacao ? `<p><small class="quem">Observação do atendimento</small><br>${esc(s.observacao)}</p>` : ""}
    ${s.divergencia ? `<div class="aviso"><b>Divergência comunicada pelo cliente:</b><br>${esc(s.divergencia)}</div>` : ""}
    ${s.status === "ciente" && !s.divergencia ? `<div class="ok">O cliente declarou ter recebido e estar de acordo com as informações.</div>` : ""}`;
}

// admin: devolver o endosso
function formDevolver(s) {
  const linhas = s.veiculos.map(v => {
    const exc = v.tipo === "EXCLUSÃO", sub = v.tipo === "SUBSTITUIÇÃO";
    return `<tr data-vid="${v.id}" data-tipo="${v.tipo}"><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}${sub ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td>
      <td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td><td class="n">${sub ? "-" : brl(v.valor_calculado)}</td>
      <td>${exc ? '<label class="chkl" style="margin:0"><input type="checkbox" class="ac"> Teve acionamento</label>' : "-"}</td>
      <td><input class="vf" type="number" step="0.01" style="min-width:120px" value="${v.valor_calculado ?? ""}" ${sub ? 'placeholder="informar"' : ""}></td></tr>`;
  }).join("");
  return `<div class="tw"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Tipo</th><th>Contrato</th><th>Valor calculado</th><th>Acionamento</th><th>Valor final</th></tr></thead>
    <tbody>${linhas}</tbody><tfoot><tr><td colspan="6" class="n">TOTAL</td><td class="n" id="totFinal">-</td></tr></tfoot></table></div>
    <div class="aviso">Exclusão: se a placa teve acionamento, marque "Teve acionamento": o valor fica R$ 0,00 (sem restituição). Sem acionamento, o valor de exclusão é sempre negativo. Substituição: informe o valor após a análise da placa.</div>
    <div class="grid">
      <div><label for="nEnd">Nº do endosso</label><input id="nEnd"></div>
      <div><label for="fEndosso">Endosso (PDF, obrigatório)</label><input id="fEndosso" type="file" accept="application/pdf,.pdf"></div>
      <div><label for="fBoleto">Boleto (PDF, se houver)</label><input id="fBoleto" type="file" accept="application/pdf,.pdf"></div>
    </div>
    <label for="obs">Observação para o cliente (opcional)</label><textarea id="obs"></textarea>
    <button class="btn" id="devolver">Devolver endosso ao cliente</button><div class="erro" id="erroDev"></div>`;
}
function ligarDevolver(s) {
  const trs = () => [...document.querySelectorAll("#detalhe tbody tr")];
  const total = () => { let t = 0; trs().forEach(tr => { const x = parseFloat(tr.querySelector(".vf").value); if (!isNaN(x)) t += x; }); $("totFinal").textContent = brl(t); };
  trs().forEach(tr => {
    const ac = tr.querySelector(".ac"), vf = tr.querySelector(".vf");
    if (ac) ac.onchange = () => { vf.disabled = ac.checked; if (ac.checked) vf.value = "0"; else vf.value = s.veiculos.find(v => v.id == tr.dataset.vid).valor_calculado; total(); };
    vf.oninput = total;
  });
  total();
  $("devolver").onclick = async () => {
    $("erroDev").textContent = "";
    try {
      const files = { endosso: $("fEndosso").files[0], boleto: $("fBoleto").files[0] };
      if (!files.endosso) throw new Error("Anexe o PDF do endosso.");
      for (const [k, f] of Object.entries(files)) {
        if (f && !/\.pdf$/i.test(f.name)) throw new Error(`O arquivo do ${k} precisa ser PDF.`);
        if (f && f.size > 10 * 1024 * 1024) throw new Error(`O PDF do ${k} passa de 10 MB.`);
      }
      $("devolver").disabled = true;
      await API.postForm(`/solicitacoes/${s.id}/devolver`, { numero_endosso: $("nEnd").value, observacao: $("obs").value,
        veiculos: trs().map(tr => ({ id: +tr.dataset.vid, acionamento: !!tr.querySelector(".ac")?.checked, valor_final: tr.querySelector(".vf").value })) }, files);
      await telaDetalhe(s.id);
    } catch (e) { $("erroDev").textContent = e.message; $("devolver").disabled = false; }
  };
}

// cliente: conferir e dar ciência
function formCiente(s) {
  const linhas = s.veiculos.map(v => `<tr><td><input type="checkbox" class="cf" value="${v.id}" checked></td><td>${esc(v.marca_modelo)}</td>
    <td>${esc(v.placa)}${v.placa_substituida ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td><td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td><td class="n">${valorTxt(v)}</td></tr>`).join("");
  const sens = s.veiculos.some(v => v.tipo !== "INCLUSÃO");
  return `<div class="aviso"><b>Seu endosso foi emitido.</b> Baixe o endosso (e o boleto, se houver) em "Documentos" e confira as informações abaixo${sens ? ", principalmente os veículos de exclusão e substituição" : ""}.</div>
    <div class="tw"><table><thead><tr><th>Confere</th><th>Veículo</th><th>Placa</th><th>Tipo</th><th>Contrato</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody>
    <tfoot><tr><td colspan="5" class="n">TOTAL</td><td class="n">${brl(s.total_final)}</td></tr></tfoot></table></div>
    ${s.observacao ? `<p><small class="quem">Observação do atendimento</small><br>${esc(s.observacao)}</p>` : ""}
    <label for="div">Comunicar divergência (se algum veículo não deveria constar, ou se faltou algum, descreva aqui)</label>
    <textarea id="div" placeholder="Se desmarcar algum veículo acima, explique aqui."></textarea>
    <label class="chkl"><input type="checkbox" id="deAcordo"> Declaro que recebi e visualizei as informações acima e estou de acordo com o que foi calculado.</label>
    <button class="btn" id="confirmar">Confirmar ciência</button><div class="erro" id="erroCi"></div>`;
}
function ligarCiente(s) {
  $("confirmar").onclick = async () => {
    $("erroCi").textContent = "";
    try {
      await API.post(`/solicitacoes/${s.id}/ciente`, { de_acordo: $("deAcordo").checked, divergencia: $("div").value,
        confirmados: [...document.querySelectorAll(".cf:checked")].map(c => +c.value) });
      await telaDetalhe(s.id);
    } catch (e) { $("erroCi").textContent = e.message; }
  };
}

// ---------- início
(async () => {
  $("demoInfo").hidden = !API.demo;
  try { const { user } = await API.get("/me"); await entrar(user); } catch (e) { show("vLogin"); }
})();
