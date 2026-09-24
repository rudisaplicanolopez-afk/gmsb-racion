/* Wiring de la UI: lista de lagunas, formulario y vista de ración del día. */

let lagunaSeleccionadaId = null;

// ============== FINCAS (cada finca tiene sus propias zonas) ==============
// Mismo modelo que BitFeed. Las lagunas se filtran por finca para que la
// información de una finca no se mezcle con la de otra.
const FINCAS = {
  GMSB:    { nombre: 'GMSB',    zonas: [1, 2, 3, 4, 5] },
  CRIMASA: { nombre: 'CRIMASA', zonas: [1, 2, 4] },
  CADELPA: { nombre: 'CADELPA', zonas: [1, 2] },
  AQH:     { nombre: 'AQH',     zonas: [] },
  SFH:     { nombre: 'SFH',     zonas: [] },
};
const LISTA_FINCAS = Object.keys(FINCAS);
const FINCA_POR_DEFECTO = 'GMSB';
const zonasDeFinca = (f) => (FINCAS[f] && FINCAS[f].zonas) || [];
// Normaliza la finca de una laguna a una de la lista (datos antiguos → GMSB).
const fincaDe = (l) => (l && LISTA_FINCAS.includes(l.finca)) ? l.finca : FINCA_POR_DEFECTO;

let fincaActiva = FINCA_POR_DEFECTO; // finca en uso (el admin la elige; el usuario queda fijo en la suya)
function puedeElegirFinca() { return !!(window.Perfil && window.Perfil.rol === 'admin'); }
function fincaDelPerfil() {
  return (window.Perfil && LISTA_FINCAS.includes(window.Perfil.finca)) ? window.Perfil.finca : FINCA_POR_DEFECTO;
}

const FIELDS = [
  'nombre', 'zona', 'finca', 'areaHa', 'fechaSiembra', 'densidad', 'sembrados',
  'tolvas', 'pesoTransferencia', 'diasProyectados', 'mortalidad1', 'mortalidad2',
  'ta30', 'tc30',
];
// El peso real, la sobrevivencia real y el FCA ya NO se ingresan en el
// formulario: provienen de la última biometría registrada en la gráfica.

// Zonas que el usuario puede ver, SIEMPRE dentro de la finca activa.
// Admin: todas las de la finca. Usuario: solo las suyas que existan en la finca.
function zonasPermitidas() {
  const deFinca = zonasDeFinca(fincaActiva);
  if (window.Perfil && window.Perfil.rol === 'admin') return deFinca.slice();
  if (window.Perfil && Array.isArray(window.Perfil.zonas)) {
    return window.Perfil.zonas.map(Number).filter((z) => deFinca.includes(z)).sort((a, b) => a - b);
  }
  return [];
}

// Llena el <select> de zona del FORMULARIO con las zonas de la finca indicada.
function poblarSelectorZona(finca) {
  const sel = document.getElementById('zona');
  if (!sel) return;
  const f = finca || (document.getElementById('finca') && document.getElementById('finca').value) || fincaActiva;
  const zonas = zonasDeFinca(f);
  sel.innerHTML = zonas.length
    ? zonas.map((z) => `<option value="${z}">Zona ${z}</option>`).join('')
    : '<option value="">— sin zonas —</option>';
  sel.disabled = !zonas.length;
}

// Llena el <select> de finca del FORMULARIO con la lista de fincas.
function poblarSelectorFincaForm() {
  const sel = document.getElementById('finca');
  if (!sel) return;
  sel.innerHTML = LISTA_FINCAS.map((f) => `<option value="${f}">${FINCAS[f].nombre}</option>`).join('');
}

// Llena el selector de FINCA ACTIVA (arriba). Admin: todas; usuario: solo la suya.
function poblarFiltroFinca() {
  const sel = document.getElementById('filtroFinca');
  const cont = document.getElementById('filtroFincaCont');
  if (!sel) return;
  if (puedeElegirFinca()) {
    sel.innerHTML = LISTA_FINCAS.map((f) => `<option value="${f}">${FINCAS[f].nombre}</option>`).join('');
    sel.disabled = false;
  } else {
    const f = fincaDelPerfil();
    sel.innerHTML = `<option value="${f}">${FINCAS[f].nombre}</option>`;
    sel.disabled = true;
  }
  if (!LISTA_FINCAS.includes(fincaActiva)) fincaActiva = FINCA_POR_DEFECTO;
  sel.value = fincaActiva;
  if (cont) cont.style.display = 'flex';
}

let zonaFiltro = 'todas';
let diaVista = null;      // null = hoy; número = día seleccionado
let diaMostrado = null;   // día que se está mostrando actualmente
let listaBiometriasAbierta = false; // la lista de mediciones arranca oculta
let panelUsuariosAbierto = false;   // la lista de usuarios (admin) arranca oculta
let animarRacion = false;           // anima números/barra solo al seleccionar laguna

// ¿Se puede animar? No si la pestaña está oculta o el usuario pidió menos movimiento.
function puedeAnimar() {
  try { return !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return true; }
}

// Efecto count-up: anima los números con [data-count] dentro de un contenedor.
// Si no se puede animar, deja el valor final (que ya viene renderizado en el texto).
function animarNumeros(root) {
  if (!root || !puedeAnimar()) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count) || 0;
    const dec = parseInt(el.dataset.dec || '0', 10);
    const suf = el.dataset.suf || '';
    let t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      let p = Math.min(1, (t - t0) / 800);
      p = 1 - Math.pow(1 - p, 3);
      const val = target * p;
      el.textContent = (dec ? val.toFixed(dec) : Math.round(val).toLocaleString('es')) + suf;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// Aplica las animaciones del panel de ración (números + barra) si corresponde.
function aplicarAnimRacion(animate) {
  const cont = document.getElementById('racionContenido');
  if (!cont || !animate || !puedeAnimar()) return;
  animarNumeros(cont);
  const fill = cont.querySelector('.prog-fill');
  if (fill) {
    const w = fill.style.width;
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = w; });
  }
}

function renderListaLagunas() {
  let lagunas = Storage.getLagunas();
  const cont = document.getElementById('listaLagunas');
  const vacio = document.getElementById('sinLagunas');
  cont.innerHTML = '';

  // Filtrar SIEMPRE por finca activa (no se mezclan datos entre fincas).
  lagunas = lagunas.filter((l) => fincaDe(l) === fincaActiva);
  // Filtrar por zona seleccionada
  if (zonaFiltro !== 'todas') {
    lagunas = lagunas.filter((l) => String(l.zona) === String(zonaFiltro));
  }
  // Ordenar de menor a mayor por código (orden natural: L0201 < L0202 < ...)
  lagunas = lagunas.slice().sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), undefined, { numeric: true, sensitivity: 'base' })
  );

  vacio.style.display = lagunas.length ? 'none' : 'block';
  if (!lagunas.length) {
    const totalGlobal = Storage.getLagunas().length;
    const enFinca = Storage.getLagunas().filter((l) => fincaDe(l) === fincaActiva).length;
    if (zonaFiltro !== 'todas' && enFinca) {
      vacio.innerHTML = 'No hay lagunas en esta zona.';
    } else if (totalGlobal && !enFinca) {
      vacio.innerHTML = `No hay lagunas en la finca <strong>${fincaActiva}</strong>. Toca <strong>➕ Nueva laguna</strong> para crear una aquí.`;
    } else {
      vacio.innerHTML = 'Aún no has registrado ninguna laguna. Toca <strong>➕ Nueva laguna</strong> para crear la primera.';
    }
  }

  lagunas.forEach((l) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-laguna' + (l.id === lagunaSeleccionadaId ? ' activo' : '');
    const est = estadoLaguna(l);
    const pct = (est.pct != null) ? `<small class="sem-pct">${est.pct >= 0 ? '+' : ''}${est.pct.toFixed(0)}%</small>` : '';
    chip.innerHTML = `<span class="sem sem-${est.clase}"></span><span>${l.nombre}</span>${pct}`;
    chip.title = 'Zona ' + (l.zona || '-') + (est.pct != null ? ` · crecimiento ${est.pct >= 0 ? '+' : ''}${est.pct.toFixed(0)}% vs esperado` : '');
    chip.onclick = () => seleccionarLaguna(l.id);
    cont.appendChild(chip);
  });

  const leyenda = document.getElementById('semLeyenda');
  if (leyenda) leyenda.hidden = !lagunas.length;
  renderResumen();
}

