/* Wiring de la UI: lista de lagunas, formulario y vista de ración del día. */

let lagunaSeleccionadaId = null;

const FIELDS = [
  'nombre', 'zona', 'finca', 'areaHa', 'fechaSiembra', 'densidad', 'sembrados',
  'pesoTransferencia', 'diasProyectados', 'mortalidad1', 'mortalidad2',
  'ta30', 'tc30', 'pesoReal', 'supervivenciaReal',
];

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
    <span class="dato">📍 Zona ${laguna.zona || '-'}</span>
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
    ${r.real ? bloqueRacionReal(r.real) : ''}
  `;
}

function bloqueRacionReal(rr) {
  return `
    <h3 style="margin:1.6rem 0 0.8rem; font-size:1rem; color:var(--texto);">📏 Ración REAL (según peso medido)</h3>
    <div class="ration-grid">
      <div class="ration-card destacado destacado-real">
        <div class="valor">${rr.kgReal.toFixed(1)} kg</div>
        <div class="etiqueta">Ración real HOY</div>
      </div>
      <div class="ration-card destacado destacado-real">
        <div class="valor">${rr.lbReal} lb</div>
        <div class="etiqueta">Ración real HOY (lb)</div>
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
