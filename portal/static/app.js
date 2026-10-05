// Navegação, perfis (admin/cliente) e telas do portal
let USER = null;
const VIEWS = ["vLogin","vNova","vMinhas","vAdmin","vUsuarios","vDetalhe","vSenha","vEsqueci","vDefinir"];
const show = id => VIEWS.forEach(v => $(v).hidden = v !== id);
const ABERTOS = ["em_emissao", "aguardando_aceite", "contestada", "aceita"]; // antes da devolução: ainda dá para cancelar
const SO_ATENDIMENTO = ["em_emissao", "contestada", "aceita"]; // etapas em que a "bola" está com o atendimento (valem prazo)
const STATUS_ADMIN = { em_emissao: "Em emissão", aguardando_aceite: "Aguardando aceite do cliente", contestada: "Valores contestados", aceita: "Valores aceitos (emitir endosso)",
  devolvida: "Devolvida (aguardando ciência)", ciente: "Com ciência", cancelada: "Cancelada" };
const rotuloAdmin = s => s.status === "em_emissao" && s.exige_aceite ? "Em análise (enviar valores)" : STATUS_ADMIN[s.status];
const STATUS_CLIENTE = { em_emissao: "Solicitação em processo de emissão", devolvida: "Endosso devolvido: aguardando sua ciência", ciente: "Concluída", cancelada: "Cancelada",
  aguardando_aceite: "Aguardando o seu aceite dos valores", contestada: "Valores contestados: em nova análise", aceita: "Valores aceitos: em processo de emissão" };
const classeCliente = s => s.status === "ciente" ? "good" : s.status === "cancelada" ? "off" : s.status === "aguardando_aceite" ? "bad" : "warn";
const tiposTxt = s => [...new Set(s.veiculos.map(v => v.tipo))].map(t => t[0] + t.slice(1).toLowerCase()).join(", ");

function prazoTxt(s) {
  if (!SO_ATENDIMENTO.includes(s.status)) return s.status === "aguardando_aceite" ? '<span class="tag">Aguardando o cliente</span>' : "";
  const h = (new Date(s.prazo_em) - Date.now()) / 3600e3, a = Math.abs(h);
  const dur = a >= 48 ? Math.floor(a / 24) + " dia(s)" : Math.max(1, Math.round(a)) + " h";
  return h < 0 ? `<span class="tag bad">Atrasada há ${dur}</span>` : `<span class="tag warn">Restam ${dur}</span>`;
}
function badgeAdmin(s) {
  const c = SO_ATENDIMENTO.includes(s.status) ? "warn" : s.status === "ciente" ? "good" : s.status === "cancelada" ? "off" : "";
  return `<span class="tag ${c}">${rotuloAdmin(s)}</span>` + (s.divergencia ? ` <span class="tag bad">Divergência</span>` : "");
}

function notificar(msg) { $("toast").textContent = msg; $("toast").hidden = false; clearTimeout(notificar.t); notificar.t = setTimeout(() => $("toast").hidden = true, 6000); }

// ---------- sessão e rotas
function montarMenu() {
  const itens = USER.role === "admin" ? [["#/admin", "Solicitações"], ["#/usuarios", "Usuários"]] : [["#/nova", "Nova solicitação"], ["#/minhas", "Minhas solicitações"]];
  $("nav").innerHTML = itens.map(([h, t]) => `<a href="${h}" data-h="${h}">${t}</a>`).join("");
  $("nav").hidden = $("sair").hidden = $("btnSenha").hidden = false;
  $("quem").textContent = USER.nome;
}
function marcarMenu() { document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.h === (location.hash.split("/").slice(0, 2).join("/")))); }

async function rota() {
  if (!USER) return rotaPublica();
  const [, p, id, acao] = location.hash.split("/"), admin = USER.role === "admin";
  marcarMenu();
  if (USER.trocar_senha && p !== "senha") { location.hash = "#/senha"; return; } // senha temporária: precisa trocar antes de tudo
  if (p === "senha") return telaSenha();
  try {
    if (p === "s" && id) return await telaDetalhe(+id, acao === "cancelar");
    if (admin && p === "usuarios") return await telaUsuarios();
    if (admin && p === "admin") return await telaAdmin();
    if (!admin && p === "minhas") return await telaMinhas();
    if (!admin && p === "nova") { resetWizard(); return show("vNova"); }
    location.hash = admin ? "#/admin" : "#/nova";
  } catch (e) {
    if (e.trocar_senha) { USER.trocar_senha = true; location.hash = "#/senha"; return; }
    if (e.status === 401) return sair(true);
    notificar(e.message);
  }
}
window.addEventListener("hashchange", rota);
// Clicar no item do menu da tela atual reabre a tela (ex.: "Nova solicitação" volta a um formulário limpo)
$("nav").addEventListener("click", e => { const a = e.target.closest("a"); if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); rota(); } });