// Para MOSTRAR: rellena peso/sobrevivencia/FCA reales desde la última biometría.
// (No borra nada si no hay biometrías, para respetar datos antiguos.)
function derivarRealParaMostrar(laguna) {
  if (!laguna) return;
  const bios = (Array.isArray(laguna.biometrias) ? laguna.biometrias : [])
    .filter((b) => (Number(b.peso) || 0) > 0).sort((a, b) => a.dia - b.dia);
  if (!bios.length) return;
  const u = bios[bios.length - 1];
  laguna.pesoReal = u.peso;
  laguna.supervivenciaReal = (u.sobrevivencia != null && u.sobrevivencia !== '') ? u.sobrevivencia : '';
  laguna.fca = (u.fca != null && u.fca !== '') ? u.fca : '';
}

// Estado de la laguna según su última biometría vs el peso teórico de ese día.
function estadoLaguna(laguna) {
  const bios = (Array.isArray(laguna.biometrias) ? laguna.biometrias : [])
    .filter((b) => (Number(b.peso) || 0) > 0).sort((a, b) => a.dia - b.dia);
  if (!bios.length) return { clase: 'nodata', pct: null };
  const b = bios[bios.length - 1];
  const teor = FeedingEngine.pesoTeoricoG(b.dia, laguna);
  if (!(teor > 0)) return { clase: 'nodata', pct: null };
  const pct = ((Number(b.peso) - teor) / teor) * 100;
  let clase = 'ok';
  if (pct < -10) clase = 'bad'; else if (pct < -5) clase = 'warn';
  return { clase, pct };
}

// Resumen de hoy: totales sumando todas las lagunas activas.
function renderResumen() {
  const cont = document.getElementById('resumenHoy');
  const panel = document.getElementById('panelResumen');
  if (!cont || !panel) return;
  // Solo la finca activa (no se mezclan totales entre fincas).
  const lagunas = Storage.getLagunas().filter((l) => fincaDe(l) === fincaActiva);
  if (!lagunas.length) { panel.hidden = true; return; }
  let activas = 0, kg = 0, biomasa = 0;
  lagunas.forEach((l) => {
    derivarRealParaMostrar(l);
    const r = FeedingEngine.calcularRacion(l, new Date());
    if (!r || r.fueraDeRango) return;
    activas++;
    if (r.real) { kg += r.real.kgReal; biomasa += r.real.biomasaLb; }
    else { kg += r.kgDia; biomasa += r.biomasaLb; }
  });
  panel.hidden = false;
  cont.innerHTML = `
    <div class="stat"><div class="stat-ic">🏝️</div><div class="stat-v" data-count="${activas}" data-dec="0">${activas}</div><div class="stat-l">Lagunas activas</div></div>
    <div class="stat"><div class="stat-ic">🍽️</div><div class="stat-v" data-count="${kg.toFixed(1)}" data-dec="1" data-suf=" kg">${kg.toFixed(1)} kg</div><div class="stat-l">Kg a dar HOY (todas)</div></div>
    <div class="stat"><div class="stat-ic">⚖️</div><div class="stat-v" data-count="${Math.round(biomasa)}" data-dec="0">${Math.round(biomasa).toLocaleString('es')}</div><div class="stat-l">Biomasa total (lb)</div></div>
    <div class="stat"><div class="stat-ic">📦</div><div class="stat-v" data-count="${(kg / 25).toFixed(1)}" data-dec="1">${(kg / 25).toFixed(1)}</div><div class="stat-l">Sacos de 25 kg hoy</div></div>`;
  animarNumeros(cont);
}

// Llena el filtro de zona con "Todas" + las zonas permitidas del usuario.
function poblarFiltroZona() {
  const sel = document.getElementById('filtroZona');
  if (!sel) return;
  const zonas = zonasPermitidas();
  const cont = document.getElementById('filtroZonaCont');
  // Solo tiene sentido mostrar el filtro si el usuario tiene más de una zona.
  if (cont) cont.style.display = zonas.length > 1 ? 'flex' : 'none';
  sel.innerHTML = '<option value="todas">Todas las zonas</option>' +
    zonas.map((z) => `<option value="${z}">Zona ${z}</option>`).join('');
  sel.value = zonaFiltro;
}

function seleccionarLaguna(id) {
  lagunaSeleccionadaId = id;
  diaVista = null; // al cambiar de laguna, volver a "hoy"
  animarRacion = true; // efecto count-up al abrir la laguna
  renderListaLagunas();
  renderRacion();
  cargarFormulario(id);
}

// Fecha calendario correspondiente a un día de cultivo.
function fechaDeDia(laguna, dia) {
  if (!laguna.fechaSiembra) return '-';
  const [y, m, d] = String(laguna.fechaSiembra).split('-').map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + (dia - 1));
  return base.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Navegación de días (anterior/futuro), acotada al proyecto.
function navegarDia(delta) {
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) return;
  const diasProyec = Number(laguna.diasProyectados) || 1;
  const actual = (diaVista != null) ? diaVista : FeedingEngine.calcularRacion(laguna).diaCultivo;
  diaVista = Math.max(1, Math.min(diasProyec, actual + delta));
  renderRacion();
}
function irHoy() { diaVista = null; renderRacion(); }
window.navegarDia = navegarDia;
window.irHoy = irHoy;

// Guardar el alimento programado (kg) del día mostrado.
function programarDia() {
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) return;
  const val = parseFloat(document.getElementById('inputProgramado').value);
  if (isNaN(val) || val < 0) { alert('Ingresa un valor válido de kg.'); return; }
  if (!laguna.programado) laguna.programado = {};
  laguna.programado[diaMostrado] = val;
  Storage.upsertLaguna(laguna);
  renderRacion();
  mostrarConfirmacion(`Día ${diaMostrado} programado: ${val} kg`);
}
window.programarDia = programarDia;

