// MODO DEMONSTRAÇÃO: simula o servidor no navegador (dados só neste navegador, senhas em texto puro).
// Em produção quem responde é o app.py.
const Mock = (() => {
  const KEY = "portal_demo_v1";
  const seed = () => ({ seq: 0, vseq: 0, uid: null,
    users: [{ id: 1, username: "admin", nome: "Administrador", password: "admin123", role: "admin", email: "admin@demo.com.br" },
            { id: 2, username: "cliente", nome: "Cliente Demonstração", password: "cliente123", role: "cliente", email: "cliente@demo.com.br" }], tokens: {},
    sols: [] });
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  st = st || seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const fail = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
  const MAX_ADMINS = 5;
  const me = () => st.users.find(u => u.id === st.uid && u.ativo !== false);
  const adminsAtivos = () => st.users.filter(u => u.role === "admin" && u.ativo !== false).length;
  const pub = u => ({ id: u.id, nome: u.nome, username: u.username, role: u.role, email: u.email || null, trocar_senha: !!u.trocar });
  let rotaAtual = "";
  const exige = admin => { const u = me(); if (!u) fail("Faça login para continuar.", 401);
    if (u.trocar && !["/me", "/logout", "/minha-senha"].includes(rotaAtual)) { const e = new Error("Defina uma nova senha para continuar."); e.status = 403; e.trocar_senha = true; throw e; } if (admin && u.role !== "admin") fail("Acesso restrito ao administrador.", 403); return u; };
  const soma = (vs, k) => Math.round(vs.reduce((a, v) => a + (v[k] || 0), 0) * 100) / 100;
  const ser = s => { const u = st.users.find(x => x.id === s.user_id);
    const { anexos, devolvida_por, cancelada_por, ...resto } = JSON.parse(JSON.stringify(s));
    const eu = me(), resp = devolvida_por && st.users.find(x => x.id === devolvida_por), canc = cancelada_por && st.users.find(x => x.id === cancelada_por);
    return { ...resto, cancelada_por_perfil: canc ? canc.role : null,
             ...(eu && eu.role === "admin" ? { devolvida_por: resp ? { id: resp.id, nome: resp.nome, username: resp.username } : null, cancelada_por: canc ? { nome: canc.nome } : null } : {}), anexos: Object.entries(anexos || {}).map(([tipo, a]) => ({ tipo, nome: a.nome, tamanho: a.tamanho })), usuario: { id: u.id, nome: u.nome, username: u.username },
             total_calculado: soma(s.veiculos, "valor_calculado"), total_final: soma(s.veiculos, "valor_final") }; };
  const achar = id => st.sols.find(s => s.id === +id) || fail("Solicitação não encontrada.", 404);
  const placaNorm = p => String(p || "").toUpperCase().replace(/[- ]/g, "");

  function criar(u, d) {
    if (u.role === "admin") fail("Use uma conta de cliente para abrir solicitações.", 403);
    const vs = d.veiculos;
    if (!Array.isArray(vs) || !vs.length || vs.length > 500) fail("Informe de 1 a 500 veículos.");
    const algumCalc = vs.some(v => v.tipo !== "SUBSTITUIÇÃO");
    if (algumCalc && !/^\d{4}-\d{2}-\d{2}$/.test(d.vigencia || "")) fail("Vigência inicial inválida.");
    const vig = algumCalc ? parse(d.vigencia) : null, usadas = new Set(), chassisUsados = new Set(), linhas = [];
    vs.forEach((v, i) => {
      const n = i + 1, placa = placaNorm(v.placa), chassi = String(v.chassi || "").toUpperCase().trim();
      if (!["INCLUSÃO","EXCLUSÃO","SUBSTITUIÇÃO"].includes(v.tipo)) fail(`Veículo ${n}: tipo de endosso inválido.`);
      let placaFinal = placa;
      if (placa === "" || /^[A-Z]{3}0000$/.test(placa)) { // 0 km ainda sem placa: só em inclusão
        if (v.tipo !== "INCLUSÃO") fail(`Veículo ${n}: a placa é obrigatória na ${v.tipo.toLowerCase()}.`);
        placaFinal = "SEM PLACA";
      } else if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) fail(`Veículo ${n}: placa inválida.`);
      if (!/^[A-Z0-9]{17}$/.test(chassi)) fail(`Veículo ${n}: chassi deve ter 17 caracteres.`);
      if (!String(v.marca_modelo || "").trim()) fail(`Veículo ${n}: informe marca/modelo.`);
      if (placaFinal !== "SEM PLACA" && usadas.has(placaFinal)) fail(`Placa repetida na solicitação: ${placaFinal}.`); usadas.add(placaFinal);
      if (chassisUsados.has(chassi)) fail(`Chassi repetido na solicitação: ${chassi}.`); chassisUsados.add(chassi);
      const af = parseInt(v.ano_fab), am = parseInt(v.ano_mod);
      if (isNaN(af) || isNaN(am)) fail(`Veículo ${n}: informe o ano de fabricação e o ano do modelo.`);
      if (af < 1950 || af > 2100 || am < 1950 || am > 2100) fail(`Veículo ${n}: ano de fabricação/modelo inválido.`);
      const ps = placaNorm(v.placa_substituida);
      if (v.tipo === "SUBSTITUIÇÃO" && !ps) fail(`Veículo ${n}: informe a placa do veículo substituído.`);
      let dias = null, vc = null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data_endosso || "")) fail(`Veículo ${n}: data de vigência inválida.`);
      if (v.tipo !== "SUBSTITUIÇÃO") {
        if (!(v.valor_inicial >= 0)) fail(`Veículo ${n}: valor inicial inválido.`);
        try { const r = calcularEndosso({ vigencia: vig, data: parse(v.data_endosso), valorInicial: v.valor_inicial, tipo: v.tipo });
              dias = r.dias; vc = Math.round(r.valor * 100) / 100; } catch (e) { fail(e.message); }
      }
      linhas.push({ id: ++st.vseq, marca_modelo: String(v.marca_modelo).trim(), placa: placaFinal, chassi, ano_fab: af, ano_mod: am, contrato: String(v.contrato || ""), tipo: v.tipo,
        placa_substituida: ps || null, data_endosso: v.data_endosso || null, valor_inicial: v.tipo === "SUBSTITUIÇÃO" ? null : v.valor_inicial,
        dias, valor_calculado: vc, acionamento: false, valor_final: null, confirmado: false });
    });
    const parcelas = parseInt(d.parcelas || 1);
    if (isNaN(parcelas) || parcelas < 1) fail("Número de parcelas inválido.");
    if (parcelas !== 1) {
      const calc = linhas.filter(l => l.valor_calculado !== null), opc = parcelamento(calc.reduce((a, l) => a + l.valor_calculado, 0), Math.max(0, ...calc.map(l => l.dias)));
      if (!opc.opcoes.some(o => o.n === parcelas)) fail(`Parcelamento em ${parcelas}x não é permitido.` + (opc.motivo ? " " + opc.motivo : ` O máximo é ${opc.max}x.`));
    }
    const agora = new Date();
    const s = { id: ++st.seq, user_id: u.id, criado_em: agora.toISOString(), prazo_em: prazoHorasUteis(agora).toISOString(), vigencia: d.vigencia || null, parcelas,
      status: "em_emissao", numero_endosso: null, observacao: null, devolvida_em: null, devolvida_por: null, cancelada_em: null, cancelada_por: null, cancelamento_motivo: null, ciente_em: null, divergencia: null, veiculos: linhas };
    st.sols.push(s); save(); return { solicitacao: ser(s) };
  }
  function devolver(d, id) {
    const eu = exige(true); const s = achar(id);
    if (s.status !== "em_emissao") fail("Esta solicitação já foi devolvida.", 409);
    if (!String(d.numero_endosso || "").trim()) fail("Informe o número do endosso.");
    const upd = s.veiculos.map(v => {
      const x = (d.veiculos || []).find(y => +y.id === v.id); if (!x) fail(`Falta o valor final do veículo ${v.placa}.`);
      const ac = !!x.acionamento && v.tipo === "EXCLUSÃO"; let vf = ac ? 0 : parseFloat(x.valor_final);
      if (isNaN(vf)) fail(`Valor final inválido para ${v.placa}.`);
      if (v.tipo === "EXCLUSÃO") vf = -Math.abs(vf);
      return [v, ac, Math.round(vf * 100) / 100 + 0];
    });
    upd.forEach(([v, ac, vf]) => { v.acionamento = ac; v.valor_final = vf; });
    Object.assign(s, { status: "devolvida", numero_endosso: String(d.numero_endosso).trim(), observacao: String(d.observacao || "").trim(), devolvida_em: new Date().toISOString(), devolvida_por: eu.id });
    save(); return { solicitacao: ser(s) };
  }
  const lerArq = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("Não foi possível ler o arquivo.")); r.readAsDataURL(f); });
  async function devolverForm(form, id) {
    exige(true); achar(id);
    const anexos = {};
    for (const [tipo, rot] of [["endosso", "endosso"], ["boleto", "boleto"]]) {
      const f = form.files[tipo];
      if (!f) { if (tipo === "endosso") fail("Anexe o PDF do endosso."); continue; }
      if (f.size > 10 * 1024 * 1024) fail(`O PDF do ${rot} passa de 10 MB.`);
      const data = await lerArq(f);
      if (!data.includes("base64,JVBERi0")) fail(`O arquivo do ${rot} não é um PDF válido.`); // "%PDF-"
      anexos[tipo] = { nome: f.name.replace(/[^\w .()\-]/g, "_").slice(0, 120), tamanho: f.size, data };
    }
    const r = devolver(form.dados, id);
    achar(id).anexos = anexos; save(); return { solicitacao: ser(achar(id)) };
  }
  function ciente(u, d, id) {
    const s = achar(id); if (s.user_id !== u.id) fail("Solicitação não encontrada.", 404);
    if (s.status !== "devolvida") fail("Esta solicitação não está aguardando ciência.", 409);
    if (d.de_acordo !== true) fail("É necessário confirmar que recebeu e está de acordo com as informações.");
    const conf = new Set((d.confirmados || []).map(Number)), dv = String(d.divergencia || "").trim();
    if (!s.veiculos.every(v => conf.has(v.id)) && !dv) fail("Há veículos não confirmados. Descreva a divergência no campo de comunicação.");
    s.veiculos.forEach(v => v.confirmado = conf.has(v.id));
    Object.assign(s, { status: "ciente", ciente_em: new Date().toISOString(), divergencia: dv || null }); save(); return { solicitacao: ser(s) };
  }

  const emailOk = e => /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(String(e || "").trim().toLowerCase());
  function novoToken(uid, tipo) { const t = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join(""); st.tokens[t] = { uid, tipo, exp: Date.now() + (tipo === "convite" ? 48 : 1) * 3600e3 }; save(); return t; }
  const linkDef = t => location.href.split("#")[0] + "#/definir-senha/" + t;
  function tokenOk(t) { const k = st.tokens[t]; if (!k || k.usado || k.exp < Date.now()) return null; const u = st.users.find(x => x.id === k.uid); return u && u.ativo !== false ? { k, u } : null; }
  function cancelar(u, d, id) {
    const s = achar(id); if (u.role !== "admin" && s.user_id !== u.id) fail("Solicitação não encontrada.", 404);
    if (s.status === "cancelada") fail("Esta solicitação já foi cancelada.", 409);
    if (s.status !== "em_emissao") fail("Só é possível cancelar solicitações que ainda não foram devolvidas.", 409);
    const motivo = String(d.motivo || "").trim(); if (motivo.length < 10) fail("Descreva a justificativa do cancelamento (mínimo de 10 caracteres).");
    Object.assign(s, { status: "cancelada", cancelada_em: new Date().toISOString(), cancelada_por: u.id, cancelamento_motivo: motivo.slice(0, 2000) }); save(); return { solicitacao: ser(s) };
  }
  function minhaSenha(u, d) {
    if (d.atual !== u.password) fail("A senha atual está incorreta.");
    if (String(d.nova || "").length < 8) fail("A nova senha precisa ter pelo menos 8 caracteres.");
    if (d.nova === d.atual) fail("A nova senha precisa ser diferente da atual.");
    u.password = d.nova; u.trocar = false; save(); return { ok: true };
  }
  function redefinirSenha(eu, id, d) {
    const alvo = st.users.find(x => x.id === +id);
    if (+id === eu.id) fail("Para trocar a sua própria senha, use \"Alterar senha\".", 409);
    if (String(d.password || "").length < 8) fail("A senha temporária precisa ter pelo menos 8 caracteres.");
    if (!alvo) fail("Usuário não encontrado.", 404);
    alvo.password = d.password; alvo.trocar = true; save(); return { ok: true };
  }

  return { anexoUrl: (id, tipo) => (achar(id).anexos?.[tipo]?.data) || "#", handle(method, path, d = {}) {
    let m; rotaAtual = path;
    if (path === "/login") { const cred = String(d.username || "").trim().toLowerCase(), u = st.users.find(x => (x.username === cred || (x.email || "").toLowerCase() === cred) && x.password === d.password && x.ativo !== false);
      if (!u) fail("Usuário ou senha inválidos.", 401); st.uid = u.id; save(); return { user: pub(u) }; }
    if (path === "/logout") { st.uid = null; save(); return { ok: true }; }
    if (path === "/me") return { user: pub(exige()) };
    if (path === "/minha-senha") return minhaSenha(exige(), d);
    if ((m = path.match(/^\/usuarios\/(\d+)\/senha$/))) return redefinirSenha(exige(true), m[1], d);
    if (path === "/usuarios" && method === "GET") { exige(true); return { usuarios: st.users.map(u => ({ ...pub(u), ativo: u.ativo !== false })), limite_admins: MAX_ADMINS, admins_ativos: adminsAtivos() }; }
    if ((m = path.match(/^\/usuarios\/(\d+)\/ativo$/))) { const eu = exige(true), alvo = st.users.find(x => x.id === +m[1]);
      if (typeof d.ativo !== "boolean") fail("Informe ativo: true ou false."); if (!alvo) fail("Usuário não encontrado.", 404);
      if (alvo.id === eu.id) fail("Você não pode desativar o seu próprio usuário.", 409);
      if (d.ativo && alvo.role === "admin" && alvo.ativo === false && adminsAtivos() >= MAX_ADMINS) fail(`Limite de ${MAX_ADMINS} administradores atingido. Desative um administrador antes.`, 409);
      alvo.ativo = d.ativo; save(); return { ok: true }; }
    if (path === "/usuarios") { exige(true);
      const nome = String(d.nome || "").trim(), email = String(d.email || "").trim().toLowerCase(), senha = String(d.password || "");
      if (!nome) fail("Informe o nome."); if (!emailOk(email)) fail("Informe um e-mail válido.");
      if (senha && senha.length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
      const perfil = d.role || "cliente"; if (!["cliente", "admin"].includes(perfil)) fail("Perfil inválido.");
      if (perfil === "admin" && adminsAtivos() >= MAX_ADMINS) fail(`Limite de ${MAX_ADMINS} administradores atingido. Desative um administrador para cadastrar outro.`, 409);
      if (st.users.some(x => (x.email || "").toLowerCase() === email)) fail("Já existe um usuário com esse e-mail.", 409);
      let user = String(d.username || "").trim().toLowerCase() || email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "usuario";
      if (user.length < 3) user += "usr"; for (let base = user, n = 1; st.users.some(x => x.username === user); n++) user = base + (n + 1);
      const novo = { id: Math.max(...st.users.map(x => x.id)) + 1, username: user, nome, password: senha || crypto.randomUUID(), role: perfil, ativo: true, email };
      st.users.push(novo); save();
      const r = { ok: true, username: user };
      if (!senha) { r.convite = "link"; r.link = linkDef(novoToken(novo.id, "convite")); } else r.convite = "aviso"; // na demonstração não há envio de e-mail: mostra o link
      return r; }
    if ((m = path.match(/^\/usuarios\/(\d+)\/enviar-link$/))) { exige(true); const alvo = st.users.find(x => x.id === +m[1]); if (!alvo) fail("Usuário não encontrado.", 404);
      if (alvo.ativo === false) fail("Reative o usuário antes de enviar o link.", 409); return { ok: true, convite: "link", link: linkDef(novoToken(alvo.id, "convite")) }; }
    if ((m = path.match(/^\/usuarios\/(\d+)\/email$/))) { exige(true); const alvo = st.users.find(x => x.id === +m[1]), email = String(d.email || "").trim().toLowerCase();
      if (!emailOk(email)) fail("Informe um e-mail válido."); if (!alvo) fail("Usuário não encontrado.", 404);
      if (st.users.some(x => x.id !== alvo.id && (x.email || "").toLowerCase() === email)) fail("Já existe um usuário com esse e-mail.", 409); alvo.email = email; save(); return { ok: true }; }
    if (path === "/esqueci-senha") { const email = String(d.email || "").trim().toLowerCase(), u = st.users.find(x => (x.email || "").toLowerCase() === email && x.ativo !== false);
      return { ok: true, mensagem: "Se esse e-mail estiver cadastrado, você receberá um link para definir uma nova senha em alguns minutos.", ...(u ? { demo_link: linkDef(novoToken(u.id, "reset")) } : {}) }; }
    if ((m = path.match(/^\/definir-senha\/(.+)$/)) && method === "GET") { const r = tokenOk(decodeURIComponent(m[1])); if (!r) fail("Este link é inválido ou expirou. Peça um novo.", 404); return { nome: r.u.nome, tipo: r.k.tipo }; }
    if (path === "/definir-senha") { const r = tokenOk(String(d.token || "")); if (!r) fail("Este link é inválido ou expirou. Peça um novo.");
      if (String(d.senha || "").length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
      r.u.password = d.senha; r.u.trocar = false; r.k.usado = true; save(); return { ok: true, usuario: r.u.username, email: r.u.email }; }
    if ((m = path.match(/^\/solicitacoes\/(\d+)\/cancelar$/))) return cancelar(exige(), d, m[1]);
    if (path === "/solicitacoes" && method === "GET") { const u = exige();
      return { solicitacoes: st.sols.filter(s => u.role === "admin" || s.user_id === u.id).map(ser).reverse() }; }
    if (path === "/solicitacoes") return criar(exige(), d);
    if ((m = path.match(/^\/solicitacoes\/(\d+)$/))) { const u = exige(), s = achar(m[1]);
      if (u.role !== "admin" && s.user_id !== u.id) fail("Solicitação não encontrada.", 404); return { solicitacao: ser(s) }; }
    if ((m = path.match(/^\/solicitacoes\/(\d+)\/devolver$/))) return d.__form ? devolverForm(d, m[1]) : devolver(d, m[1]);
    if ((m = path.match(/^\/solicitacoes\/(\d+)\/ciente$/))) return ciente(exige(), d, m[1]);
    fail("Rota não encontrada.", 404);
  } };
})();