async function entrar(user) { USER = user; montarMenu(); if (!location.hash || location.hash === "#/login") location.hash = ""; await rota(); }
async function sair(silencioso) {
  if (!silencioso) { try { await API.post("/logout"); } catch (e) {} }
  USER = null; $("nav").hidden = $("sair").hidden = $("btnSenha").hidden = true; $("quem").textContent = ""; location.hash = ""; show("vLogin");
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
    <td>${esc(tiposTxt(s))}</td><td>${s.veiculos.length}</td><td><span class="tag ${classeCliente(s)}">${STATUS_CLIENTE[s.status]}</span></td>
    <td>${ABERTOS.includes(s.status) ? `<button class="btn sec mini" data-cancelar="${s.id}">Cancelar solicitação</button>` : ""}</td></tr>`).join("");
  show("vMinhas");
}
for (const t of ["listaMinhas", "listaAdmin"]) $(t).onclick = e => {
  const c = e.target.closest("button[data-cancelar]"); if (c) { location.hash = "#/s/" + c.dataset.cancelar + "/cancelar"; return; }
  const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/s/" + tr.dataset.id;
};

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
    <td>${fmtDataHora(s.criado_em)}</td><td>${fmtDataHora(s.prazo_em)} ${prazoTxt(s)}</td><td>${esc(tiposTxt(s))}</td><td>${s.veiculos.length}</td><td>${badgeAdmin(s)}</td><td>${s.devolvida_por ? esc(s.devolvida_por.nome) : "-"}</td>
    <td>${ABERTOS.includes(s.status) ? `<button class="btn sec mini" data-cancelar="${s.id}">Cancelar</button>` : ""}</td></tr>`).join("");
}
$("filtroStatus").onchange = desenharAdmin;
// Planilha para o administrativo: uma linha por veículo, com os dados do veículo e o valor da pró rata
const numBR = v => v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function baixarPlanilha(sols, arquivo) {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Nº solicitação","Data da solicitação","Usuário","Nome","Placa","Marca/Modelo","Chassi","Ano fabricação","Ano modelo","Tipo","Data de vigência","Contrato",
    "Valor pró rata (calculado)","Valor final (devolvido)","Acionamento","Parcelas solicitadas","Situação","Prazo","Nº endosso","Devolvido por","Devolvida em","Ciência em","Divergência","Anexos","Cancelada em","Cancelada por","Motivo do cancelamento","Aceite dos valores em","Rodadas de valores"]];
  sols.forEach(s => s.veiculos.forEach(v => linhas.push([s.id, fmtDataHora(s.criado_em), s.usuario.username, s.usuario.nome, v.placa, v.marca_modelo, v.chassi,
    v.ano_fab, v.ano_mod, v.tipo, fmtData(v.data_endosso), v.contrato, numBR(v.valor_calculado), numBR(v.valor_final), v.tipo === "EXCLUSÃO" && s.status !== "em_emissao" ? (v.acionamento ? "Sim" : "Não") : "", s.parcelas,
    rotuloAdmin(s), fmtDataHora(s.prazo_em), s.numero_endosso, s.devolvida_por && s.devolvida_por.nome, s.devolvida_em && fmtDataHora(s.devolvida_em), s.ciente_em && fmtDataHora(s.ciente_em),
    s.divergencia, s.anexos.map(a => NOME_ANEXO[a.tipo]).join(" + "), s.cancelada_em && fmtDataHora(s.cancelada_em),
    s.cancelada_por ? s.cancelada_por.nome : (s.cancelada_por_perfil === "cliente" ? "Cliente" : ""), s.cancelamento_motivo,
    s.aceite_em && fmtDataHora(s.aceite_em), s.rodada || ""])));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + linhas.map(l => l.map(q).join(";")).join("\n")], { type: "text/csv" }));
  a.download = arquivo; a.click();
}
$("csv").onclick = () => baixarPlanilha(filtradas(), "solicitacoes-endossos.csv");