// Exportar toda la programación de alimento (todas las lagunas) a CSV.
function exportarProgramacion() {
  const lagunas = Storage.getLagunas();
  const filas = [['Laguna', 'Zona', 'Dia', 'Fecha', 'Kg programado']];
  lagunas.forEach((l) => {
    const prog = l.programado || {};
    Object.keys(prog).map(Number).sort((a, b) => a - b).forEach((d) => {
      filas.push([l.nombre, l.zona || '', d, fechaDeDia(l, d), prog[d]]);
    });
  });
  if (filas.length === 1) { alert('Aún no hay días programados para exportar.'); return; }
  const csv = filas.map((f) => f.join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `programacion_alimento_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
window.exportarProgramacion = exportarProgramacion;

// HTML del navegador de días.
function navegadorDiaHTML(laguna, dia, diasProyec, esHoy) {
  return `
    <div class="dia-nav">
      <button type="button" class="dia-btn" onclick="navegarDia(-1)" ${dia <= 1 ? 'disabled' : ''}>◀</button>
      <div class="dia-nav__info">
        <div class="dia-nav__dia">Día ${dia} / ${diasProyec}${esHoy ? ' · HOY' : ''}</div>
        <div class="dia-nav__fecha">${fechaDeDia(laguna, dia)}</div>
      </div>
      <button type="button" class="dia-btn" onclick="navegarDia(1)" ${dia >= diasProyec ? 'disabled' : ''}>▶</button>
      ${esHoy ? '' : '<button type="button" class="btn btn--neutro dia-hoy" onclick="irHoy()">Ir a HOY</button>'}
    </div>`;
}

// HTML de la fila de alimento programado + exportación.
function programacionHTML(laguna, r) {
  const prog = (laguna.programado && laguna.programado[diaMostrado] != null) ? laguna.programado[diaMostrado] : null;
  const sugerido = r.real ? r.real.kgReal : r.kgDia;
  const valor = prog != null ? prog : sugerido.toFixed(1);
  return `
    <div class="programado">
      <h3 style="margin:1.6rem 0 0.6rem; font-size:1rem; color:var(--texto);">📋 Alimento programado — Día ${diaMostrado}</h3>
      <div class="programado-row">
        <div class="campo" style="flex:1; min-width:160px;">
          <label>Alimento programado (kg)</label>
          <input type="number" step="any" id="inputProgramado" value="${valor}" />
        </div>
        <button type="button" class="btn btn--primario" onclick="programarDia()">💾 Programar día</button>
        <button type="button" class="btn btn--neutro" onclick="exportarProgramacion()">⬇ Exportar programación</button>
      </div>
      ${prog != null ? `<p class="programado-nota">✓ Día ${diaMostrado} programado con ${prog} kg.</p>` : '<p class="programado-nota">Sugerido: ' + sugerido.toFixed(1) + ' kg (la ración a dar). Ajústalo si hace falta y programa.</p>'}
    </div>`;
}

// Ajuste de consumo (triángulo de arrastre): guarda el % y recalcula la ración real.
function cambiarConsumo(pct) {
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) return;
  laguna.consumoPct = pct;
  Storage.upsertLaguna(laguna);
  renderRacion();
}
window.cambiarConsumo = cambiarConsumo;

// Barra de progreso del ciclo de cultivo.
function progresoHTML(laguna, r) {
  const dias = Number(laguna.diasProyectados) || 0;
  if (dias < 2) return '';
  const pct = Math.max(0, Math.min(100, (r.diaCultivo / dias) * 100));
  const marca = (dias > 30)
    ? `<div class="prog-mark" style="left:${(30 / dias * 100).toFixed(1)}%"><i>Día 30 · fase</i></div>` : '';
  return `
    <div class="prog">
      <div class="prog-h"><span>📏 Ciclo de cultivo</span><b>Día ${r.diaCultivo} de ${dias} · ${pct.toFixed(0)}%</b></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct.toFixed(1)}%"></div>${marca}</div>
      <div class="prog-fases"><span>Siembra</span><span>Cosecha · Día ${dias}</span></div>
    </div>`;
}

// Comparación real vs esperado (según la última biometría medida).
function perfHTML(laguna) {
  const bios = (Array.isArray(laguna.biometrias) ? laguna.biometrias : [])
    .filter((b) => (Number(b.peso) || 0) > 0).sort((a, b) => a.dia - b.dia);
  if (!bios.length) return '';
  const b = bios[bios.length - 1];
  const pTeor = FeedingEngine.pesoTeoricoG(b.dia, laguna);
  const pPct = pTeor > 0 ? ((Number(b.peso) - pTeor) / pTeor * 100) : 0;
  const claseP = pPct < -10 ? 'bad' : (pPct < -5 ? 'mid' : 'good');
  const flP = pPct >= 0 ? '▲ +' : '▼ ';
  let survRow = '';
  if (b.sobrevivencia != null && b.sobrevivencia !== '' && !isNaN(Number(b.sobrevivencia))) {
    const sTeor = FeedingEngine.supervivenciaTeorica(b.dia, laguna) * 100;
    const sPct = Number(b.sobrevivencia) - sTeor; // diferencia en puntos %
    const claseS = sPct < -10 ? 'bad' : (sPct < -4 ? 'mid' : 'good');
    const flS = sPct >= 0 ? '▲ +' : '▼ ';
    survRow = `<div class="pf ${claseS}"><div class="pf-ico">🦐</div><div class="pf-txt"><div class="pf-t">Sobrevivencia · real vs esperada</div><div class="pf-n">${Number(b.sobrevivencia).toFixed(1)}% <span class="pf-vs">vs</span> ${sTeor.toFixed(1)}%</div></div><div class="pf-d">${flS}${Math.abs(sPct).toFixed(1)} pts</div></div>`;
  }
  return `
    <div class="perf">
      <div class="pf ${claseP}"><div class="pf-ico">📈</div><div class="pf-txt"><div class="pf-t">Crecimiento · real vs esperado (Día ${b.dia})</div><div class="pf-n">${Number(b.peso).toFixed(2)} g <span class="pf-vs">vs</span> ${pTeor.toFixed(2)} g</div></div><div class="pf-d">${flP}${Math.abs(pPct).toFixed(1)}%</div></div>
      ${survRow}
    </div>`;
}

function renderRacion() {
  const panel = document.getElementById('panelRacion');
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  derivarRealParaMostrar(laguna);

  document.getElementById('infoLaguna').innerHTML = `
    <span class="dato">🏷️ <strong>${laguna.nombre}</strong></span>
    <span class="dato">📍 Zona ${laguna.zona || '-'}</span>
    <span class="dato">🏝️ ${laguna.finca || 'Sin finca'}</span>
    <span class="dato">📐 ${laguna.areaHa || '-'} Ha</span>
    <span class="dato">🦐 ${Number(laguna.sembrados || 0).toLocaleString()} PL</span>
    <span class="dato">📅 Siembra: ${laguna.fechaSiembra}</span>
  `;

  const diasProyec = Number(laguna.diasProyectados) || 0;
  const r = FeedingEngine.calcularRacion(laguna, new Date(), diaVista);
  diaMostrado = r.diaCultivo;
  const cont = document.getElementById('racionContenido');
  const esHoy = (diaVista === null);
  const nav = navegadorDiaHTML(laguna, r.diaCultivo, diasProyec, esHoy);

  if (r.fueraDeRango) {
    const msg = r.motivo === 'aun-no-siembra'
      ? 'La fecha de siembra todavía no llega. Usa ▶ para ver los días del proyecto.'
      : 'El proyecto ya superó los días proyectados. Usa ◀ para ver días anteriores.';
    cont.innerHTML = nav + `<div class="aviso">${msg}</div>`;
    return;
  }

  const suf = esHoy ? 'HOY' : `Día ${r.diaCultivo}`;
  cont.innerHTML = nav + progresoHTML(laguna, r) + `
    <div class="ration-grid">
      <div class="ration-card destacado">
        <div class="valor" data-count="${r.kgDia.toFixed(1)}" data-dec="1" data-suf=" kg">${r.kgDia.toFixed(1)} kg</div>
        <div class="etiqueta">Ración teórica ${suf}</div>
      </div>
      <div class="ration-card destacado">
        <div class="valor" data-count="${r.lbDia}" data-dec="0" data-suf=" lb">${r.lbDia} lb</div>
        <div class="etiqueta">Ración teórica ${suf} (lb)</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.diaCultivo}</div>
        <div class="etiqueta">Día de cultivo</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.pesoG.toFixed(2)} g</div>
        <div class="etiqueta">Peso teórico</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.lbHaDia.toFixed(1)}</div>
        <div class="etiqueta">Lbs / Ha del día</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.taPct.toFixed(2)}%</div>
        <div class="etiqueta">% Tasa de alimentación</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.supervivenciaPct.toFixed(1)}%</div>
        <div class="etiqueta">Supervivencia teórica</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.sacos25kg.toFixed(2)}</div>
        <div class="etiqueta">Sacos de 25 kg</div>
      </div>
    </div>
    ${r.real ? bloqueRacionReal(r.real, suf) : ''}
    ${r.real ? perfHTML(laguna) : ''}
    ${seccionBiometriasHTML(laguna, r)}
    ${programacionHTML(laguna, r)}
  `;
  aplicarAnimRacion(animarRacion);
  animarRacion = false;
}

// Formulario para agregar/corregir una biometría en una fecha específica. Sirve
// para cargar las semanas ya medidas y que cada punto caiga en su día correcto.
function formBiometriaHTML() {
  const hoy = new Date().toISOString().slice(0, 10);
  return `
    <div class="mg-form">
      <div class="mg-form-titulo">➕ Agregar / corregir biometría</div>
      <div class="mg-form-row">
        <label class="mg-campo"><span>Fecha de la medición</span><input type="date" id="mgFecha" value="${hoy}" /></label>
        <label class="mg-campo"><span>Peso (g)</span><input type="number" step="any" id="mgPeso" placeholder="Ej. 11.5" /></label>
        <label class="mg-campo"><span>Sobrevivencia (%)</span><input type="number" step="any" id="mgSurv" placeholder="Ej. 85" /></label>
        <label class="mg-campo"><span>FCA (opcional)</span><input type="number" step="any" id="mgFca" placeholder="Ej. 1.35" /></label>
        <button type="button" class="btn btn--primario mg-add" onclick="agregarBiometriaManual()">Agregar</button>
      </div>
      <small class="mg-hint">Cada medición se coloca en su semana según la fecha. La <strong>última</strong> que registres es la que usa la Ración REAL. Registra aquí las semanas que ya mediste para completar la curva.</small>
    </div>`;
}

// Agrega (o corrige) una biometría en la fecha indicada por el usuario. Calcula
// el día de cultivo a partir de la fecha de siembra para ubicarla en su semana.
function agregarBiometriaManual() {
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) return;
  if (!laguna.fechaSiembra) { alert('Primero ponle una Fecha de siembra a la laguna.'); return; }
  const fecha = (document.getElementById('mgFecha') || {}).value;
  const peso = parseFloat((document.getElementById('mgPeso') || {}).value);
  const survRaw = (document.getElementById('mgSurv') || {}).value;
  const fcaRaw = (document.getElementById('mgFca') || {}).value;
  if (!fecha) { alert('Elige la fecha de la medición.'); return; }
  if (!(peso > 0)) { alert('Escribe un peso válido (mayor que 0).'); return; }

  const [y, m, d] = fecha.split('-').map(Number);
  const dia = FeedingEngine.diaCultivoDesde(laguna.fechaSiembra, new Date(y, m - 1, d));
  if (!(dia >= 1)) { alert('Esa fecha es anterior a la fecha de siembra de la laguna.'); return; }

  const sob = (survRaw !== '' && !isNaN(Number(survRaw))) ? Number(survRaw) : null;
  const fca = (fcaRaw !== '' && !isNaN(Number(fcaRaw))) ? Number(fcaRaw) : null;
  if (!Array.isArray(laguna.biometrias)) laguna.biometrias = [];
  const ex = laguna.biometrias.find((b) => Number(b.dia) === dia);
  if (ex) { ex.peso = peso; ex.sobrevivencia = sob; ex.fca = fca; ex.fecha = fecha; }
  else laguna.biometrias.push({ dia, fecha, peso, sobrevivencia: sob, fca });
  laguna.biometrias.sort((a, b) => a.dia - b.dia);

  // La Ración REAL siempre usa la última biometría registrada.
  sincronizarRealDesdeBiometrias(laguna);
  Storage.upsertLaguna(laguna);
  renderRacion();
  mostrarConfirmacion(`Biometría del ${fecha} agregada (Día ${dia}).`);
}
window.agregarBiometriaManual = agregarBiometriaManual;

// Deja el peso/sobrevivencia/FCA reales (los que usa la Ración REAL) igual a la
// biometría más reciente. Si no queda ninguna, los limpia.
function sincronizarRealDesdeBiometrias(laguna) {
  const bios = (Array.isArray(laguna.biometrias) ? laguna.biometrias : [])
    .filter((b) => (Number(b.peso) || 0) > 0)
    .sort((a, b) => a.dia - b.dia);
  if (!bios.length) {
    laguna.pesoReal = '';
    laguna.supervivenciaReal = '';
    laguna.fca = '';
    return;
  }
  const u = bios[bios.length - 1];
  laguna.pesoReal = u.peso;
  laguna.supervivenciaReal = (u.sobrevivencia != null && u.sobrevivencia !== '') ? u.sobrevivencia : '';
  laguna.fca = (u.fca != null && u.fca !== '') ? u.fca : '';
}

// Minigráfica de datos REALES: evolución del peso y la sobrevivencia que el
// usuario mide en campo. Cada punto es una biometría registrada. Muestra cómo
// se ha comportado el cultivo de verdad.
// Convierte una serie de puntos [x,y] en una curva suave (Catmull-Rom → Bézier).
function mgSmooth(pts) {
  if (!pts || !pts.length) return '';
  if (pts.length < 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function miniGraficaHTML(laguna, r) {
  const bios = (Array.isArray(laguna.biometrias) ? laguna.biometrias : [])
    .filter((b) => (Number(b.peso) || 0) > 0)
    .slice()
    .sort((a, b) => a.dia - b.dia);

  if (!bios.length) {
    return `
      <div class="mg-wrap">
        <p class="mg-nota">📉 Aún no hay biometrías registradas. Agrega abajo tus mediciones (por fecha) y se irá dibujando la curva real de tu cultivo.</p>
        ${formBiometriaHTML()}
      </div>`;
  }

  const dias = Number(laguna.diasProyectados) || 0;
  const maxDia = Math.max(dias, bios[bios.length - 1].dia, 2);
  const ultDiaMed = bios[bios.length - 1].dia;
  const stepEsp = Math.max(1, Math.round(ultDiaMed / 12));
  // pesoMax considera tanto lo real como la curva esperada en el rango medido.
  let pesoMax = Math.max.apply(null, bios.map((b) => Number(b.peso) || 0)) || 1;
  for (let d = 1; d <= ultDiaMed; d += stepEsp) pesoMax = Math.max(pesoMax, FeedingEngine.pesoTeoricoG(d, laguna));
  pesoMax = Math.max(pesoMax, FeedingEngine.pesoTeoricoG(ultDiaMed, laguna)) * 1.12;

  const W = 680, H = 300, mL = 50, mR = 52, mT = 26, mB = 46;
  const pW = W - mL - mR, pH = H - mT - mB;
  const X = (d) => mL + ((d - 1) / (maxDia - 1)) * pW;
  const Yp = (g) => mT + pH - (Math.max(0, g) / pesoMax) * pH;
  const Ys = (p) => mT + pH - (Math.max(0, Math.min(100, p)) / 100) * pH;

  // Rejilla y etiquetas semanales de referencia.
  const semanas = Math.floor(maxDia / 7);
  const paso = semanas > 8 ? 2 : 1;
  let grid = '', xlabels = '';
  for (let w = 0; w * 7 <= maxDia; w++) {
    const d = w === 0 ? 1 : w * 7;
    if (d > maxDia) break;
    const xx = X(d).toFixed(1);
    grid += `<line class="mg-grid" x1="${xx}" y1="${mT}" x2="${xx}" y2="${mT + pH}"/>`;
    if (w === 0 || w % paso === 0) {
      xlabels += `<text class="mg-txt" x="${xx}" y="${mT + pH + 16}" text-anchor="middle">${w === 0 ? 'D1' : 'S' + w}</text>`;
    }
  }

  // Línea + puntos del PESO real (verde).
  const puntosPeso = bios.map((b) => `${X(b.dia).toFixed(1)},${Yp(Number(b.peso)).toFixed(1)}`).join(' ');
  let dotsPeso = '';
  bios.forEach((b) => {
    const xx = X(b.dia).toFixed(1), yy = Yp(Number(b.peso)).toFixed(1);
    dotsPeso += `<circle cx="${xx}" cy="${yy}" r="4.2" fill="#65a30d" stroke="#fff" stroke-width="1.5"><title>Día ${b.dia}${b.fecha ? ' · ' + b.fecha : ''}: ${Number(b.peso).toFixed(2)} g</title></circle>`;
    dotsPeso += `<text class="mg-txt mg-txt-b" x="${xx}" y="${(Number(yy) - 8).toFixed(1)}" text-anchor="middle" fill="#4d7c0f">${Number(b.peso).toFixed(1)}</text>`;
  });

  // Línea + puntos de la SOBREVIVENCIA real (cian). Solo los que la tengan.
  const biosSurv = bios.filter((b) => b.sobrevivencia != null && b.sobrevivencia !== '' && !isNaN(Number(b.sobrevivencia)));
  const puntosSurv = biosSurv.map((b) => `${X(b.dia).toFixed(1)},${Ys(Number(b.sobrevivencia)).toFixed(1)}`).join(' ');
  let dotsSurv = '';
  biosSurv.forEach((b) => {
    const xx = X(b.dia).toFixed(1), yy = Ys(Number(b.sobrevivencia)).toFixed(1);
    dotsSurv += `<circle cx="${xx}" cy="${yy}" r="4.2" fill="#0891b2" stroke="#fff" stroke-width="1.5"><title>Día ${b.dia}${b.fecha ? ' · ' + b.fecha : ''}: ${Number(b.sobrevivencia).toFixed(1)} %</title></circle>`;
    dotsSurv += `<text class="mg-txt" x="${xx}" y="${(Number(yy) + 15).toFixed(1)}" text-anchor="middle" fill="#0e7490">${Number(b.sobrevivencia).toFixed(0)}%</text>`;
  });

  const ejes = `
    <text class="mg-txt" x="${mL - 6}" y="${mT + 4}" text-anchor="end">${pesoMax.toFixed(0)}g</text>
    <text class="mg-txt" x="${mL - 6}" y="${mT + pH}" text-anchor="end">0g</text>
    <text class="mg-txt" x="${W - mR + 6}" y="${mT + 4}" text-anchor="start">100%</text>
    <text class="mg-txt" x="${W - mR + 6}" y="${mT + pH / 2}" text-anchor="start">50%</text>
    <text class="mg-txt" x="${W - mR + 6}" y="${mT + pH}" text-anchor="start">0%</text>`;

  // Curvas suaves (bézier) para el look premium.
  const ptsPeso = bios.map((b) => [X(b.dia), Yp(Number(b.peso))]);
  const ptsSurv = biosSurv.map((b) => [X(b.dia), Ys(Number(b.sobrevivencia))]);
  const dPeso = mgSmooth(ptsPeso);
  const dSurv = mgSmooth(ptsSurv);

  // Curva ESPERADA (peso teórico) sobre el rango medido, para comparar.
  const ptsEsp = [];
  for (let d = 1; d <= ultDiaMed; d += stepEsp) ptsEsp.push([X(d), Yp(FeedingEngine.pesoTeoricoG(d, laguna))]);
  if (!ptsEsp.length || Math.abs(ptsEsp[ptsEsp.length - 1][0] - X(ultDiaMed)) > 0.5) {
    ptsEsp.push([X(ultDiaMed), Yp(FeedingEngine.pesoTeoricoG(ultDiaMed, laguna))]);
  }
  const dEsp = mgSmooth(ptsEsp);

  // Relleno degradado bajo la curva de peso real.
  const areaPeso = (ptsPeso.length > 1)
    ? `${dPeso} L${ptsPeso[ptsPeso.length - 1][0].toFixed(1)},${(mT + pH).toFixed(1)} L${ptsPeso[0][0].toFixed(1)},${(mT + pH).toFixed(1)} Z`
    : '';

  const defs = `<defs>
      <linearGradient id="mgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#84cc16" stop-opacity="0.38"/>
        <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
      </linearGradient>
      <filter id="mgGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`;
  const lineaEsp = (ptsEsp.length > 1) ? `<path d="${dEsp}" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="5 5" opacity="0.8"/>` : '';
  const areaFill = areaPeso ? `<path d="${areaPeso}" fill="url(#mgGrad)"/>` : '';
  const lineaPeso = (ptsPeso.length > 1) ? `<path d="${dPeso}" fill="none" stroke="#84cc16" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#mgGlow)"/>` : '';
  const lineaSurv = (ptsSurv.length > 1) ? `<path d="${dSurv}" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#mgGlow)"/>` : '';

  // Lista de biometrías registradas con botón para borrar cada una.
  const lista = bios.map((b) => {
    const sem = Math.max(1, Math.round(b.dia / 7));
    const surv = (b.sobrevivencia != null && b.sobrevivencia !== '') ? ` · ${Number(b.sobrevivencia).toFixed(0)}% sobrev.` : '';
    return `<div class="mg-fila">
      <span><strong>Sem ${sem}</strong> · Día ${b.dia}${b.fecha ? ' · ' + b.fecha : ''} — ${Number(b.peso).toFixed(2)} g${surv}</span>
      <button type="button" class="mg-del" title="Borrar esta biometría" onclick="eliminarBiometria(${b.dia})">✕</button>
    </div>`;
  }).join('');

  return `
    <div class="mg-wrap">
      <div class="mg-leyenda">
        <span class="mg-item"><span class="mg-punto" style="background:#84cc16"></span>Peso real (g)</span>
        <span class="mg-item"><span class="mg-punto" style="background:#22d3ee"></span>Sobrevivencia real (%)</span>
        <span class="mg-item"><span class="mg-punto" style="background:#94a3b8"></span>Peso esperado</span>
      </div>
      <svg class="mini-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución real de peso y sobrevivencia">
        ${defs}
        ${grid}
        <line class="mg-axis" x1="${mL}" y1="${mT + pH}" x2="${W - mR}" y2="${mT + pH}"/>
        ${lineaEsp}${areaFill}${lineaPeso}${lineaSurv}
        ${dotsPeso}${dotsSurv}
        ${ejes}${xlabels}
      </svg>
      <p class="mg-nota">Evolución real según tus biometrías registradas (${bios.length}). Cada punto es una medición que guardaste.</p>
      ${formBiometriaHTML()}
      <button type="button" id="btnVerBiometrias" class="btn btn--neutro btn--sm mg-verlista" onclick="toggleListaBiometrias()">${listaBiometriasAbierta ? '▲ Ocultar mediciones' : '📋 Ver mediciones'} (${bios.length})</button>
      <div class="mg-lista"${listaBiometriasAbierta ? '' : ' hidden'}>${lista}</div>
    </div>`;
}

