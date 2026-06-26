/* Motor de cálculo de la ración teórica diaria, replicando la curva
   de crecimiento y alimentación tipo Nicovita usada en el Excel de referencia. */

const KG_PER_LB = 2.2046;
const G_PER_LB = 454;

// Constantes de la curva Nicovita (idénticas al Excel de referencia).
const K_PESO = 0.0231;
const EXP_PESO = 1.3758;
const K_TA = 4.2847;
const EXP_TA = -0.2869;

// TC30 y TA30 se ingresan como porcentaje (ej. 230% se escribe "230").
function tc30Frac(laguna) { return (Number(laguna.tc30) || 0) / 100; }
function ta30Frac(laguna) { return (Number(laguna.ta30) || 0) / 100; }

// "Ajuste" de la curva (BM1 del Excel). Antes se ponía a mano; aquí se calcula
// automáticamente de modo que el peso del día 1 coincida con el peso de
// transferencia, usando: techo( (PesoTransf / (K·TC30))^(1/EXP) ).
// Verificado contra 7 lagunas del Excel (201A,202A,204A,208A,213A,212A,V0410A).
function ajusteCurva(laguna) {
  const tc = tc30Frac(laguna);
  const transf = Number(laguna.pesoTransferencia) || 0;
  if (tc <= 0 || transf <= 0) return 8; // valor típico de respaldo
  return Math.ceil(Math.pow(transf / (K_PESO * tc), 1 / EXP_PESO));
}

// Peso teórico del día (g): 0.0231 · (ajuste + día − 1)^1.3758 · TC30
function pesoTeoricoG(diaCultivo, laguna) {
  const tc = tc30Frac(laguna);
  const bm1 = ajusteCurva(laguna);
  return K_PESO * Math.pow(bm1 + diaCultivo - 1, EXP_PESO) * tc;
}

// Fracción de alimentación (TA): (4.2847 · peso^−0.2869 · TA30) / 100
function porcentajeTA(pesoG, laguna) {
  const ta = ta30Frac(laguna);
  if (pesoG <= 0) return 0;
  return (K_TA * Math.pow(pesoG, EXP_TA) * ta) / 100;
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
  const ta = porcentajeTA(pesoG, laguna);
  const sembrados = Number(laguna.sembrados) || 0;
  const areaHa = Number(laguna.areaHa) || 0;

  const biomasaLb = (sembrados * supervivencia * pesoG) / G_PER_LB;
  const kgDia = (biomasaLb * ta) / KG_PER_LB;
  const lbDia = Math.floor(kgDia * KG_PER_LB);
  const lbHaDia = areaHa > 0 ? (lbDia / areaHa) : 0;
  const sacos25kg = kgDia / 25;

  const r = {
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

  // Ración REAL: si el usuario registró un peso real, se calcula la ración con
  // ese peso y con la sobrevivencia real (si la registró). Ambos son manuales y
  // persisten hasta que el usuario los edite de nuevo.
  const pesoReal = Number(laguna.pesoReal) || 0;
  if (pesoReal > 0) {
    const survRealPct = Number(laguna.supervivenciaReal) || 0;
    const survReal = survRealPct > 0 ? survRealPct / 100 : supervivencia;
    const taReal = porcentajeTA(pesoReal, laguna);
    const biomasaRealLb = (sembrados * survReal * pesoReal) / G_PER_LB;
    const kgReal = (biomasaRealLb * taReal) / KG_PER_LB;
    const lbReal = Math.floor(kgReal * KG_PER_LB);
    r.real = {
      pesoReal,
      supervivenciaPct: survReal * 100,
      supervivenciaEsReal: survRealPct > 0,
      taPct: taReal * 100,
      kgReal,
      lbReal,
      lbHaReal: areaHa > 0 ? (lbReal / areaHa) : 0,
      sacos25kg: kgReal / 25,
      biomasaLb: biomasaRealLb,
    };
  }

  return r;
}

window.FeedingEngine = {
  diaCultivoDesde,
  calcularRacion,
  pesoTeoricoG,
  porcentajeTA,
  supervivenciaTeorica,
};