// ---------- admin: usuários
async function telaUsuarios() {
  const { usuarios, limite_admins: lim, admins_ativos: n } = await API.get("/usuarios");
  $("contaAdmins").textContent = `Administradores ativos: ${n} de ${lim}.${n >= lim ? " Para cadastrar outro, desative um administrador." : ""}`;
  $("uPerfil").querySelector("option[value=admin]").disabled = n >= lim;
  $("listaUsuarios").innerHTML = usuarios.map(u => `<tr><td>${esc(u.nome)}</td><td>${u.email ? esc(u.email) : "<small class=\"quem\">sem e-mail</small>"}</td><td>${esc(u.username)}</td><td>${u.role === "admin" ? "Administrador" : "Cliente"}</td>
    <td><span class="tag ${u.ativo ? "good" : "bad"}">${u.ativo ? "Ativo" : "Desativado"}</span></td>
    <td>${u.id === USER.id ? "<small class=\"quem\">você</small>" : `<button class="btn sec mini" data-uid="${u.id}" data-ativo="${!u.ativo}">${u.ativo ? "Desativar" : "Reativar"}</button> <button class="btn sec mini" data-reset="${u.id}" data-nome="${esc(u.nome)}">Redefinir senha</button>${u.ativo ? ` <button class="btn sec mini" data-link="${u.id}" data-nome="${esc(u.nome)}">Enviar link por e-mail</button>` : ""}`} <button class="btn sec mini" data-email="${u.id}" data-nome="${esc(u.nome)}" data-atual="${esc(u.email || "")}">E-mail</button></td></tr>`).join("");
  show("vUsuarios");
}
$("listaUsuarios").onclick = async e => {
  const r = e.target.closest("button[data-reset]");
  if (r) { abrirReset(+r.dataset.reset, r.dataset.nome); return; }
  const em = e.target.closest("button[data-email]");
  if (em) { emailId = +em.dataset.email; $("emailNome").textContent = em.dataset.nome; $("emailNovo").value = em.dataset.atual; $("erroEmail").textContent = ""; $("cardEmail").hidden = false; return; }
  const lk = e.target.closest("button[data-link]");
  if (lk) { $("erroUsuario").textContent = ""; try { mostrarConvite(await API.post(`/usuarios/${lk.dataset.link}/enviar-link`), lk.dataset.nome); } catch (err) { $("erroUsuario").textContent = err.message; } return; }
  const b = e.target.closest("button[data-uid]"); if (!b) return;
  $("erroUsuario").textContent = "";
  try { await API.post(`/usuarios/${b.dataset.uid}/ativo`, { ativo: b.dataset.ativo === "true" }); await telaUsuarios(); } catch (err) { $("erroUsuario").textContent = err.message; }
};
// Resultado de convite/link: enviado por e-mail, ou (sem SMTP) o link para o administrador repassar
function mostrarConvite(r, nome) {
  $("okUsuario").hidden = false;
  if (r.convite === "enviado") $("okUsuario").textContent = `Link enviado por e-mail para ${nome}. Ele vale por 48 horas e só pode ser usado uma vez.`;
  else if (r.convite === "link") $("okUsuario").innerHTML = `O envio de e-mail não está configurado neste portal. Copie o link abaixo e envie a ${esc(nome)} (vale por 48 horas, uso único):<br><code style="word-break:break-all">${esc(r.link)}</code>`;
  else if (r.convite === "aviso") $("okUsuario").textContent = `Cadastro criado. ${nome} recebeu um aviso por e-mail (sem a senha, que você informa à parte).`;
  else $("okUsuario").textContent = "Usuário criado.";
}
$("fUsuario").onsubmit = async e => {
  e.preventDefault(); $("erroUsuario").textContent = ""; $("okUsuario").hidden = true;
  try {
    const nome = $("uNome").value, r = await API.post("/usuarios", { nome, email: $("uEmail").value, password: $("uPass").value, role: $("uPerfil").value });
    mostrarConvite(r, nome); if (r.username) $("okUsuario").append(` Usuário: ${r.username}.`); e.target.reset(); await telaUsuarios();
  } catch (err) { $("erroUsuario").textContent = err.message; }
};
let emailId = null;
$("emailCancelar").onclick = () => { $("cardEmail").hidden = true; };
$("emailOk").onclick = async () => {
  $("erroEmail").textContent = "";
  try { await API.post(`/usuarios/${emailId}/email`, { email: $("emailNovo").value }); $("cardEmail").hidden = true; await telaUsuarios(); }
  catch (err) { $("erroEmail").textContent = err.message; }
};

// ---------- detalhe: admin devolve; cliente dá ciência
async function telaDetalhe(id, abrirCancelar = false) {
  const { solicitacao: s } = await API.get("/solicitacoes/" + id);
  const admin = USER.role === "admin";
  const cab = `<div class="topo"><h2>Solicitação nº ${s.id}</h2>${admin ? badgeAdmin(s) + " " + prazoTxt(s) + ' <button class="btn sec mini" id="baixarSol">Baixar planilha</button>' : `<span class="tag ${classeCliente(s)}">${STATUS_CLIENTE[s.status]}</span>`}</div>
    <div class="kv">
      <div><small>Solicitante</small>${esc(s.usuario.nome)}</div>
      <div><small>Data da solicitação</small>${fmtDataHora(s.criado_em)}</div>
      ${admin && SO_ATENDIMENTO.includes(s.status) ? `<div><small>Prazo do atendimento (48h úteis)</small>${fmtDataHora(s.prazo_em)}</div>` : ""}
      ${s.rodada ? `<div><small>Rodadas de valores</small>${s.rodada}</div>` : ""}
      ${s.aceite_em ? `<div><small>Valores aceitos em</small>${fmtDataHora(s.aceite_em)}</div>` : ""}
      ${s.vigencia ? `<div><small>Vigência inicial</small>${fmtData(s.vigencia)}</div>` : ""}
      ${s.parcelas > 1 ? `<div><small>Parcelamento solicitado</small>${s.parcelas}x</div>` : ""}
      ${s.numero_endosso ? `<div><small>Nº do endosso</small>${esc(s.numero_endosso)}</div>` : ""}
      ${s.devolvida_em ? `<div><small>Devolvido em</small>${fmtDataHora(s.devolvida_em)}</div>` : ""}
      ${s.devolvida_por ? `<div><small>Devolvido por</small>${esc(s.devolvida_por.nome)}</div>` : ""}
      ${s.ciente_em ? `<div><small>Ciência em</small>${fmtDataHora(s.ciente_em)}</div>` : ""}
    </div>`;
  let corpo;
  if (s.status === "cancelada") corpo = bannerCancelada(s, admin) + tabelaSolicitada(s);
  else if (admin) corpo = corpoAdmin(s);
  else corpo = corpoCliente(s);
  $("detalhe").innerHTML = `<div class="card">${cab}${blocoCancelar(s)}${blocoAnexos(s)}${blocoSp(s)}${corpo}</div>${blocoHistorico(s)}`;
  ligarCancelar(s, abrirCancelar);
  if (admin) $("baixarSol").onclick = () => baixarPlanilha([s], `solicitacao-${s.id}.csv`);
  if (admin) ligarAdmin(s);
  else ligarCliente(s);
  if ($("reenviarSp")) $("reenviarSp").onclick = async () => {
    $("reenviarSp").disabled = true;
    try { await API.post(`/solicitacoes/${s.id}/arquivar`); await telaDetalhe(s.id); } catch (e) { notificar(e.message); await telaDetalhe(s.id); }
  };
  show("vDetalhe");
}