// Muestra/oculta la lista de mediciones por semana (para no ocupar espacio).
function toggleListaBiometrias() {
  listaBiometriasAbierta = !listaBiometriasAbierta;
  const lista = document.querySelector('.mg-lista');
  const btn = document.getElementById('btnVerBiometrias');
  if (lista) lista.hidden = !listaBiometriasAbierta;
  if (btn) {
    const n = lista ? lista.querySelectorAll('.mg-fila').length : 0;
    btn.textContent = (listaBiometriasAbierta ? '▲ Ocultar mediciones' : '📋 Ver mediciones') + ` (${n})`;
  }
}
window.toggleListaBiometrias = toggleListaBiometrias;

// Muestra/oculta la lista de usuarios del panel de administración.
function actualizarBtnUsuarios(n) {
  const btn = document.getElementById('btnVerUsuarios');
  if (!btn) return;
  const cuenta = (typeof n === 'number') ? ` (${n})` : '';
  btn.textContent = (panelUsuariosAbierto ? '▲ Ocultar usuarios' : '👥 Ver usuarios') + cuenta;
}
function togglePanelUsuarios() {
  panelUsuariosAbierto = !panelUsuariosAbierto;
  const body = document.getElementById('adminBody');
  if (body) body.hidden = !panelUsuariosAbierto;
  const n = document.querySelectorAll('#listaUsuarios .usuario-fila').length;
  actualizarBtnUsuarios(n);
}
window.togglePanelUsuarios = togglePanelUsuarios;

