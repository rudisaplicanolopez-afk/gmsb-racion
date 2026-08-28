/* Wiring de la UI: lista de lagunas, formulario y vista de ración del día. */

let lagunaSeleccionadaId = null;

const FIELDS = [
  'nombre', 'zona', 'finca', 'areaHa', 'fechaSiembra', 'densidad', 'sembrados',
  'pesoTransferencia', 'diasProyectados', 'mortalidad1', 'mortalidad2',
  'ta30', 'tc30',
];
// El peso real, la sobrevivencia real y el FCA ya NO se ingresan en el
// formulario: provienen de la última biometría registrada en la gráfica.

function zonasPermitidas() {
  if (window.Perfil && window.Perfil.rol === 'admin') return [1, 2, 3, 4, 5];
  if (window.Perfil && Array.isArray(window.Perfil.zonas)) return window.Perfil.zonas.slice().sort();
  return [];
}

function poblarSelectorZona() {
  const sel = document.getElementById('zona');
  if (!sel) return;
  const zonas = zonasPermitidas();
  const lista = zonas.length ? zonas : [1, 2, 3, 4, 5];
  sel.innerHTML = lista.map((z) => `<option value="${z}">Zona ${z}</option>`).join('');
}

let zonaFiltro = 'todas';
let diaVista = null;      // null = hoy; número = día seleccionado
let diaMostrado = null;   // día que se está mostrando actualmente

function renderListaLagunas() {
  let lagunas = Storage.getLagunas();
  const cont = document.getElementById('listaLagunas');
  const vacio = document.getElementById('sinLagunas');
  cont.innerHTML = '';

  // Filtrar por zona seleccionada
  if (zonaFiltro !== 'todas') {
    lagunas = lagunas.filter((l) => String(l.zona) === String(zonaFiltro));
  }
  // Ordenar de menor a mayor por código (orden natural: L0201 < L0202 < ...)
  lagunas = lagunas.slice().sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), undefined, { numeric: true, sensitivity: 'base' })
  );

  vacio.style.display = lagunas.length ? 'none' : 'block';
  vacio.textContent = (zonaFiltro !== 'todas' && Storage.getLagunas().length)
    ? 'No hay lagunas en esta zona.'
    : 'Aún no has registrado ninguna laguna. Crea la primera en el formulario de abajo.';

  lagunas.forEach((l) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-laguna' + (l.id === lagunaSeleccionadaId ? ' activo' : '');
    chip.textContent = l.nombre;
    chip.title = 'Zona ' + (l.zona || '-');
    chip.onclick = () => seleccionarLaguna(l.id);
    cont.appendChild(chip);
  });
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