const NOME_ANEXO = { endosso: "Endosso", boleto: "Boleto" };
function blocoAnexos(s) {
  if (!s.anexos || !s.anexos.length) return "";
  if (window.__ARTIFACT__) // o visualizador bloqueia downloads da própria página: mostra só o nome
    return `<div class="docs"><b>Documentos anexados</b>${s.anexos.map(a => `<span class="tag">${NOME_ANEXO[a.tipo]} (PDF): ${esc(a.nome)}</span>`).join("")}<small class="quem">Na demonstração os arquivos não podem ser baixados.</small></div>`;
  return `<div class="docs"><b>Documentos</b>${s.anexos.map(a => `<a class="doc" href="${API.urlAnexo(s.id, a.tipo)}" target="_blank" rel="noopener"${API.demo ? ` download="${esc(a.nome)}"` : ""}>${NOME_ANEXO[a.tipo]} (PDF)</a>`).join("")}</div>`;
}
// Admin: situação do arquivo dos PDFs no SharePoint
function blocoSp(s) {
  if (USER.role !== "admin" || !USER.sharepoint || !s.anexos || !s.anexos.length) return "";
  const lin = s.anexos.map(a => a.sp_url && a.sp_url.startsWith("https://")
    ? `${NOME_ANEXO[a.tipo]}: <a href="${esc(a.sp_url)}" target="_blank" rel="noopener">abrir no SharePoint</a>`
    : `${NOME_ANEXO[a.tipo]}: <span class="tag bad">não arquivado</span> <small>${esc(a.sp_erro || "")}</small>`).join("<br>");
  return `<div class="docs"><b>Arquivo no SharePoint</b><div>${lin}</div>${s.anexos.some(a => !a.sp_url) ? '<button class="btn sec mini" id="reenviarSp">Tentar novamente</button>' : ""}</div>`;
}
// Parcelamento solicitado, recalculado com o valor FINAL (pode ter mudado na devolução)
function infoParcelas(s, totalFinal) {
  if (!(s.parcelas > 1)) return "";
  const dias = Math.max(0, ...s.veiculos.map(v => v.dias ?? 0)), p = parcelamento(totalFinal, dias), o = p.opcoes.find(x => x.n === s.parcelas);
  return o ? `<div class="ok"><b>Parcelamento:</b> ${o.n}x de ${brl(o.parcela)}${o.primeira !== o.parcela ? ` (1ª parcela ${brl(o.primeira)})` : ""}.</div>`
           : `<div class="aviso"><b>Parcelamento solicitado: ${s.parcelas}x.</b> Com o valor final de ${brl(totalFinal)} ele não é mais possível (${esc(p.motivo || "o máximo agora é " + p.max + "x")}). O atendimento entrará em contato.</div>`;
}
const tipoTag = v => v.tipo[0] + v.tipo.slice(1).toLowerCase();
function tabelaSolicitada(s) {
  return `<div class="tw"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Chassi</th><th>Ano fab./mod.</th><th>Vigência</th><th>Contrato</th><th>Tipo</th><th>Placa substituída</th></tr></thead><tbody>${
    s.veiculos.map(v => `<tr><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}</td><td>${esc(v.chassi)}</td><td>${v.ano_fab ?? "-"}/${v.ano_mod ?? "-"}</td><td>${fmtData(v.data_endosso)}</td><td>${esc(v.contrato)}</td><td>${tipoTag(v)}</td><td>${esc(v.placa_substituida || "-")}</td></tr>`).join("")}</tbody></table></div>`;
}
function valorTxt(v) {
  if (v.tipo === "EXCLUSÃO" && v.acionamento) return `${brl(0)} <span class="tag bad">Acionamento: sem restituição</span>`;
  return brl(v.valor_final);
}
function tabelaFinal(s, obs) {
  return `<div class="tw"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Ano fab./mod.</th><th>Vigência</th><th>Tipo</th><th>Contrato</th><th>Valor</th>${s.status === "ciente" ? "<th>Confere</th>" : ""}</tr></thead><tbody>${
    s.veiculos.map(v => `<tr><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}${v.placa_substituida ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td><td>${v.ano_fab ?? "-"}/${v.ano_mod ?? "-"}</td><td>${fmtData(v.data_endosso)}</td><td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td>
      <td class="n">${valorTxt(v)}</td>${s.status === "ciente" ? `<td>${v.confirmado ? "Sim" : "<b>Não</b>"}</td>` : ""}</tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="6" class="n">TOTAL</td><td class="n">${brl(s.total_final)}</td>${s.status === "ciente" ? "<td></td>" : ""}</tr></tfoot></table></div>
    ${infoParcelas(s, s.total_final)}
    ${obs && s.observacao ? `<p><small class="quem">Observação do atendimento</small><br>${esc(s.observacao)}</p>` : ""}
    ${s.divergencia ? `<div class="aviso"><b>Divergência comunicada pelo cliente:</b><br>${esc(s.divergencia)}</div>` : ""}
    ${s.status === "ciente" && !s.divergencia ? `<div class="ok">O cliente declarou ter recebido e estar de acordo com as informações.</div>` : ""}`;
}

// ---------- chamado de valores (exclusão e substituição): atendimento propõe, cliente aceita ou contesta, atendimento emite
const ultimoEvento = (s, tipo) => [...s.eventos].reverse().find(e => e.tipo === tipo);

function corpoAdmin(s) {
  const st = s.status;
  if (!s.exige_aceite) return st === "em_emissao" ? tabelaEditavel(s) + camposEmissao() : tabelaFinal(s, true);
  if (st === "em_emissao") return `<div class="aviso">Esta solicitação tem exclusão ou substituição: <b>envie os valores ao cliente para aceite</b>. Só depois do aceite o endosso pode ser emitido.</div>${formPropor(s)}`;
  if (st === "contestada") { const c = ultimoEvento(s, "contestada");
    return `<div class="aviso"><b>O cliente contestou os valores</b> em ${fmtDataHora(c.criado_em)}:<br>${esc(c.texto)}</div>${formPropor(s)}`; }
  if (st === "aguardando_aceite") return `<div class="aviso"><b>Aguardando o aceite do cliente</b> (rodada ${s.rodada}). Quando ele responder, a solicitação volta para você com novo prazo.</div>${tabelaFinal(s, false)}${notaProposta(s)}`;
  if (st === "aceita") return `<div class="ok"><b>Valores aceitos pelo cliente</b> em ${fmtDataHora(s.aceite_em)}. Emita o endosso e devolva.</div>${tabelaFinal(s, false)}${camposEmissao()}
    <p><button class="btn sec mini" id="reabrir">Alterar valores (novo aceite do cliente)</button></p><div id="painelReabrir" hidden>${formPropor(s)}</div>`;
  return tabelaFinal(s, true);
}
function corpoCliente(s) {
  const st = s.status;
  if (st === "em_emissao") return `<div class="aviso"><b>Solicitação em processo de emissão.</b>${s.exige_aceite ? " O atendimento vai analisar e enviar os valores para o seu aceite." : ""}</div>${tabelaSolicitada(s)}`;
  if (st === "aguardando_aceite") return formAceite(s);
  if (st === "aceita") return `<div class="ok"><b>Você aceitou os valores</b> em ${fmtDataHora(s.aceite_em)}. O atendimento está emitindo o endosso.</div>${tabelaFinal(s, false)}`;
  if (st === "contestada") return `<div class="aviso"><b>Você contestou os valores:</b><br>${esc(ultimoEvento(s, "contestada").texto)}<br><small class="quem">O atendimento fará uma nova análise e enviará novos valores.</small></div>${tabelaFinal(s, false)}`;
  if (st === "devolvida") return formCiente(s);
  return tabelaFinal(s, true);
}
function notaProposta(s) { const e = ultimoEvento(s, "valores_enviados"); return e && e.texto ? `<p><small class="quem">Observação do atendimento</small><br>${esc(e.texto)}</p>` : ""; }

// tabela editável de valores (administrador): usada para propor valores e, em pedidos só de inclusão, para devolver
function tabelaEditavel(s) {
  const linhas = s.veiculos.map(v => {
    const exc = v.tipo === "EXCLUSÃO", sub = v.tipo === "SUBSTITUIÇÃO", ini = v.valor_final ?? v.valor_calculado ?? "";
    return `<tr data-vid="${v.id}" data-tipo="${v.tipo}"><td>${esc(v.marca_modelo)}</td><td>${esc(v.placa)}${sub ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td>
      <td>${v.ano_fab ?? "-"}/${v.ano_mod ?? "-"}</td><td>${fmtData(v.data_endosso)}</td><td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td><td class="n">${sub ? "-" : brl(v.valor_calculado)}</td>
      <td>${exc ? `<label class="chkl" style="margin:0"><input type="checkbox" class="ac"${v.acionamento ? " checked" : ""}> Teve acionamento</label>` : "-"}</td>
      <td><input class="vf" type="number" step="0.01" style="min-width:120px" value="${v.acionamento ? 0 : ini}" ${v.acionamento ? "disabled" : ""} ${sub ? 'placeholder="informar (pode ser 0)"' : ""}></td></tr>`;
  }).join("");
  return `<div class="tw"><table class="editavel"><thead><tr><th>Veículo</th><th>Placa</th><th>Ano fab./mod.</th><th>Vigência</th><th>Tipo</th><th>Contrato</th><th>Valor calculado</th><th>Acionamento</th><th>Valor final</th></tr></thead>
    <tbody>${linhas}</tbody><tfoot><tr><td colspan="8" class="n">TOTAL</td><td class="n" id="totFinal">-</td></tr></tfoot></table></div>
    <div id="infoParc"></div>
    <div class="aviso">Exclusão: se a placa teve acionamento, marque "Teve acionamento": o valor fica R$ 0,00 (sem restituição). Sem acionamento, o valor de exclusão é sempre negativo. Substituição: informe o valor após a análise da placa (R$ 0,00 quando não há diferença).</div>`;
}
function camposEmissao() {
  return `<div class="grid">
      <div><label for="nEnd">Nº do endosso</label><input id="nEnd"></div>
      <div><label for="fEndosso">Endosso (PDF, obrigatório)</label><input id="fEndosso" type="file" accept="application/pdf,.pdf"></div>
      <div><label for="fBoleto">Boleto (PDF, se houver)</label><input id="fBoleto" type="file" accept="application/pdf,.pdf"></div>
    </div>
    <label for="obs">Observação para o cliente (opcional)</label><textarea id="obs"></textarea>
    <button class="btn" id="devolver">Emitir e devolver endosso ao cliente</button><div class="erro" id="erroDev"></div>`;
}
function formPropor(s) {
  return tabelaEditavel(s) + `<label for="obsProp">Observação para o cliente (opcional)</label><textarea id="obsProp"></textarea>
    <button class="btn" id="enviarValores">Enviar valores ao cliente para aceite</button><div class="erro" id="erroProp"></div>`;
}
// liga os campos da tabela editável; devolve uma função que coleta os valores
function ligarEditavel(s, raiz) {
  const trs = () => [...raiz.querySelectorAll("table.editavel tbody tr")];
  const total = () => { let t = 0; trs().forEach(tr => { const x = parseFloat(tr.querySelector(".vf").value); if (!isNaN(x)) t += x; });
    raiz.querySelector("#totFinal").textContent = brl(t);
    raiz.querySelector("#infoParc").innerHTML = s.parcelas > 1 ? infoParcelas(s, t) : (t > 0 ? '<div class="quem">Pagamento à vista (sem parcelamento solicitado).</div>' : ""); };
  trs().forEach(tr => {
    const ac = tr.querySelector(".ac"), vf = tr.querySelector(".vf");
    if (ac) ac.onchange = () => { vf.disabled = ac.checked; if (ac.checked) vf.value = "0"; else vf.value = s.veiculos.find(v => v.id == tr.dataset.vid).valor_calculado; total(); };
    vf.oninput = total;
  });
  total();
  return () => trs().map(tr => ({ id: +tr.dataset.vid, acionamento: !!tr.querySelector(".ac")?.checked, valor_final: tr.querySelector(".vf").value }));
}
function ligarAdmin(s) {
  const st = s.status;
  const propor = raiz => { const coletar = ligarEditavel(s, raiz);
    raiz.querySelector("#enviarValores").onclick = async () => {
      const b = raiz.querySelector("#enviarValores"), er = raiz.querySelector("#erroProp"); er.textContent = ""; b.disabled = true;
      try { await API.post(`/solicitacoes/${s.id}/propor-valores`, { observacao: raiz.querySelector("#obsProp").value, veiculos: coletar() }); notificar("Valores enviados ao cliente."); await telaDetalhe(s.id); }
      catch (e) { er.textContent = e.message; b.disabled = false; } }; };
  let coletar = null;
  if (!s.exige_aceite && st === "em_emissao") coletar = ligarEditavel(s, $("detalhe"));
  if (s.exige_aceite && (st === "em_emissao" || st === "contestada")) propor($("detalhe"));
  if (st === "aceita") {
    propor($("painelReabrir"));
    $("reabrir").onclick = () => { $("painelReabrir").hidden = !$("painelReabrir").hidden; };
  }
  if ($("devolver")) $("devolver").onclick = async () => {
    $("erroDev").textContent = "";
    try {
      const files = { endosso: $("fEndosso").files[0], boleto: $("fBoleto").files[0] };
      if (!files.endosso) throw new Error("Anexe o PDF do endosso.");
      for (const [k, f] of Object.entries(files)) {
        if (f && !/\.pdf$/i.test(f.name)) throw new Error(`O arquivo do ${k} precisa ser PDF.`);
        if (f && f.size > 10 * 1024 * 1024) throw new Error(`O PDF do ${k} passa de 10 MB.`);
      }
      $("devolver").disabled = true;
      await API.postForm(`/solicitacoes/${s.id}/devolver`, { numero_endosso: $("nEnd").value, observacao: $("obs").value, veiculos: coletar ? coletar() : [] }, files);
      await telaDetalhe(s.id);
    } catch (e) { $("erroDev").textContent = e.message; $("devolver").disabled = false; }
  };
}
function formAceite(s) {
  return `<div class="aviso"><b>O atendimento enviou os valores desta solicitação.</b> Confira e responda: aceite para seguirmos com a emissão do endosso, ou conteste informando o motivo.</div>
    ${tabelaFinal(s, false)}${notaProposta(s)}
    <label class="chkl"><input type="checkbox" id="deAcordoValores"> Estou de acordo com os valores acima.</label>
    <button class="btn" id="aceitar">Aceitar valores</button> <button class="btn sec" id="abrirContestar">Não concordo</button>
    <div class="erro" id="erroAceite"></div>
    <div id="painelContestar" hidden style="margin-top:10px">
      <label for="motivoContest">Por que você não concorda? (obrigatório, mínimo de 10 caracteres)</label><textarea id="motivoContest" maxlength="2000"></textarea>
      <button class="btn" id="enviarContest" style="background:#d33;color:#fff">Enviar contestação</button> <button class="btn sec" id="voltarContest">Voltar</button>
      <div class="erro" id="erroContest"></div>
    </div>`;
}
function ligarCliente(s) {
  if (s.status === "devolvida") ligarCiente(s);
  if (s.status !== "aguardando_aceite") return;
  $("aceitar").onclick = async () => {
    $("erroAceite").textContent = ""; $("aceitar").disabled = true;
    try { await API.post(`/solicitacoes/${s.id}/aceitar-valores`, { de_acordo: $("deAcordoValores").checked }); notificar("Valores aceitos. O atendimento foi avisado."); await telaDetalhe(s.id); }
    catch (e) { $("erroAceite").textContent = e.message; $("aceitar").disabled = false; }
  };
  $("abrirContestar").onclick = () => { $("painelContestar").hidden = false; $("motivoContest").focus(); };
  $("voltarContest").onclick = () => { $("painelContestar").hidden = true; };
  $("enviarContest").onclick = async () => {
    $("erroContest").textContent = ""; $("enviarContest").disabled = true;
    try { await API.post(`/solicitacoes/${s.id}/contestar-valores`, { motivo: $("motivoContest").value }); notificar("Contestação enviada ao atendimento."); await telaDetalhe(s.id); }
    catch (e) { $("erroContest").textContent = e.message; $("enviarContest").disabled = false; }
  };
}

// histórico do chamado
const EVENTO = { criada: "Solicitação aberta", valores_enviados: "Valores enviados para aceite", aceite: "Valores aceitos", contestada: "Valores contestados",
  devolvida: "Endosso emitido e devolvido", ciente: "Ciência do cliente", cancelada: "Solicitação cancelada" };
function blocoHistorico(s) {
  if (!s.eventos || !s.eventos.length) return "";
  return `<div class="card"><h2>Histórico</h2><ol class="hist">${s.eventos.map(e => `<li><b>${EVENTO[e.tipo] || esc(e.tipo)}</b>
    <small class="quem"> · ${fmtDataHora(e.criado_em)} · ${esc(e.autor)}</small>${e.texto ? `<br>${esc(e.texto)}` : ""}</li>`).join("")}</ol></div>`;
}

// cliente: conferir e dar ciência
function formCiente(s) {
  const linhas = s.veiculos.map(v => `<tr><td><input type="checkbox" class="cf" value="${v.id}" checked></td><td>${esc(v.marca_modelo)}</td>
    <td>${esc(v.placa)}${v.placa_substituida ? `<br><small>substitui ${esc(v.placa_substituida)}</small>` : ""}</td><td>${tipoTag(v)}</td><td>${esc(v.contrato)}</td><td class="n">${valorTxt(v)}</td></tr>`).join("");
  const sens = s.veiculos.some(v => v.tipo !== "INCLUSÃO");
  return `<div class="aviso"><b>Seu endosso foi emitido.</b> Baixe o endosso (e o boleto, se houver) em "Documentos" e confira as informações abaixo${sens ? ", principalmente os veículos de exclusão e substituição" : ""}.</div>
    <div class="tw"><table><thead><tr><th>Confere</th><th>Veículo</th><th>Placa</th><th>Tipo</th><th>Contrato</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody>
    <tfoot><tr><td colspan="5" class="n">TOTAL</td><td class="n">${brl(s.total_final)}</td></tr></tfoot></table></div>
    ${infoParcelas(s, s.total_final)}
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
  try { const { user } = await API.get("/me"); await entrar(user); } catch (e) { rotaPublica(); }
})();

