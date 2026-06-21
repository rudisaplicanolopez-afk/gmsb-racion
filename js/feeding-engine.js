/* Motor de cálculo de la ración teórica diaria, replicando la curva
   de crecimiento y alimentación tipo Nicovita usada en el Excel de referencia. */

const KG_PER_LB = 2.2046;
const G_PER_LB = 454;

// Bandas de etapa: el día de corte de cada etapa varía por laguna en el Excel
// (no siempre es 30/45/60/75 exacto), por eso son configurables con valor
// por defecto 30/45/60/75 si la laguna no especifica otra cosa.
function getEtapas(laguna) {
  const corte1 = Number(laguna.corte1) || 30;
  const corte2 = Number(laguna.corte2) || 45;
  const corte3 = Number(laguna.corte3) || 60;
  const corte4 = Number(laguna.corte4) || 75;
  return [
    { diaMax: corte1, ta: 'ta30', tc: 'tc30' },
    { diaMax: corte2, ta: 'ta45', tc: 'tc45' },
    { diaMax: corte3, ta: 'ta56', tc: 'tc56' },
    { diaMax: corte4, ta: 'ta75', tc: 'tc75' },
    { diaMax: Infinity, ta: 'taFinal', tc: 'tcFinal' },
  ];
}

function getEtapa(diaCultivo, laguna) {
  const etapas = getEtapas(laguna);
  return etapas.find((e) => diaCultivo <= e.diaMax) || etapas[etapas.length - 1];
}

// Los campos TA/TC y Mortalidad se ingresan como porcentaje, igual que se
// ven en el Excel (ej. 230% se escribe "230"), por eso se dividen entre 100.
function pesoTeoricoG(diaCultivo, laguna) {
  const etapa = getEtapa(diaCultivo, laguna);
  const tc = (Number(laguna[etapa.tc]) || 0) / 100;
  // La curva de crecimiento de cada laguna arranca con un pequeño corrimiento
  // (constante interna del Excel) que varía de laguna a laguna; "ajusteCurva"
  // lo deja configurable en vez de fijarlo en 7 para todas.
  const ajuste = laguna.ajusteCurva !== undefined && laguna.ajusteCurva !== ''
    ? Number(laguna.ajusteCurva)
    : 7;
  return 0.0231 * Math.pow(diaCultivo + ajuste, 1.3758) * tc;
}

function porcentajeTA(pesoG, diaCultivo, laguna) {
  const etapa = getEtapa(diaCultivo, laguna);
  const ta = (Number(laguna[etapa.ta]) || 0) / 100;
  if (pesoG <= 0) return 0;
  return (4.2847 * Math.pow(pesoG, -0.2869) * ta) / 100;
}

function supervivenciaTeorica(diaCultivo, laguna) {
  const mort1 = (Number(laguna.mortalidad1) || 0) / 100;
  const mort2 = (Number(laguna.mortalidad2) || 0) / 100;
  const diasProyec = Number(laguna.diasProyectados) || 1;
  const finFase1 = Math.min(29, diasProyec);

  if (diaCultivo <= 1) return 1;

  if (diaCultivo <= finFase1 + 1) {
    // Días 2..30: declive lineal según Mortalidad 1 repartida en 29 días
    const pasos = diaCultivo - 1;
    return 1 - pasos * (mort1 / 29);
  }

  // Después del día 30: declive según Mortalidad 2 repartida en los días restantes
  const survFinFase1 = 1 - finFase1 * (mort1 / 29);
  const pasosFase2 = diaCultivo - (finFase1 + 1);
  const restantes = Math.max(diasProyec - 29, 1);
  return survFinFase1 - pasosFase2 * (mort2 / restantes);
}

function diaCultivoDesde(fechaSiembra, fechaReferencia = new Date()) {
  const ms = startOfDay(fechaReferencia) - parseFechaLocal(fechaSiembra).getTime();
  return Math.floor(ms / 86400000) + 1;
}

// Los inputs <input type="date"> entregan "YYYY-MM-DD"; Date() los interpreta
// como UTC, lo que desplaza el día al comparar con horas locales. Se parsea
// manualmente como fecha local para evitar ese desfase de ±1 día.
function parseFechaLocal(fechaStr) {
  if (fechaStr instanceof Date) return startOfDayDate(fechaStr);
  const [y, m, d] = String(fechaStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDayDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfDay(d) {
  return startOfDayDate(d).getTime();
}

function calcularRacion(laguna, fechaReferencia = new Date()) {
  const diaCultivo = diaCultivoDesde(laguna.fechaSiembra, fechaReferencia);
  const diasProyectados = Number(laguna.diasProyectados) || 0;

  if (diaCultivo < 1) {
    return { diaCultivo, fueraDeRango: true, motivo: 'aun-no-siembra' };
  }
  if (diaCultivo > diasProyectados) {
    return { diaCultivo, fueraDeRango: true, motivo: 'proyecto-finalizado' };
  }

  const pesoG = pesoTeoricoG(diaCultivo, laguna);
  const supervivencia = supervivenciaTeorica(diaCultivo, laguna);
  const ta = porcentajeTA(pesoG, diaCultivo, laguna);
  const sembrados = Number(laguna.sembrados) || 0;

  const biomasaLb = (sembrados * supervivencia * pesoG) / G_PER_LB;
  const kgDia = (biomasaLb * ta) / KG_PER_LB;
  const lbDia = Math.floor(kgDia * KG_PER_LB);
  const areaHa = Number(laguna.areaHa) || 0;
  const lbHaDia = areaHa > 0 ? (lbDia / areaHa) : 0;
  const sacos25kg = kgDia / 25;

  return {
    diaCultivo,
    fueraDeRango: false,
    pesoG,
    supervivenciaPct: supervivencia * 100,
    taPct: ta * 100,
    biomasaLb,
    kgDia,
    lbDia,
    lbHaDia,
    sacos25kg,
  };
}

window.FeedingEngine = {
  diaCultivoDesde,
  calcularRacion,
  pesoTeoricoG,
  porcentajeTA,
  supervivenciaTeorica,
};