function renderRacion() {
  const panel = document.getElementById('panelRacion');
  const laguna = Storage.getLaguna(lagunaSeleccionadaId);
  if (!laguna) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

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
  cont.innerHTML = nav + `
    <div class="ration-grid">
      <div class="ration-card destacado">
        <div class="valor">${r.kgDia.toFixed(1)} kg</div>
        <div class="etiqueta">Ración teórica ${suf}</div>
      </div>
      <div class="ration-card destacado">
        <div class="valor">${r.lbDia} lb</div>
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
    ${r.real ? bloqueRacionReal(r.real, suf, laguna, r) : ''}
    ${programacionHTML(laguna, r)}
  `;
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
  const pesoMax = (Math.max.apply(null, bios.map((b) => Number(b.peso) || 0)) || 1) * 1.15;

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

  const lineaPeso = bios.length > 1
    ? `<polyline fill="none" stroke="#84cc16" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${puntosPeso}"/>` : '';
  const lineaSurv = biosSurv.length > 1
    ? `<polyline fill="none" stroke="#22d3ee" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${puntosSurv}"/>` : '';

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
        <span class="mg-item"><span class="mg-punto" style="background:#65a30d"></span>Peso real (g)</span>
        <span class="mg-item"><span class="mg-punto" style="background:#0891b2"></span>Sobrevivencia real (%)</span>
      </div>
      <svg class="mini-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución real de peso y sobrevivencia">
        ${grid}
        <line class="mg-axis" x1="${mL}" y1="${mT + pH}" x2="${W - mR}" y2="${mT + pH}"/>
        ${lineaPeso}${lineaSurv}
        ${dotsPeso}${dotsSurv}
        ${ejes}${xlabels}
      </svg>
      <p class="mg-nota">Evolución real según tus biometrías registradas (${bios.length}). Cada punto es una medición que guardaste.</p>
      ${formBiometriaHTML()}
      <div class="mg-lista">${lista}</div>
    </div>`;
}

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

function bloqueRacionReal(rr, suf = 'HOY', laguna = null, r = null) {
  const pct = rr.consumoPct;
  const pills = [100, 75, 50, 25, 0].map((p) =>
    `<button type="button" class="consumo-pill${pct === p ? ' activo' : ''}" onclick="cambiarConsumo(${p})">${p}%</button>`
  ).join('');
  const etiquetaConsumo = pct === 100 ? '' : ` · al ${pct}%`;
  const grafica = (laguna && r) ? miniGraficaHTML(laguna, r) : '';
  return `
    <h3 style="margin:1.6rem 0 0.8rem; font-size:1rem; color:var(--texto);">📏 Ración REAL (según peso medido)</h3>
    <div class="consumo-selector">
      <div class="consumo-label">🔺 Consumo (triángulo de arrastre):</div>
      <div class="consumo-pills">${pills}</div>
    </div>
    <div class="ration-grid">
      <div class="ration-card destacado destacado-real">
        <div class="valor">${rr.kgReal.toFixed(1)} kg</div>
        <div class="etiqueta">Ración a dar ${suf}${etiquetaConsumo}</div>
      </div>
      <div class="ration-card destacado destacado-real">
        <div class="valor">${rr.lbReal} lb</div>
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
    </div>
    ${grafica}
  `;
}

function cargarFormulario(id) {
  const laguna = Storage.getLaguna(id);
  document.getElementById('tituloFormulario').textContent = laguna ? `3. Editar laguna: ${laguna.nombre}` : '3. Nueva laguna';
  document.getElementById('lagunaId').value = laguna ? laguna.id : '';
  FIELDS.forEach((f) => {
    const elc = document.getElementById(f);
    if (elc.tagName === 'SELECT') {
      elc.value = laguna && laguna[f] != null ? String(laguna[f]) : (zonasPermitidas()[0] || 1);
    } else {
      elc.value = laguna ? (laguna[f] ?? '') : elc.defaultValue;
    }
  });
  document.getElementById('btnCancelarEdicion').style.display = laguna ? 'inline-block' : 'none';
  document.getElementById('btnEliminar').style.display = laguna ? 'inline-block' : 'none';
}

function limpiarFormulario() {
  document.getElementById('formLaguna').reset();
  document.getElementById('lagunaId').value = '';
  document.getElementById('tituloFormulario').textContent = '3. Nueva laguna';
  document.getElementById('btnCancelarEdicion').style.display = 'none';
  document.getElementById('btnEliminar').style.display = 'none';
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
  renderListaLagunas();
  renderRacion();
  cargarFormulario(id);
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
});

document.getElementById('btnEliminar').addEventListener('click', () => {
  const id = document.getElementById('lagunaId').value;
  if (!id) return;
  if (!confirm('¿Eliminar esta laguna? Esta acción no se puede deshacer.')) return;
  Storage.deleteLaguna(id);
  if (lagunaSeleccionadaId === id) lagunaSeleccionadaId = null;
  limpiarFormulario();
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
    return;
  }

  cont.innerHTML = perfiles.map((p) => {
    const zonas = Array.isArray(p.zonas) ? p.zonas : [];
    const checks = [1, 2, 3, 4, 5].map((z) =>
      `<label class="zona-check"><input type="checkbox" data-uid="${p.id}" data-zona="${z}" ${zonas.includes(z) ? 'checked' : ''}/> Z${z}</label>`
    ).join('');
    return `
      <div class="usuario-fila" data-uid="${p.id}">
        <div class="usuario-info">
          <strong>${p.email || '(sin correo)'}</strong>
          <select data-rol="${p.id}" class="rol-select">
            <option value="usuario" ${p.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
            <option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        <div class="zonas-checks">${checks}</div>
        <button class="btn btn--primario btn-guardar-perfil" data-uid="${p.id}">Guardar</button>
      </div>`;
  }).join('');

  cont.querySelectorAll('.btn-guardar-perfil').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const rol = cont.querySelector(`select[data-rol="${uid}"]`).value;
      const zonas = Array.from(cont.querySelectorAll(`input[data-uid="${uid}"]:checked`)).map((c) => Number(c.dataset.zona));
      btn.textContent = 'Guardando…';
      const r = await Storage.guardarPerfil(uid, rol, zonas);
      btn.textContent = 'Guardar';
      if (r.ok) mostrarConfirmacion('Perfil actualizado.');
      else alert('No se pudo guardar: ' + (r.error || ''));
    });
  });
}

Auth.init(alIniciarSesion, alCerrarSesion);