// ---------- redefinir a senha de outro usuário (administrador)
let resetId = null;
const gerarSenha = () => { // 12 caracteres sem letras que se confundem (0/O, 1/l/I)
  const A = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => A[x % A.length]).join("");
};
function abrirReset(id, nome) {
  resetId = id; $("resetNome").textContent = nome; $("resetSenha").value = gerarSenha();
  $("erroReset").textContent = ""; $("okReset").hidden = true; $("cardReset").hidden = false; $("cardReset").scrollIntoView?.();
}
$("resetGerar").onclick = () => { $("resetSenha").value = gerarSenha(); };
$("resetCopiar").onclick = async () => {
  try { await navigator.clipboard.writeText($("resetSenha").value); notificar("Senha copiada."); }
  catch (e) { $("resetSenha").select(); notificar("Selecione e copie a senha manualmente."); }
};
$("resetCancelar").onclick = () => { $("cardReset").hidden = true; resetId = null; };
$("resetOk").onclick = async () => {
  $("erroReset").textContent = ""; $("okReset").hidden = true;
  try {
    const senha = $("resetSenha").value;
    await API.post(`/usuarios/${resetId}/senha`, { password: senha });
    $("okReset").hidden = false;
    $("okReset").textContent = `Senha de ${$("resetNome").textContent} redefinida. Senha temporária: ${senha}. Ela precisará trocá-la ao entrar. Anote agora: esta senha não é mostrada de novo.`;
    $("resetSenha").value = "";
  } catch (e) { $("erroReset").textContent = e.message; }
};