// Borra una biometría del historial (por su día) y redibuja.
function eliminarBiometria(dia) {
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna || !Array.isArray(laguna.biometrias)) return;
  if (!confirm('¿Borrar esta biometría de la gráfica? No se puede deshacer.')) return;
  laguna.biometrias = laguna.biometrias.filter((b) => Number(b.dia) !== Number(dia));
  sincronizarRealDesdeBiometrias(laguna);
  Storage.upsertLaguna(laguna);
  renderRacion();
  mostrarConfirmacion('Biometría borrada.');
}
window.eliminarBiometria = eliminarBiometria;

function bloqueRacionReal(rr, suf = 'HOY') {
  const pct = rr.consumoPct;
  const pills = [100, 75, 50, 25, 0].map((p) =>
    `<button type="button" class="consumo-pill${pct === p ? ' activo' : ''}" onclick="cambiarConsumo(${p})">${p}%</button>`
  ).join('');
  const etiquetaConsumo = pct === 100 ? '' : ` · al ${pct}%`;
  return `
    <h3 style="margin:1.6rem 0 0.8rem; font-size:1rem; color:var(--texto);">📏 Ración REAL (según peso medido)</h3>
    <div class="consumo-selector">
      <div class="consumo-label">🔺 Consumo (triángulo de arrastre):</div>
      <div class="consumo-pills">${pills}</div>
    </div>
    <div class="ration-grid">
      <div class="ration-card destacado destacado-real">
        <div class="valor" data-count="${rr.kgReal.toFixed(1)}" data-dec="1" data-suf=" kg">${rr.kgReal.toFixed(1)} kg</div>
        <div class="etiqueta">Ración a dar ${suf}${etiquetaConsumo}</div>
      </div>
      <div class="ration-card destacado destacado-real">
        <div class="valor" data-count="${rr.lbReal}" data-dec="0" data-suf=" lb">${rr.lbReal} lb</div>
        <div class="etiqueta">Ración a dar ${suf} (lb)${etiquetaConsumo}</div>
      </div>
      <div class="ration-card">
        <div class="valor">${rr.pesoReal.toFixed(2)} g</div>
        <div class="etiqueta">Peso real</div>
      </div>
      <div class="ration-card">
        <div class="valor">${rr.supervivenciaPct.toFixed(1)}%</div>
        <div class="etiqueta">Sobrevivencia ${rr.supervivenciaEsReal ? 'real' : '(teórica)'}</div>
      </div>
      <div class="ration-card">
        <div class="valor">${Math.round(rr.biomasaLb).toLocaleString()}</div>
        <div class="etiqueta">Biomasa total (lb)</div>
      </div>
      ${rr.fca ? `<div class="ration-card">
        <div class="valor">${rr.fca.toFixed(2)}</div>
        <div class="etiqueta">FCA real</div>
      </div>` : ''}
      <div class="ration-card">
        <div class="valor">${rr.lbHaReal.toFixed(1)}</div>
        <div class="etiqueta">Lbs / Ha del día</div>
      </div>
      <div class="ration-card">
        <div class="valor">${rr.taPct.toFixed(2)}%</div>
        <div class="etiqueta">% Tasa de alimentación</div>
      </div>
      <div class="ration-card">
        <div class="valor">${rr.sacos25kg.toFixed(2)}</div>
        <div class="etiqueta">Sacos de 25 kg</div>
      </div>
      ${rr.animalesPorTolva != null ? `<div class="ration-card ration-card--tolva">
        <div class="valor">${Math.round(rr.animalesPorTolva).toLocaleString('es')}</div>
        <div class="etiqueta">🦐 Animales por tolva (${rr.tolvas} tolvas)</div>
      </div>` : ''}
    </div>
  `;
}

