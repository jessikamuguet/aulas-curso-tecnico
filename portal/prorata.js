// Lógica pro rata de endossos (baseada na planilha "Base para cálculos")
// dias = data do endosso - vigência inicial
// custo dia = valor inicial / 365
// custo devido = custo dia * dias
// saldo a vencer = valor inicial - custo devido
// INCLUSÃO: valor = saldo do veículo incluído
// EXCLUSÃO: valor = -(saldo do veículo excluído)  (estorno)
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
  if (tipo === "EXCLUSÃO") valor = -novo.saldo;
  else valor = novo.saldo;
  return { dias, custoDia: novo.custoDia, custoDevido: novo.custoDevido, valor };
}

if (typeof module !== "undefined") module.exports = { diasEntre, saldoProRata, calcularEndosso };