// ---------- alterar a própria senha
$("btnSenha").onclick = () => { location.hash = "#/senha"; };
function telaSenha() {
  $("fSenha").reset(); $("erroSenha").textContent = ""; $("okSenha").hidden = true;
  $("avisoTroca").hidden = !USER.trocar_senha; show("vSenha");
}
$("fSenha").onsubmit = async e => {
  e.preventDefault(); $("erroSenha").textContent = ""; $("okSenha").hidden = true;
  if ($("sNova").value !== $("sConf").value) { $("erroSenha").textContent = "As duas senhas novas não são iguais."; return; }
  try {
    await API.post("/minha-senha", { atual: $("sAtual").value, nova: $("sNova").value });
    const forcado = USER.trocar_senha; USER.trocar_senha = false; $("fSenha").reset();
    if (forcado) { location.hash = USER.role === "admin" ? "#/admin" : "#/nova"; await rota(); }
    else { $("okSenha").hidden = false; $("okSenha").textContent = "Senha alterada."; }
  } catch (err) { $("erroSenha").textContent = err.message; }
};

// ---------- cancelar solicitação (cliente: as próprias; administrador: qualquer uma; só antes de devolvida)
function bannerCancelada(s, admin) {
  const quem = admin ? (s.cancelada_por ? esc(s.cancelada_por.nome) : "") : (s.cancelada_por_perfil === "admin" ? "o atendimento" : "você");
  return `<div class="aviso"><b>Solicitação cancelada</b> em ${fmtDataHora(s.cancelada_em)}${quem ? " por " + quem : ""}.<br>
    <small class="quem">Justificativa</small><br>${esc(s.cancelamento_motivo)}</div>`;
}
function blocoCancelar(s) {
  if (!ABERTOS.includes(s.status)) return "";
  return `<div id="cancelarArea" style="margin:0 0 14px"><button class="btn sec mini" id="btnCancelar">Cancelar solicitação</button>
    <div id="formCancelar" hidden style="margin-top:10px">
      <label for="motivoCancel">Justificativa do cancelamento (obrigatória, mínimo de 10 caracteres)</label>
      <textarea id="motivoCancel" maxlength="2000"></textarea>
      <button class="btn" id="okCancelar" style="background:#d33;color:#fff">Confirmar cancelamento</button>
      <button class="btn sec" id="voltarCancelar">Voltar</button>
      <div class="erro" id="erroCancelar"></div>
    </div></div>`;
}
function ligarCancelar(s, abrir) {
  if (!$("btnCancelar")) return;
  const mostrar = v => { $("formCancelar").hidden = !v; $("btnCancelar").hidden = v; if (v) $("motivoCancel").focus(); };
  $("btnCancelar").onclick = () => mostrar(true);
  $("voltarCancelar").onclick = () => mostrar(false);
  $("okCancelar").onclick = async () => {
    $("erroCancelar").textContent = ""; $("okCancelar").disabled = true;
    try { await API.post(`/solicitacoes/${s.id}/cancelar`, { motivo: $("motivoCancel").value }); notificar("Solicitação cancelada."); await telaDetalhe(s.id); }
    catch (e) { $("erroCancelar").textContent = e.message; $("okCancelar").disabled = false; }
  };
  if (abrir) mostrar(true);
}