// Sección de biometrías (gráfica + formulario para agregar). SIEMPRE se muestra,
// aunque la laguna todavía no tenga peso real, para poder registrar la primera.
function seccionBiometriasHTML(laguna, r) {
  return `
    <h3 style="margin:1.6rem 0 0.8rem; font-size:1rem; color:var(--texto);">📈 Biometrías reales (peso y sobrevivencia)</h3>
    ${miniGraficaHTML(laguna, r)}
  `;
}

function cargarFormulario(id) {
  const laguna = Storage.getLaguna(id);
  document.getElementById('tituloFormulario').textContent = laguna ? `Editar laguna: ${laguna.nombre}` : 'Nueva laguna';
  document.getElementById('lagunaId').value = laguna ? laguna.id : '';
  // Campos normales (finca y zona se manejan aparte porque dependen entre sí).
  FIELDS.forEach((f) => {
    if (f === 'finca' || f === 'zona') return;
    const elc = document.getElementById(f);
    if (!elc) return;
    if (elc.tagName === 'SELECT') {
      elc.value = laguna && laguna[f] != null ? String(laguna[f]) : '';
    } else {
      elc.value = laguna ? (laguna[f] ?? '') : elc.defaultValue;
    }
  });
  // Finca: lista desplegable. Nueva laguna → finca activa. Editar → su finca.
  poblarSelectorFincaForm();
  const fincaSel = laguna ? fincaDe(laguna) : fincaActiva;
  document.getElementById('finca').value = fincaSel;
  // Zona: depende de la finca elegida.
  poblarSelectorZona(fincaSel);
  const zonaEl = document.getElementById('zona');
  const zonaSel = laguna && laguna.zona != null ? String(laguna.zona) : '';
  if (zonaSel && Array.from(zonaEl.options).some((o) => o.value === zonaSel)) {
    zonaEl.value = zonaSel;
  }
  document.getElementById('btnCancelarEdicion').style.display = laguna ? 'inline-block' : 'none';
  document.getElementById('btnEliminar').style.display = laguna ? 'inline-block' : 'none';
}

