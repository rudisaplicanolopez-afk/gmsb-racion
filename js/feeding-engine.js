/* Motor de cálculo de la ración teórica diaria, replicando la curva
   de crecimiento y alimentación tipo Nicovita usada en el Excel de referencia. */

const KG_PER_LB = 2.2046;
const G_PER_LB = 454;

// Constantes de la curva Nicovita (idénticas al Excel de referencia).
const K_PESO = 0.0231;
const EXP_PESO = 1.3758;
const K_TA = 4.2847;
const EXP_TA = -0.2869;

// ============== TABLAS DE REFERENCIA DE ALIMENTACIÓN ==============
// 'nicovita' : % de la biomasa según la curva Nicovita (usa TA30). Es la de siempre.
// 'aqh_gramo': gramos de alimento por camarón al día según su peso (hoja
//              "Consumo" del Excel TABLA AQH). kg/día = camarones × g ÷ 454 ÷ 2.2,
//              igual que la fórmula del Excel.
// En ambas el peso TEÓRICO sale de la curva de crecimiento (TC30); la tabla
// solo cambia CUÁNTO alimento se da para ese peso.
const TABLA_POR_DEFECTO = 'nicovita';
const TABLAS_REFERENCIA = {
  nicovita:  { nombre: 'Nicovita (% biomasa)' },
  aqh_gramo: {
    nombre: 'AQH (g por camarón)',
    fincas: ['AQH'], // tabla propia de AQH: solo se ofrece y se aplica en esa finca
    // [peso del camarón (g), g de alimento por camarón al día]
    puntos: [
      [0.5, 0.03], [1, 0.06], [1.5, 0.08], [2, 0.14], [2.5, 0.16], [3, 0.2],
      [3.5, 0.25], [4, 0.26], [4.5, 0.28], [5, 0.29], [5.5, 0.31], [6, 0.33],
      [6.5, 0.35], [7, 0.37], [7.5, 0.39], [8, 0.41], [8.5, 0.42], [9, 0.43],
      [9.5, 0.44], [10, 0.45], [10.5, 0.46], [11, 0.47], [11.5, 0.48], [12, 0.49],
      [12.5, 0.51], [13, 0.52], [13.5, 0.54], [14, 0.56], [14.5, 0.58], [15, 0.59],
      [15.5, 0.6], [16, 0.61], [16.5, 0.61], [17, 0.61], [17.5, 0.61], [18, 0.61],
      [19, 0.61], [20, 0.61], [21, 0.61], [22, 0.61],
    ],
  },
};

// Tablas disponibles para una finca (las que no indican fincas valen para todas).
function tablasDeFinca(finca) {
  return Object.keys(TABLAS_REFERENCIA).filter((k) => {
    const f = TABLAS_REFERENCIA[k].fincas;
    return !f || f.includes(finca);
  });
}

// Tabla que usa la laguna. Si tiene una tabla que no corresponde a su finca
// (ej. AQH en una laguna de GMSB), se usa la de por defecto. Lagunas antiguas
// sin finca se consideran de GMSB.
function tablaDe(laguna) {
  const t = laguna && laguna.tablaRef;
  const finca = (laguna && laguna.finca) || 'GMSB';
  return (TABLAS_REFERENCIA[t] && tablasDeFinca(finca).includes(t)) ? t : TABLA_POR_DEFECTO;
}