// ---------- páginas públicas (sem login): esqueci a senha e definir senha pelo link do e-mail
function rotaPublica() {
  const [, p, token] = location.hash.split("/");
  if (p === "esqueci") { $("fEsqueci").reset(); $("erroEsqueci").textContent = ""; $("okEsqueci").hidden = true; return show("vEsqueci"); }
  if (p === "definir-senha" && token) return telaDefinir(token);
  show("vLogin");
}
$("fEsqueci").onsubmit = async e => {
  e.preventDefault(); $("erroEsqueci").textContent = ""; $("okEsqueci").hidden = true;
  try {
    const r = await API.post("/esqueci-senha", { email: $("eMail").value });
    $("okEsqueci").hidden = false; $("okEsqueci").textContent = r.mensagem;
    if (r.demo_link) $("okEsqueci").innerHTML += `<br><small class="quem">Demonstração: o e-mail não é enviado de verdade. Abra este link: </small><a href="${esc(r.demo_link)}">definir senha</a>`;
  } catch (err) { $("erroEsqueci").textContent = err.message; }
};
let tokenDefinir = null;
async function telaDefinir(token) {
  tokenDefinir = token; $("erroDefinir").textContent = ""; $("fDefinir").reset(); $("fDefinir").hidden = false; $("definirFim").hidden = true; $("definirInvalido").hidden = true; $("definirOla").textContent = "";
  show("vDefinir");
  try { const r = await API.get(`/definir-senha/${encodeURIComponent(token)}`); $("definirOla").textContent = `Olá, ${r.nome}. Escolha a sua senha de acesso.`; }
  catch (e) { $("fDefinir").hidden = true; $("definirInvalido").hidden = false; }
}
$("fDefinir").onsubmit = async e => {
  e.preventDefault(); $("erroDefinir").textContent = "";
  if ($("dNova").value !== $("dConf").value) { $("erroDefinir").textContent = "As duas senhas não são iguais."; return; }
  try {
    const r = await API.post("/definir-senha", { token: tokenDefinir, senha: $("dNova").value });
    $("fDefinir").hidden = true; $("definirFim").hidden = false; $("okDefinir").textContent = `Senha definida. Entre com ${r.email || r.usuario} e a sua nova senha.`;
    $("user").value = r.email || r.usuario;
  } catch (err) { $("erroDefinir").textContent = err.message; }
};
