// Lógica pro rata (independente de interface)
function diasNoMes(ano, mes) { // mes: 1-12
  return new Date(ano, mes, 0).getDate();
}

// Dias entre duas datas (inclusivo nas duas pontas)
function diasEntre(inicio, fim) {
  const ms = Date.UTC(fim.getFullYear(), fim.getMonth(), fim.getDate()) -
             Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  return Math.round(ms / 86400000) + 1;
}

// valorMensal / diasDoPeriodo * diasUtilizados
function calcularProRata(valorMensal, diasPeriodo, diasUtilizados) {
  if (!(valorMensal >= 0) || diasPeriodo <= 0 || diasUtilizados < 0) {
    throw new Error("Valores inválidos");
  }
  if (diasUtilizados > diasPeriodo) throw new Error("Dias utilizados maior que o período");
  const valorDia = valorMensal / diasPeriodo;
  return { valorDia, total: valorDia * diasUtilizados };
}

if (typeof module !== "undefined") module.exports = { diasNoMes, diasEntre, calcularProRata };