function limpiarFormulario() {
  document.getElementById('formLaguna').reset();
  document.getElementById('lagunaId').value = '';
  document.getElementById('tituloFormulario').textContent = 'Nueva laguna';
  // Nueva laguna: se crea en la finca activa, con las zonas de esa finca.
  poblarSelectorFincaForm();
  document.getElementById('finca').value = fincaActiva;
  poblarSelectorZona(fincaActiva);
  document.getElementById('btnCancelarEdicion').style.display = 'none';
  document.getElementById('btnEliminar').style.display = 'none';
}

// Abre / cierra el apartado de edición (oculto por defecto para no estorbar).
function abrirFormulario() {
  const sec = document.getElementById('seccionFormulario');
  if (!sec) return;
  sec.hidden = false;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function cerrarFormulario() {
  const sec = document.getElementById('seccionFormulario');
  if (sec) sec.hidden = true;
}

document.getElementById('formLaguna').addEventListener('submit', (e) => {
  e.preventDefault();

  const nombre = document.getElementById('nombre').value.trim();
  const fechaSiembra = document.getElementById('fechaSiembra').value;
  const sembrados = document.getElementById('sembrados').value;
  const diasProyectados = document.getElementById('diasProyectados').value;
  const faltantes = [];
  if (!nombre) faltantes.push('Código laguna / piscina');
  if (!fechaSiembra) faltantes.push('Fecha de siembra');
  if (!sembrados) faltantes.push('Sembrados (PL)');
  if (!diasProyectados) faltantes.push('Días proyectados de cultivo');
  if (faltantes.length) {
    alert('Faltan campos obligatorios:\n- ' + faltantes.join('\n- '));
    return;
  }

  const id = document.getElementById('lagunaId').value || `laguna_${Date.now()}`;
  // Partir de la laguna existente para no perder campos que no están en el
  // formulario (ej. consumoPct, que se ajusta con la barra de consumo).
  const laguna = Object.assign({}, Storage.getLaguna(id) || {}, { id });
  FIELDS.forEach((f) => {
    laguna[f] = document.getElementById(f).value;
  });

  try {
    Storage.upsertLaguna(laguna);
  } catch (err) {
    alert('No se pudo guardar la laguna. Tu navegador está bloqueando el almacenamiento local (localStorage).\n\nDetalle: ' + err.message + '\n\nSi abriste el archivo directamente (file://), intenta con otro navegador o pide que te ayuden a servirlo desde un servidor local.');
    return;
  }

  const guardadoOk = Storage.getLaguna(id);
  if (!guardadoOk) {
    alert('La laguna no se guardó. Revisa que tu navegador permita almacenamiento local para este archivo.');
    return;
  }

  lagunaSeleccionadaId = id;
  animarRacion = true;
  renderListaLagunas();
  renderRacion();
  cargarFormulario(id);
  cerrarFormulario();
  mostrarConfirmacion(`Laguna "${nombre}" guardada correctamente.`);
});

function mostrarConfirmacion(mensaje) {
  let aviso = document.getElementById('avisoGuardado');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'avisoGuardado';
    aviso.className = 'toast';
    document.body.appendChild(aviso);
  }
  aviso.textContent = '✓ ' + mensaje;
  // forzar reflow para reiniciar la animación si se dispara seguido
  void aviso.offsetWidth;
  aviso.classList.add('visible');
  clearTimeout(aviso._timeout);
  aviso._timeout = setTimeout(() => { aviso.classList.remove('visible'); }, 3000);
}

document.getElementById('btnCancelarEdicion').addEventListener('click', () => {
  limpiarFormulario();
  cerrarFormulario();
});

document.getElementById('btnEliminar').addEventListener('click', () => {
  const id = document.getElementById('lagunaId').value;
  if (!id) return;
  if (!confirm('¿Eliminar esta laguna? Esta acción no se puede deshacer.')) return;
  Storage.deleteLaguna(id);
  if (lagunaSeleccionadaId === id) lagunaSeleccionadaId = null;
  limpiarFormulario();
  cerrarFormulario();
  renderListaLagunas();
  renderRacion();
});

// Botones para abrir/cerrar el apartado de edición.
document.getElementById('btnNuevaLaguna').addEventListener('click', () => {
  limpiarFormulario();
  abrirFormulario();
});
document.getElementById('btnEditarLaguna').addEventListener('click', () => {
  if (!lagunaSeleccionadaId) { alert('Primero selecciona una laguna arriba.'); return; }
  cargarFormulario(lagunaSeleccionadaId);
  abrirFormulario();
});
document.getElementById('btnCerrarFormulario').addEventListener('click', cerrarFormulario);

// Cálculo automático de Sembrados (PL) = Área (Ha) × 10,000 m² × Densidad (PL/m²).
// Se recalcula al escribir el área o la densidad. El campo sigue siendo editable
// por si quieres ajustarlo a mano después.
function recalcularSembrados() {
  const area = parseFloat(document.getElementById('areaHa').value) || 0;
  const dens = parseFloat(document.getElementById('densidad').value) || 0;
  if (area > 0 && dens > 0) {
    document.getElementById('sembrados').value = Math.round(area * 10000 * dens);
  }
}
document.getElementById('areaHa').addEventListener('input', recalcularSembrados);
document.getElementById('densidad').addEventListener('input', recalcularSembrados);

// Al cambiar la finca en el formulario, se recargan sus zonas.
document.getElementById('finca').addEventListener('change', (e) => {
  poblarSelectorZona(e.target.value);
});

// Selector de finca activa (arriba): cambia la finca en uso y refresca todo.
document.getElementById('filtroFinca').addEventListener('change', (e) => {
  fincaActiva = e.target.value;
  zonaFiltro = 'todas';
  lagunaSeleccionadaId = null; // al cambiar de finca, se deselecciona la laguna
  poblarFiltroZona();
  poblarSelectorFincaForm();
  renderListaLagunas();
  renderRacion();
});

document.getElementById('btnExportar').addEventListener('click', () => Storage.exportarJSON());

document.getElementById('btnImportar').addEventListener('click', () => {
  document.getElementById('inputImportar').click();
});

document.getElementById('filtroZona').addEventListener('change', (e) => {
  zonaFiltro = e.target.value;
  renderListaLagunas();
});

document.getElementById('inputImportar').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  Storage.importarJSON(file, (err) => {
    if (err) {
      alert('No se pudo importar el archivo: ' + err.message);
      return;
    }
    alert('Respaldo importado correctamente.');
    renderListaLagunas();
    renderRacion();
  });
});

