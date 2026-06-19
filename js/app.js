/* Wiring de la UI: lista de lagunas, formulario y vista de ración del día. */

let lagunaSeleccionadaId = null;

const FIELDS = [
  'nombre', 'finca', 'areaHa', 'fechaSiembra', 'densidad', 'sembrados',
  'pesoTransferencia', 'diasProyectados', 'mortalidad1', 'mortalidad2', 'ajusteCurva',
  'ta30', 'tc30', 'corte1', 'ta45', 'tc45', 'corte2', 'ta56', 'tc56', 'corte3',
  'ta75', 'tc75', 'corte4', 'taFinal', 'tcFinal',
];

function renderListaLagunas() {
  const lagunas = Storage.getLagunas();
  const cont = document.getElementById('listaLagunas');
  const vacio = document.getElementById('sinLagunas');
  cont.innerHTML = '';
  vacio.style.display = lagunas.length ? 'none' : 'block';

  lagunas.forEach((l) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-laguna' + (l.id === lagunaSeleccionadaId ? ' activo' : '');
    chip.textContent = l.nombre;
    chip.onclick = () => seleccionarLaguna(l.id);
    cont.appendChild(chip);
  });
}

function seleccionarLaguna(id) {
  lagunaSeleccionadaId = id;
  renderListaLagunas();
  renderRacion();
  cargarFormulario(id);
}

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
    <span class="dato">🏝️ ${laguna.finca || 'Sin finca'}</span>
    <span class="dato">📐 ${laguna.areaHa || '-'} Ha</span>
    <span class="dato">🦐 ${Number(laguna.sembrados || 0).toLocaleString()} PL</span>
    <span class="dato">📅 Siembra: ${laguna.fechaSiembra}</span>
  `;

  const r = FeedingEngine.calcularRacion(laguna);
  const cont = document.getElementById('racionContenido');

  if (r.fueraDeRango) {
    const msg = r.motivo === 'aun-no-siembra'
      ? 'La fecha de siembra todavía no llega.'
      : 'El proyecto ya superó los días de cultivo proyectados.';
    cont.innerHTML = `<div class="aviso">${msg}</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="ration-grid">
      <div class="ration-card destacado">
        <div class="valor">${r.kgDia.toFixed(1)} kg</div>
        <div class="etiqueta">Ración teórica HOY</div>
      </div>
      <div class="ration-card destacado">
        <div class="valor">${r.lbDia} lb</div>
        <div class="etiqueta">Ración teórica HOY (lb)</div>
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
        <div class="valor">${r.taPct.toFixed(2)}%</div>
        <div class="etiqueta">% Tasa de alimentación</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.supervivenciaPct.toFixed(1)}%</div>
        <div class="etiqueta">Supervivencia teórica</div>
      </div>
      <div class="ration-card">
        <div class="valor">${r.sacos40kg.toFixed(2)}</div>
        <div class="etiqueta">Sacos de 40 kg</div>
      </div>
    </div>
  `;
}

function cargarFormulario(id) {
  const laguna = Storage.getLaguna(id);
  document.getElementById('tituloFormulario').textContent = laguna ? `3. Editar laguna: ${laguna.nombre}` : '3. Nueva laguna';
  document.getElementById('lagunaId').value = laguna ? laguna.id : '';
  FIELDS.forEach((f) => {
    document.getElementById(f).value = laguna ? (laguna[f] ?? '') : document.getElementById(f).defaultValue;
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
  const laguna = { id };
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

renderListaLagunas();
renderRacion();
