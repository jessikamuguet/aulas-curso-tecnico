// Lógica pro rata de endossos (baseada na planilha "Base para cálculos")
// dias = data do endosso - vigência inicial
// custo dia = valor inicial / 365
// custo devido = custo dia * dias
// valor = valor inicial - custo devido (negativo em exclusões = estorno)
// comissão = valor * % comissão
const BASE_DIAS = 365;

function diasEntre(vigencia, data) {
  const ms = Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) -
             Date.UTC(vigencia.getFullYear(), vigencia.getMonth(), vigencia.getDate());
  return Math.round(ms / 86400000);
}

function calcularEndosso({ vigencia, data, valorInicial, comissao, tipo }) {
  const dias = diasEntre(vigencia, data);
  if (dias < 0) throw new Error("A data do endosso é anterior à vigência inicial.");
  if (dias > BASE_DIAS) throw new Error("A data do endosso passa de 365 dias da vigência.");
  const custoDia = valorInicial / BASE_DIAS;
  const custoDevido = custoDia * dias;
  let valor = valorInicial - custoDevido;
  if (tipo === "EXCLUSÃO") valor = -valor;
  return { dias, custoDia, custoDevido, valor, comissao: valor * comissao };
}

if (typeof module !== "undefined") module.exports = { diasEntre, calcularEndosso };
