// Lógica pro rata de endossos (baseada na planilha "Base para cálculos")
// dias = data do endosso - vigência inicial
// custo dia = valor inicial / 365
// custo devido = custo dia * dias
// saldo a vencer = valor inicial - custo devido
// INCLUSÃO: valor = saldo do veículo incluído
// EXCLUSÃO: valor = -(saldo do veículo excluído), sempre negativo (estorno)
// SUBSTITUIÇÃO: não é calculada no portal (análise interna da placa antes)
const BASE_DIAS = 365;

function diasEntre(vigencia, data) {
  const ms = Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) -
             Date.UTC(vigencia.getFullYear(), vigencia.getMonth(), vigencia.getDate());
  return Math.round(ms / 86400000);
}

function saldoProRata(valorInicial, dias) {
  const custoDia = valorInicial / BASE_DIAS;
  const custoDevido = custoDia * dias;
  return { custoDia, custoDevido, saldo: valorInicial - custoDevido };
}

function calcularEndosso({ vigencia, data, valorInicial, tipo }) {
  if (tipo === "SUBSTITUIÇÃO") throw new Error("Substituição depende de análise interna da placa.");
  const dias = diasEntre(vigencia, data);
  if (dias < 0) throw new Error("A data do endosso é anterior à vigência inicial.");
  if (dias > BASE_DIAS) throw new Error("A data do endosso passa de 365 dias da vigência.");
  const novo = saldoProRata(valorInicial, dias);
  let valor;
  if (tipo === "EXCLUSÃO") valor = -Math.abs(novo.saldo); // exclusão é sempre negativa
  else valor = novo.saldo;
  return { dias, custoDia: novo.custoDia, custoDevido: novo.custoDevido, valor };
}



// Prazo de retorno: 48 horas úteis (seg a sex, das 08:00 às 17:00, horário de Brasília) a partir da solicitação.
// Pedido fora do expediente começa a contar no próximo dia útil às 08:00. Feriados não são considerados.
function prazoHorasUteis(inicio, horas = 48) {
  const H0 = 8, H1 = 17;
  let d = new Date(inicio.getTime() - 3 * 3600e3); // relógio de Brasília nos campos UTC
  const em = (dt, h) => new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h));
  const util = dt => dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6;
  const proxDia = dt => { let n = em(dt, H0); do { n = new Date(n.getTime() + 86400e3); } while (!util(n)); return n; };
  if (!util(d) || d >= em(d, H1)) d = proxDia(d); else if (d < em(d, H0)) d = em(d, H0);
  let resto = horas * 3600e3;
  for (;;) {
    const disp = em(d, H1) - d;
    if (resto <= disp) return new Date(d.getTime() + resto + 3 * 3600e3);
    resto -= disp; d = proxDia(d);
  }
}
if (typeof module !== "undefined") module.exports = { diasEntre, saldoProRata, calcularEndosso, prazoHorasUteis };