// g de alimento por camarón al día para un peso. En los pesos de la tabla da
// exactamente el valor del Excel; entre dos filas interpola en línea recta
// (el BUSCARV exacto del Excel daría error con pesos como 12.3 g). Fuera del
// rango se usa el primer / último valor.
function gramosPorCamaron(pesoG, tabla = 'aqh_gramo') {
  const pts = TABLAS_REFERENCIA[tabla] && TABLAS_REFERENCIA[tabla].puntos;
  if (!pts || !(pesoG > 0)) return 0;
  if (pesoG <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (pesoG <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + (y1 - y0) * (pesoG - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// Ración (kg/día, sin factor de consumo) según la tabla de la laguna.
// Devuelve también la tasa como fracción de la biomasa para mostrarla.
function racionBase(animales, pesoG, laguna) {
  if (tablaDe(laguna) === 'aqh_gramo') {
    const gCam = gramosPorCamaron(pesoG);
    return {
      kg: (animales * gCam) / G_PER_LB / 2.2, // misma fórmula del Excel AQH
      ta: pesoG > 0 ? gCam / pesoG : 0,
      gCamDia: gCam,
    };
  }
  const ta = porcentajeTA(pesoG, laguna);
  const biomasaLb = (animales * pesoG) / G_PER_LB;
  return { kg: (biomasaLb * ta) / KG_PER_LB, ta, gCamDia: null };
}

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

function calcularRacion(laguna, fechaReferencia = new Date(), diaForzado = null) {
  // diaForzado permite ver un día específico (navegación anterior/futuro).
  const diaCultivo = (diaForzado != null)
    ? Number(diaForzado)
    : diaCultivoDesde(laguna.fechaSiembra, fechaReferencia);
  const diasProyectados = Number(laguna.diasProyectados) || 0;

  if (diaCultivo < 1) {
    return { diaCultivo, fueraDeRango: true, motivo: 'aun-no-siembra' };
  }
  if (diaCultivo > diasProyectados) {
    return { diaCultivo, fueraDeRango: true, motivo: 'proyecto-finalizado' };
  }

  const pesoG = pesoTeoricoG(diaCultivo, laguna);
  const supervivencia = supervivenciaTeorica(diaCultivo, laguna);
  const sembrados = Number(laguna.sembrados) || 0;
  const tablaRef = tablaDe(laguna);
  const base = racionBase(sembrados * supervivencia, pesoG, laguna);
  const ta = base.ta;
  const areaHa = Number(laguna.areaHa) || 0;

  // Factor de consumo (triángulo de arrastre): 100/75/50/25/0 %. Ahora ajusta
  // TANTO la ración teórica como la real. Por defecto 100%.
  const consumoPct = (laguna.consumoPct !== undefined && laguna.consumoPct !== '' && laguna.consumoPct !== null)
    ? Number(laguna.consumoPct) : 100;
  const factor = consumoPct / 100;

  const biomasaLb = (sembrados * supervivencia * pesoG) / G_PER_LB;
  const kgDia = base.kg * factor;
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
    consumoPct,
    tablaRef,
    gCamDia: base.gCamDia, // solo con la tabla por gramo
  };

  // Ración REAL: si el usuario registró un peso real, se calcula la ración con
  // ese peso y con la sobrevivencia real (si la registró). Ambos son manuales y
  // persisten hasta que el usuario los edite de nuevo.
  const pesoReal = Number(laguna.pesoReal) || 0;
  if (pesoReal > 0) {
    const survRealPct = Number(laguna.supervivenciaReal) || 0;
    const survReal = survRealPct > 0 ? survRealPct / 100 : supervivencia;
    const baseReal = racionBase(sembrados * survReal, pesoReal, laguna);
    const taReal = baseReal.ta;
    const biomasaRealLb = (sembrados * survReal * pesoReal) / G_PER_LB;
    const kgReal = baseReal.kg * factor;
    const lbReal = Math.floor(kgReal * KG_PER_LB);
    // Animales por tolva = (sembrados × sobrevivencia real) ÷ nº de tolvas.
    const tolvas = Number(laguna.tolvas) || 0;
    const animalesVivos = sembrados * survReal;
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
      fca: Number(laguna.fca) || null, // solo informativo, no afecta la ración
      consumoPct,
      tablaRef,
      gCamDia: baseReal.gCamDia,
      tolvas,
      animalesVivos,
      animalesPorTolva: tolvas > 0 ? animalesVivos / tolvas : null,
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
  gramosPorCamaron,
  tablaDe,
  tablasDeFinca,
  TABLAS_REFERENCIA,
  TABLA_POR_DEFECTO,
};
