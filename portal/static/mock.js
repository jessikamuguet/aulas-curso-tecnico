// MODO DEMONSTRAÇÃO: simula o servidor no navegador (dados só neste navegador, senhas em texto puro).
// Em produção quem responde é o app.py.
const Mock = (() => {
  const KEY = "portal_demo_v1";
  const seed = () => ({ seq: 0, vseq: 0, uid: null,
    users: [{ id: 1, username: "admin", nome: "Administrador", password: "admin123", role: "admin" },
            { id: 2, username: "cliente", nome: "Cliente Demonstração", password: "cliente123", role: "cliente" }],
    sols: [] });
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  st = st || seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const fail = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
  const me = () => st.users.find(u => u.id === st.uid);
  const pub = u => ({ id: u.id, nome: u.nome, username: u.username, role: u.role });
  const exige = admin => { const u = me(); if (!u) fail("Faça login para continuar.", 401); if (admin && u.role !== "admin") fail("Acesso restrito ao administrador.", 403); return u; };
  const soma = (vs, k) => Math.round(vs.reduce((a, v) => a + (v[k] || 0), 0) * 100) / 100;
  const ser = s => { const u = st.users.find(x => x.id === s.user_id);
    const { anexos, ...resto } = JSON.parse(JSON.stringify(s));
    return { ...resto, anexos: Object.entries(anexos || {}).map(([tipo, a]) => ({ tipo, nome: a.nome, tamanho: a.tamanho })), usuario: { id: u.id, nome: u.nome, username: u.username },
             total_calculado: soma(s.veiculos, "valor_calculado"), total_final: soma(s.veiculos, "valor_final") }; };
  const achar = id => st.sols.find(s => s.id === +id) || fail("Solicitação não encontrada.", 404);
  const placaNorm = p => String(p || "").toUpperCase().replace(/[- ]/g, "");

  function criar(u, d) {
    if (u.role === "admin") fail("Use uma conta de cliente para abrir solicitações.", 403);
    const vs = d.veiculos;
    if (!Array.isArray(vs) || !vs.length || vs.length > 500) fail("Informe de 1 a 500 veículos.");
    const algumCalc = vs.some(v => v.tipo !== "SUBSTITUIÇÃO");
    if (algumCalc && !/^\d{4}-\d{2}-\d{2}$/.test(d.vigencia || "")) fail("Vigência inicial inválida.");
    const vig = algumCalc ? parse(d.vigencia) : null, usadas = new Set(), linhas = [];
    vs.forEach((v, i) => {
      const n = i + 1, placa = placaNorm(v.placa), chassi = String(v.chassi || "").toUpperCase().trim();
      if (!["INCLUSÃO","EXCLUSÃO","SUBSTITUIÇÃO"].includes(v.tipo)) fail(`Veículo ${n}: tipo de endosso inválido.`);
      if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) fail(`Veículo ${n}: placa inválida.`);
      if (!/^[A-Z0-9]{17}$/.test(chassi)) fail(`Veículo ${n}: chassi deve ter 17 caracteres.`);
      if (!String(v.marca_modelo || "").trim()) fail(`Veículo ${n}: informe marca/modelo.`);
      if (usadas.has(placa)) fail(`Placa repetida na solicitação: ${placa}.`); usadas.add(placa);
      const ps = placaNorm(v.placa_substituida);
      if (v.tipo === "SUBSTITUIÇÃO" && !ps) fail(`Veículo ${n}: informe a placa do veículo substituído.`);
      let dias = null, vc = null;
      if (v.tipo !== "SUBSTITUIÇÃO") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data_endosso || "")) fail(`Veículo ${n}: data do endosso inválida.`);
        if (!(v.valor_inicial >= 0)) fail(`Veículo ${n}: valor inicial inválido.`);
        try { const r = calcularEndosso({ vigencia: vig, data: parse(v.data_endosso), valorInicial: v.valor_inicial, tipo: v.tipo });
              dias = r.dias; vc = Math.round(r.valor * 100) / 100; } catch (e) { fail(e.message); }
      }
      linhas.push({ id: ++st.vseq, marca_modelo: String(v.marca_modelo).trim(), placa, chassi, contrato: String(v.contrato || ""), tipo: v.tipo,
        placa_substituida: ps || null, data_endosso: v.data_endosso || null, valor_inicial: v.tipo === "SUBSTITUIÇÃO" ? null : v.valor_inicial,
        dias, valor_calculado: vc, acionamento: false, valor_final: null, confirmado: false });
    });
    const agora = new Date();
    const s = { id: ++st.seq, user_id: u.id, criado_em: agora.toISOString(), prazo_em: prazoHorasUteis(agora).toISOString(), vigencia: d.vigencia || null,
      status: "em_emissao", numero_endosso: null, observacao: null, devolvida_em: null, ciente_em: null, divergencia: null, veiculos: linhas };
    st.sols.push(s); save(); return { solicitacao: ser(s) };
  }
  function devolver(d, id) {
    exige(true); const s = achar(id);
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
    Object.assign(s, { status: "devolvida", numero_endosso: String(d.numero_endosso).trim(), observacao: String(d.observacao || "").trim(), devolvida_em: new Date().toISOString() });
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

  return { anexoUrl: (id, tipo) => (achar(id).anexos?.[tipo]?.data) || "#", handle(method, path, d = {}) {
    let m;
    if (path === "/login") { const u = st.users.find(x => x.username === String(d.username || "").trim().toLowerCase() && x.password === d.password);
      if (!u) fail("Usuário ou senha inválidos.", 401); st.uid = u.id; save(); return { user: pub(u) }; }
    if (path === "/logout") { st.uid = null; save(); return { ok: true }; }
    if (path === "/me") return { user: pub(exige()) };
    if (path === "/usuarios" && method === "GET") { exige(true); return { usuarios: st.users.map(pub) }; }
    if (path === "/usuarios") { exige(true); const user = String(d.username || "").trim().toLowerCase();
      if (!String(d.nome || "").trim() || !/^[a-z0-9._-]{3,30}$/.test(user)) fail("Informe o nome e um usuário de 3 a 30 caracteres (letras, números, ponto, hífen).");
      if (String(d.password || "").length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
      if (st.users.some(x => x.username === user)) fail("Esse usuário já existe.", 409);
      st.users.push({ id: st.users.length + 1, username: user, nome: String(d.nome).trim(), password: d.password, role: "cliente" }); save(); return { ok: true }; }
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
