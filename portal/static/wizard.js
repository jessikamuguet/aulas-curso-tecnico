  const TIPOS = ["INCLUSÃO","EXCLUSÃO","SUBSTITUIÇÃO"];
  const opts = TIPOS.map(t => `<option>${t}</option>`).join("");

  // Etapa 1
  function addVeiculo(v = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="mm"></td><td><input class="pl"></td><td><input class="ch"></td><td><input class="np"></td>
      <td><select class="tp">${opts}</select></td><td><input class="ps" disabled></td><td><button class="x" title="Remover">✕</button></td>`;
    const q = s => tr.querySelector(s);
    q(".tp").value = v.tp || "INCLUSÃO"; q(".mm").value = v.mm || ""; q(".pl").value = v.pl || ""; q(".ch").value = v.ch || "";
    q(".tp").onchange = e => { q(".ps").disabled = e.target.value !== "SUBSTITUIÇÃO"; avisoSub(); };
    q(".ps").oninput = avisoSub; q(".pl").oninput = avisoSub;
    q(".x").onclick = () => { tr.remove(); avisoSub(); syncContrato(); };
    $("veiculos").appendChild(tr);
  }
  // Repete o Nº Contrato do primeiro veículo nos demais
  function syncContrato() {
    const rows = [...$("veiculos").children], on = $("repContrato").checked;
    rows.forEach((tr, i) => {
      const np = tr.querySelector(".np");
      if (i === 0) { np.disabled = false; return; }
      np.disabled = on; if (on) np.value = rows[0].querySelector(".np").value;
    });
  }
  $("repContrato").onchange = syncContrato;
  $("veiculos").addEventListener("input", e => { if (e.target.classList.contains("np")) syncContrato(); });
  $("addV").onclick = () => { addVeiculo(); syncContrato(); };
  addVeiculo();

  const lerVeiculos = () => [...$("veiculos").children].map(tr => ({
    mm: tr.querySelector(".mm").value.trim(), pl: tr.querySelector(".pl").value.trim(),
    ch: tr.querySelector(".ch").value.trim(), np: tr.querySelector(".np").value.trim(),
    tp: tr.querySelector(".tp").value, ps: tr.querySelector(".ps").value.trim() }));

  const AVISO_EXC = "Exclusão: a placa passará por avaliação de acionamentos. Se houve acionamento, a exclusão não gera valor a devolver. O valor calculado é apenas uma estimativa até o retorno da análise.";
  // Aviso de substituição: a placa é analisada internamente antes de qualquer cálculo
  function avisoSub() {
    const todos = lerVeiculos(), subs = todos.filter(v => v.tp === "SUBSTITUIÇÃO");
    $("avisoExc").hidden = !todos.some(v => v.tp === "EXCLUSÃO");
    $("avisoExc").textContent = AVISO_EXC;
    $("avisoSub").hidden = !subs.length;
    if (!subs.length) return;
    $("avisoSub").textContent = "Antes de prosseguir com a substituição a placa informada passará por análise interna e após o retorno da análise, retornamos com o cálculo da substituição.";
  }

  function etapa(n) { $("etapa1").hidden = n !== 1; $("etapa2").hidden = n !== 2; }
  $("irCalculo").onclick = () => {
    const todos = lerVeiculos(), subs = todos.filter(v => v.tp === "SUBSTITUIÇÃO"), vs = todos.filter(v => v.tp !== "SUBSTITUIÇÃO");
    if (!todos.length || todos.some(v => !v.mm || !v.pl || !v.ch)) { $("erro1").textContent = "Preencha marca/modelo, placa e chassi de todos os veículos."; return; }
    if (subs.some(v => !v.ps)) { $("erro1").textContent = "Informe a placa do veículo substituído."; return; }
    avisoSub();
    $("erro1").textContent = "";
    $("linhas").innerHTML = ""; $("mesmaCat").checked = false; $("mesmaData").checked = false;
    vs.forEach(v => {
      const tr = document.createElement("tr"); tr.dataset.tp = v.tp; tr._v = v;
      tr.innerHTML = `<td>${esc(v.mm)}<br><small>${esc(v.pl)}</small></td><td>${v.tp}</td>
        <td><input class="dt" type="date"></td><td><input class="vi" type="number" step="0.01" min="0"></td>
        <td class="n r-dias">-</td><td class="n r-val">-</td>`;
      $("linhas").appendChild(tr);
    });
    subsPend = subs; $("blocoCalc").hidden = !vs.length;
    $("avisoExc2").hidden = !vs.some(v => v.tp === "EXCLUSÃO"); $("avisoExc2").textContent = AVISO_EXC;
    $("avisoSub2").hidden = !subs.length;
    $("avisoSub2").innerHTML = subs.length ? `Em análise interna (fora do cálculo): ${subs.map(v => esc(v.pl)).join(", ")}.` : "";
    const nomes = [...new Set(todos.map(v => v.tp.toLowerCase()))];
    $("termoTipo").textContent = nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes.at(-1) : nomes[0];
    $("mesmaCatBox").hidden = $("mesmaDataBox").hidden = vs.length < 2;
    resetTermo(); recalcular(); etapa(2);
  };
  $("voltar").onclick = () => etapa(1);

  // Importação de planilha (modelo: aba FROTA)
  const COLS = ["MARCA","MODELO","TIPO","FAB","MOD","PLACA","CHASSI"];
  // Aceita FAB/MOD, Ano fab/Ano mod ou Ano fabricação/Ano modelo (sempre em colunas separadas)
  const ALIAS = { FAB:["FAB","ANO FAB","ANO FABRICACAO","ANO DE FABRICACAO"], MOD:["MOD","ANO MOD","ANO MODELO","ANO DE MODELO"] };
  const canon = c => { const n = norm(c).replace(/[^A-Z0-9]+/g, " ").trim(); return Object.keys(ALIAS).find(k => ALIAS[k].includes(n)) || norm(c); };
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  $("modelo").onclick = () => {
    const csv = "﻿QTD;MARCA;MODELO;TIPO;FAB;MOD;PLACA;CHASSI\n1;SR;RANDON SR CC;SEMI REBOQUE;2011;2012;AUX7D92;9ADK1243BCM330714\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" })); a.download = "modelo-frota.csv"; a.click();
  };

  async function inflar(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function lerZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), arq = {};
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Arquivo não é um .xlsx válido.");
    let n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true);
    for (; n > 0; n--) {
      const met = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
            el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true),
            nome = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), dados = u8.subarray(ini, ini + tam);
      arq[nome] = { met, dados }; p += 46 + nl + el + cl;
    }
    return async nome => { const f = arq[nome]; if (!f) return null; return dec.decode(f.met === 8 ? await inflar(f.dados) : f.dados); };
  }
  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  const colIdx = ref => [...ref.replace(/\d/g, "")].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  async function lerXlsx(buf) {
    const get = await lerZip(buf);
    const wb = xml(await get("xl/workbook.xml")), rels = xml(await get("xl/_rels/workbook.xml.rels"));
    const aba = [...wb.getElementsByTagName("sheet")].find(s => norm(s.getAttribute("name")) === "FROTA");
    if (!aba) throw new Error('Aba "FROTA" não encontrada. Use o modelo de planilha.');
    const rid = aba.getAttribute("r:id") || aba.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let alvo = [...rels.getElementsByTagName("Relationship")].find(r => r.getAttribute("Id") === rid).getAttribute("Target");
    alvo = alvo.startsWith("/") ? alvo.slice(1) : "xl/" + alvo;
    const ss = await get("xl/sharedStrings.xml");
    const strs = ss ? [...xml(ss).getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join("")) : [];
    const linhas = [];
    for (const row of xml(await get(alvo)).getElementsByTagName("row")) {
      const r = []; 
      for (const c of row.getElementsByTagName("c")) {
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent;
        r[colIdx(c.getAttribute("r"))] = t === "s" ? strs[+v] : t === "inlineStr" ? c.textContent : v;
      }
      linhas[+row.getAttribute("r") - 1] = r;
    }
    return linhas;
  }
  function lerCsv(txt) {
    const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    return txt.replace(/^﻿/, "").split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, "")));
  }

  // Valida com base no modelo; devolve { veiculos, erros }
  function validarFrota(linhas) {
    const hi = linhas.findIndex(r => r && r.some(c => norm(c) === "PLACA"));
    if (hi < 0) return { erros: ["Cabeçalho não encontrado. A planilha precisa ter a coluna PLACA (veja o modelo)."] };
    const idx = {}; (linhas[hi] || []).forEach((c, i) => { if (c != null) idx[canon(c)] = i; });
    const falta = COLS.filter(c => !(c in idx));
    if (falta.length) return { erros: ["Colunas ausentes no modelo: " + falta.map(c => c === "FAB" ? "FAB (ou Ano fab / Ano fabricação)" : c === "MOD" ? "MOD (ou Ano mod / Ano modelo)" : c).join(", ") + "."] };
    const erros = [], veiculos = [], placas = new Set(), chassis = new Set(), existentes = lerVeiculos();
    existentes.forEach(v => { placas.add(norm(v.pl).replace(/[- ]/g, "")); chassis.add(norm(v.ch)); });
    for (let i = hi + 1; i < linhas.length; i++) {
      const r = linhas[i]; if (!r) continue;
      const g = c => String(r[idx[c]] ?? "").trim(), n = i + 1;
      const marca = g("MARCA"), modelo = g("MODELO"), pl = norm(g("PLACA")).replace(/[- ]/g, ""), ch = norm(g("CHASSI"));
      if (!marca && !modelo && !pl && !ch) continue; // linha vazia ou só de totais/fórmulas
      const e = [];
      if (!marca || !modelo) e.push("marca/modelo obrigatórios");
      if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(pl)) e.push("placa inválida (" + (pl || "vazia") + ")");
      else if (placas.has(pl)) e.push("placa repetida (" + pl + ")");
      if (!/^[A-Z0-9]{17}$/.test(ch)) e.push("chassi deve ter 17 caracteres");
      else if (chassis.has(ch)) e.push("chassi repetido");
      for (const c of ["FAB","MOD"]) { const v = g(c); if (v && !(/^\d{4}$/.test(v) && v >= 1950 && v <= 2100)) e.push(c + " inválido (" + v + ")"); }
      if (e.length) erros.push(`Linha ${n}: ` + e.join("; "));
      else { placas.add(pl); chassis.add(ch); veiculos.push({ mm: (marca + " " + modelo).trim(), pl, ch }); }
    }
    if (!veiculos.length && !erros.length) erros.push("Nenhum veículo encontrado na planilha.");
    return { veiculos, erros };
  }
  $("arq").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $("erroImp").textContent = ""; $("listaErros").hidden = true; $("listaErros").innerHTML = "";
    try {
      const linhas = /\.csv$/i.test(f.name) ? lerCsv(await f.text()) : await lerXlsx(await f.arrayBuffer());
      const { veiculos, erros } = validarFrota(linhas);
      if (erros.length) {
        $("erroImp").textContent = `Planilha fora do modelo: ${erros.length} problema(s). Nenhum veículo foi importado.`;
        $("listaErros").innerHTML = erros.map(x => `<li>${esc(x)}</li>`).join(""); $("listaErros").hidden = false;
      } else {
        const vazio = lerVeiculos().length === 1 && !lerVeiculos()[0].mm && !lerVeiculos()[0].pl && !lerVeiculos()[0].ch;
        if (vazio) $("veiculos").innerHTML = "";
        veiculos.forEach(v => addVeiculo({ ...v, tp: $("tipoImp").value })); avisoSub(); syncContrato();
        $("erroImp").style.color = "inherit"; $("erroImp").textContent = `${veiculos.length} veículo(s) importado(s) como ${$("tipoImp").value.toLowerCase()}.`;
      }
    } catch (err) { $("erroImp").textContent = "Não foi possível ler a planilha: " + err.message; }
    e.target.value = "";
  };

  // Etapa 2
  let total = null, subsPend = [], enviando = false;
  function recalcular() {
    $("erroCalc").textContent = "";
    let tv = 0, erro = "", completo = true;
    const vig = $("vig").value ? parse($("vig").value) : null;
    for (const tr of $("linhas").children) {
      const q = s => tr.querySelector(s), data = q(".dt").value, vi = parseFloat(q(".vi").value);
      const set = (a,d) => { q(".r-dias").textContent=a; q(".r-val").textContent=d; };
      if (!vig || !data || isNaN(vi)) { set("-","-"); completo = false; continue; }
      try {
        const r = calcularEndosso({ vigencia: vig, data: parse(data), valorInicial: vi, tipo: tr.dataset.tp });
        set(r.dias, brl(r.valor)); tv += r.valor;
      } catch (e) { set("-","-"); erro = e.message; completo = false; }
    }
    $("tV").textContent = brl(tv); $("erroCalc").textContent = erro;
    const n = $("linhas").children.length;
    total = (n ? completo && !erro : subsPend.length > 0) ? tv : null;
    $("termoBox").hidden = total === null;
    if (total === null) resetTermo();
  }
  // Mesma categoria: repete o valor inicial do primeiro veículo nos demais
  function syncValor() {
    const rows = [...$("linhas").children];
    const rep = (cls, on) => rows.forEach((tr, i) => {
      const el = tr.querySelector(cls);
      if (i === 0) return;
      el.disabled = on; if (on) el.value = rows[0].querySelector(cls).value;
    });
    rep(".vi", $("mesmaCat").checked); rep(".dt", $("mesmaData").checked);
  }
  $("etapa2").addEventListener("input", () => { syncValor(); recalcular(); });
  $("mesmaCat").onchange = $("mesmaData").onchange = () => { syncValor(); recalcular(); };

  // Termo e prosseguir
  function resetTermo() { $("termo").setAttribute("aria-pressed","false"); $("prosseguir").hidden = true; $("okMsg").hidden = true; }
  $("termo").onclick = () => {
    const on = $("termo").getAttribute("aria-pressed") !== "true";
    $("termo").setAttribute("aria-pressed", on); $("prosseguir").hidden = !on; $("okMsg").hidden = true;
  };
  $("prosseguir").onclick = async () => {
    if (enviando || total === null) return;
    enviando = true; $("prosseguir").disabled = true; $("erroEnvio").textContent = "";
    try {
      const calc = [...$("linhas").children].map(tr => ({ marca_modelo: tr._v.mm, placa: tr._v.pl, chassi: tr._v.ch, contrato: tr._v.np,
        tipo: tr._v.tp, data_endosso: tr.querySelector(".dt").value, valor_inicial: parseFloat(tr.querySelector(".vi").value) }));
      const subs = subsPend.map(v => ({ marca_modelo: v.mm, placa: v.pl, chassi: v.ch, contrato: v.np, tipo: v.tp, placa_substituida: v.ps }));
      const { solicitacao: s } = await API.post("/solicitacoes", { vigencia: $("vig").value, veiculos: [...calc, ...subs] });
      $("prosseguir").hidden = true; $("termo").disabled = true;
      $("okMsg").hidden = false;
      $("okMsg").innerHTML = `<b>Solicitação nº ${s.id} registrada</b> em ${fmtDataHora(s.criado_em)} para ${s.veiculos.length} veículo(s).<br>
        Acompanhe em <a href="#/minhas">Minhas solicitações</a>.`;
    } catch (err) { $("erroEnvio").textContent = err.message; $("prosseguir").disabled = false; }
    enviando = false;
  };

  // Reinicia o assistente para uma nova solicitação
  function resetWizard() {
    $("veiculos").innerHTML = ""; addVeiculo(); $("repContrato").checked = false;
    $("linhas").innerHTML = ""; $("vig").value = ""; $("mesmaCat").checked = $("mesmaData").checked = false;
    $("termo").disabled = false; $("prosseguir").disabled = false; $("erroEnvio").textContent = "";
    ["erro1","erroImp"].forEach(i => $(i).textContent = ""); $("listaErros").hidden = true; $("avisoSub").hidden = $("avisoExc").hidden = true;
    subsPend = []; total = null; resetTermo(); etapa(1);
  }