function verificarAlmacenamiento() {
  try {
    const testKey = '__camaron_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

if (!verificarAlmacenamiento()) {
  const banner = document.createElement('div');
  banner.className = 'aviso';
  banner.style.margin = '1rem 0';
  banner.innerHTML = `⚠️ Tu navegador está bloqueando el almacenamiento local (localStorage) en esta página,
    así que <strong>los datos no se van a guardar</strong>. Esto pasa seguido si abres el archivo en modo incógnito/privado,
    o si el navegador tiene el almacenamiento de sitios desactivado. Prueba abrir <code>index.html</code> en una
    ventana normal (no privada) de Chrome o Edge.`;
  document.querySelector('main').prepend(banner);
}

/* ---------- Modo claro / oscuro ---------- */
function temaActual() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function aplicarIconoTema() {
  const btn = document.getElementById('btnTema');
  if (btn) btn.textContent = temaActual() === 'dark' ? '☀️ Modo claro' : '🌙 Modo oscuro';
}
document.getElementById('btnTema').addEventListener('click', () => {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nuevo);
  try { localStorage.setItem('gmsb_tema', nuevo); } catch {}
  aplicarIconoTema();
});
aplicarIconoTema();

/* ---------- Instalación PWA ---------- */
let promptInstalacion = null;
const btnInstalar = document.getElementById('btnInstalar');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalacion = e;
  btnInstalar.classList.add('visible');
});

btnInstalar.addEventListener('click', async () => {
  if (!promptInstalacion) return;
  promptInstalacion.prompt();
  const { outcome } = await promptInstalacion.userChoice;
  if (outcome === 'accepted') {
    btnInstalar.classList.remove('visible');
    mostrarConfirmacion('App instalada en tu dispositivo.');
  }
  promptInstalacion = null;
});

window.addEventListener('appinstalled', () => {
  btnInstalar.classList.remove('visible');
});

/* ---------- Service Worker (offline + instalación) ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin conexión o no soportado */ });
  });
}

/* ---------- Arranque con autenticación + sincronización en la nube ---------- */
const esAdmin = () => window.Perfil && window.Perfil.rol === 'admin';

async function alIniciarSesion() {
  // Finca inicial: el admin arranca en GMSB (puede cambiar); el usuario queda en la suya.
  fincaActiva = puedeElegirFinca() ? FINCA_POR_DEFECTO : fincaDelPerfil();
  poblarFiltroFinca();
  poblarSelectorZona();
  poblarFiltroZona();
  renderListaLagunas();
  renderRacion();

  const res = await Storage.syncFromCloud();
  if (res && res.ok && res.count === 0 && esAdmin()) {
    // Primera vez: el admin sube lo que tuviera guardado localmente (si tiene zona).
    await Storage.subirCacheLocalSiHace();
    await Storage.syncFromCloud();
  }

  poblarFiltroFinca();
  poblarSelectorZona();
  poblarFiltroZona();
  renderListaLagunas();
  if (lagunaSeleccionadaId && !Storage.getLaguna(lagunaSeleccionadaId)) {
    lagunaSeleccionadaId = null;
  }
  renderRacion();
  actualizarEstadoAcceso();

  if (esAdmin()) renderPanelAdmin();
  else document.getElementById('panelAdmin').hidden = true;
}

function alCerrarSesion() {
  lagunaSeleccionadaId = null;
  document.getElementById('panelAdmin').hidden = true;
  renderListaLagunas();
  renderRacion();
}

// Aviso cuando un usuario (no admin) todavía no tiene zonas asignadas.
function actualizarEstadoAcceso() {
  let banner = document.getElementById('avisoSinZonas');
  const sinZonas = !esAdmin() && zonasPermitidas().length === 0;
  if (sinZonas) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'avisoSinZonas';
      banner.className = 'aviso';
      banner.style.margin = '0 0 1rem';
      document.getElementById('appPrincipal').prepend(banner);
    }
    banner.innerHTML = '⏳ Tu cuenta aún no tiene zonas asignadas. Pídele al administrador que te asigne tu zona para ver las lagunas.';
  } else if (banner) {
    banner.remove();
  }
}

/* ---------- Panel de administrador ---------- */
async function renderPanelAdmin() {
  const panel = document.getElementById('panelAdmin');
  panel.hidden = false;
  const cont = document.getElementById('listaUsuarios');
  cont.innerHTML = '<p class="vacio">Cargando usuarios…</p>';

  const perfiles = await Storage.listarPerfiles();
  if (!perfiles.length) {
    cont.innerHTML = '<p class="vacio">No hay usuarios todavía.</p>';
    actualizarBtnUsuarios(0);
    return;
  }
  actualizarBtnUsuarios(perfiles.length);

  cont.innerHTML = perfiles.map((p) => {
    const zonas = Array.isArray(p.zonas) ? p.zonas.map(Number) : [];
    const fincaSel = LISTA_FINCAS.includes(p.finca) ? p.finca : FINCA_POR_DEFECTO;
    const fincaOpts = LISTA_FINCAS.map((f) => `<option value="${f}" ${f === fincaSel ? 'selected' : ''}>${FINCAS[f].nombre}</option>`).join('');
    return `
      <div class="usuario-fila" data-uid="${p.id}">
        <div class="usuario-info">
          <strong>${p.email || '(sin correo)'}</strong>
          <div class="usuario-selects">
            <select data-rol="${p.id}" class="rol-select">
              <option value="usuario" ${p.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
              <option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administrador</option>
            </select>
            <select data-finca="${p.id}" class="rol-select finca-select">${fincaOpts}</select>
          </div>
        </div>
        <div class="zonas-checks" data-zonas-uid="${p.id}">${zonaChecksHTML(p.id, fincaSel, zonas)}</div>
        <button class="btn btn--primario btn-guardar-perfil" data-uid="${p.id}">Guardar</button>
      </div>`;
  }).join('');

  // Al cambiar la finca de un usuario, se recargan sus zonas (las de esa finca).
  cont.querySelectorAll('select[data-finca]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const uid = sel.dataset.finca;
      const marcadas = Array.from(cont.querySelectorAll(`input[data-uid="${uid}"]:checked`)).map((c) => Number(c.dataset.zona));
      const cont2 = cont.querySelector(`div[data-zonas-uid="${uid}"]`);
      if (cont2) cont2.innerHTML = zonaChecksHTML(uid, sel.value, marcadas);
    });
  });

  cont.querySelectorAll('.btn-guardar-perfil').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const rol = cont.querySelector(`select[data-rol="${uid}"]`).value;
      const finca = cont.querySelector(`select[data-finca="${uid}"]`).value;
      const zonas = Array.from(cont.querySelectorAll(`input[data-uid="${uid}"]:checked`)).map((c) => Number(c.dataset.zona));
      btn.textContent = 'Guardando…';
      const r = await Storage.guardarPerfil(uid, rol, zonas, finca);
      btn.textContent = 'Guardar';
      if (r.ok) mostrarConfirmacion('Perfil actualizado.');
      else alert('No se pudo guardar: ' + (r.error || ''));
    });
  });
}

// Checkboxes de zona para un usuario, según las zonas de la finca elegida.
function zonaChecksHTML(uid, finca, zonasSel) {
  const zonas = zonasDeFinca(finca);
  if (!zonas.length) return '<span class="zona-nota">Esta finca no usa zonas</span>';
  return zonas.map((z) =>
    `<label class="zona-check"><input type="checkbox" data-uid="${uid}" data-zona="${z}" ${zonasSel.includes(z) ? 'checked' : ''}/> Z${z}</label>`
  ).join('');
}

Auth.init(alIniciarSesion, alCerrarSesion);
