/* Persistencia híbrida: Supabase (nube, fuente de verdad) + localStorage como
   caché para lectura instantánea y uso sin conexión.

   getLagunas() sigue siendo SÍNCRONO (lee del caché) para no romper la UI.
   Los cambios se guardan al instante en el caché y se envían a la nube en segundo plano.
   syncFromCloud() trae lo último de la nube y refresca el caché. */

const STORAGE_KEY = 'camaron_lagunas_v1';
const TABLA = 'lagunas';

/* ---------- Caché local (síncrono) ---------- */
function getLagunas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function setLagunasCache(lagunas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lagunas));
}

function getLaguna(id) {
  return getLagunas().find((l) => l.id === id);
}

function limpiarCacheLocal() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------- Escritura: caché + nube ---------- */
function upsertLaguna(laguna) {
  const lagunas = getLagunas();
  const idx = lagunas.findIndex((l) => l.id === laguna.id);
  if (idx >= 0) lagunas[idx] = laguna; else lagunas.push(laguna);
  setLagunasCache(lagunas);
  // Envío a la nube en segundo plano (no bloquea la UI).
  pushLagunaNube(laguna);
}

function deleteLaguna(id) {
  setLagunasCache(getLagunas().filter((l) => l.id !== id));
  deleteLagunaNube(id);
}

/* ---------- Sincronización con la nube ---------- */
async function pushLagunaNube(laguna) {
  if (!window.sb) return;
  try {
    const zona = Number(laguna.zona) || null;
    await window.sb.from(TABLA).upsert({
      id: laguna.id,
      zona: zona,
      datos: laguna,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('No se pudo guardar en la nube (se mantiene local):', e.message);
  }
}

async function deleteLagunaNube(id) {
  if (!window.sb) return;
  try {
    await window.sb.from(TABLA).delete().eq('id', id);
  } catch (e) {
    console.warn('No se pudo borrar en la nube:', e.message);
  }
}

// Trae las lagunas accesibles (RLS filtra por zona/rol) y refresca el caché.
async function syncFromCloud() {
  if (!window.sb) return { ok: false, motivo: 'sin-cliente' };
  try {
    const { data, error } = await window.sb.from(TABLA).select('datos, zona').order('updated_at', { ascending: true });
    if (error) throw error;
    const lagunas = (data || []).map((row) => {
      const l = row.datos || {};
      if (row.zona != null) l.zona = row.zona; // la columna manda
      return l;
    });
    setLagunasCache(lagunas);
    return { ok: true, count: lagunas.length };
  } catch (e) {
    console.warn('No se pudo sincronizar desde la nube (se usa caché local):', e.message);
    return { ok: false, motivo: e.message };
  }
}

/* ---------- Perfiles (solo admin gestiona) ---------- */
async function miPerfil() {
  if (!window.sb) return null;
  try {
    const { data: u } = await window.sb.auth.getUser();
    if (!u || !u.user) return null;
    const { data, error } = await window.sb.from('perfiles').select('*').eq('id', u.user.id).maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('No se pudo leer el perfil:', e.message);
    return null;
  }
}

async function listarPerfiles() {
  if (!window.sb) return [];
  const { data, error } = await window.sb.from('perfiles').select('*').order('email');
  if (error) { console.warn('listarPerfiles:', error.message); return []; }
  return data || [];
}

async function guardarPerfil(id, rol, zonas) {
  if (!window.sb) return { ok: false };
  const { error } = await window.sb.from('perfiles').update({ rol, zonas }).eq('id', id);
  return { ok: !error, error: error ? error.message : null };
}

// Sube al cloud cualquier laguna que esté solo en el caché local (primera migración).
async function subirCacheLocalSiHace() {
  if (!window.sb) return;
  const locales = getLagunas();
  for (const l of locales) {
    await pushLagunaNube(l);
  }
}

/* ---------- Exportar / Importar respaldo manual ---------- */
function exportarJSON() {
  const blob = new Blob([JSON.stringify(getLagunas(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lagunas_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importarJSON(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('Formato inválido');
      setLagunasCache(data);
      // Sube las importadas a la nube también.
      data.forEach((l) => pushLagunaNube(l));
      onDone(null);
    } catch (err) {
      onDone(err);
    }
  };
  reader.readAsText(file);
}

window.Storage = {
  getLagunas,
  getLaguna,
  upsertLaguna,
  deleteLaguna,
  syncFromCloud,
  subirCacheLocalSiHace,
  limpiarCacheLocal,
  miPerfil,
  listarPerfiles,
  guardarPerfil,
  exportarJSON,
  importarJSON,
};
