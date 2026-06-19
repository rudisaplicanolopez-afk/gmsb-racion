/* Persistencia de lagunas en localStorage, con exportar/importar JSON de respaldo. */

const STORAGE_KEY = 'camaron_lagunas_v1';

function getLagunas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLagunas(lagunas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lagunas));
}

function getLaguna(id) {
  return getLagunas().find((l) => l.id === id);
}

function upsertLaguna(laguna) {
  const lagunas = getLagunas();
  const idx = lagunas.findIndex((l) => l.id === laguna.id);
  if (idx >= 0) {
    lagunas[idx] = laguna;
  } else {
    lagunas.push(laguna);
  }
  saveLagunas(lagunas);
}

function deleteLaguna(id) {
  saveLagunas(getLagunas().filter((l) => l.id !== id));
}

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
      saveLagunas(data);
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
  exportarJSON,
  importarJSON,
};
