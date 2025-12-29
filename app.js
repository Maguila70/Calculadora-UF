/* UF Pocket – selector de fecha + offline cache (IndexedDB) + PWA install */
const STORAGE_KEY = "uf-pocket:state:v2";
const DB_NAME = "uf-pocket-db";
const DB_VER = 1;

const el = (id) => document.getElementById(id);

const state = {
  mode: "UF_TO_CLP",          // or "CLP_TO_UF"
  selectedDate: null,         // YYYY-MM-DD
  savedAt: null,              // ISO string (sync time)
  ufManualOverride: null,     // number or null (override for current selected date only)
};

let deferredInstallPrompt = null;
let dbPromise = null;

function todayLocalISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDMY(iso) {
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function parseNumberLoose(input) {
  if (!input) return null;
  const s = String(input)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")  // separador miles
    .replace(/,/g, "."); // coma decimal
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatCLP(n) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
}
function formatUF(n) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CL", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
}

function setNetState() {
  const online = navigator.onLine;
  el("netState").textContent = online ? "Online" : "Offline";
  el("netState").style.color = online ? "rgba(127,240,200,.90)" : "rgba(255,210,125,.90)";
}

function toast(msg) {
  const hint = el("hint");
  hint.textContent = msg;
  hint.style.color = "rgba(255,255,255,.82)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    hint.textContent = "Tip: al estar online sincroniza y guarda valores para usar sin conexión.";
    hint.style.color = "";
  }, 4200);
}

/* ---------- Alert modal ---------- */
function showAlert(title, text) {
  el("alertTitle").textContent = title || "Aviso";
  el("alertText").textContent = text || "";
  el("alertModal").classList.remove("hidden");
}
function closeAlert() {
  el("alertModal").classList.add("hidden");
}

/* ---------- State persistence ---------- */
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      if (obj.mode === "UF_TO_CLP" || obj.mode === "CLP_TO_UF") state.mode = obj.mode;
      if (typeof obj.selectedDate === "string") state.selectedDate = obj.selectedDate;
      if (typeof obj.savedAt === "string") state.savedAt = obj.savedAt;
      if (typeof obj.ufManualOverride === "number") state.ufManualOverride = obj.ufManualOverride;
    }
  } catch {}
}

/* ---------- IndexedDB helpers ---------- */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("uf")) {
        const store = db.createObjectStore("uf", { keyPath: "date" }); // date: YYYY-MM-DD
        store.createIndex("byDate", "date", { unique: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbBulkPutUF(rows) {
  if (!rows || !rows.length) return;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("uf", "readwrite");
    const store = tx.objectStore("uf");
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    for (const r of rows) store.put(r);
  });
}

async function idbCountUF() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("uf", "readonly");
    const req = tx.objectStore("uf").count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function idbHasDate(dateISO) {
  const row = await idbGet("uf", dateISO);
  return !!row;
}

async function idbGetUF(dateISO) {
  const row = await idbGet("uf", dateISO);
  return row?.value ?? null;
}

async function idbGetMinMaxDates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("uf", "readonly");
    const store = tx.objectStore("uf");
    const dates = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        dates.push(cur.key);
        cur.continue();
      } else {
        if (!dates.length) return resolve({ min: null, max: null });
        dates.sort();
        resolve({ min: dates[0], max: dates[dates.length - 1] });
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------- mindicador API ---------- */
function mindicadorDateToISO(isoStr) {
  // "2025-12-29T04:00:00.000Z" -> "2025-12-29"
  if (!isoStr || typeof isoStr !== "string") return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchUFForDate(dateISO) {
  const url = `https://mindicador.cl/api/uf/${isoToDMY(dateISO)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const s = data?.serie?.[0];
  if (!s || typeof s.valor !== "number") throw new Error("Estructura inesperada");
  const gotISO = mindicadorDateToISO(s.fecha) || dateISO;
  return { date: gotISO, value: s.valor };
}

async function fetchUFYear(year) {
  const url = `https://mindicador.cl/api/uf/${year}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const serie = Array.isArray(data?.serie) ? data.serie : null;
  if (!serie) throw new Error("Estructura inesperada");
  const map = new Map();
  for (const item of serie) {
    if (!item || typeof item.valor !== "number") continue;
    const iso = mindicadorDateToISO(item.fecha);
    if (!iso) continue;
    map.set(iso, item.valor);
  }
  return Array.from(map, ([date, value]) => ({ date, value }));
}

/* ---------- UI ---------- */
function renderMode(mode) {
  el("modeUfToClp").classList.toggle("active", mode === "UF_TO_CLP");
  el("modeClpToUf").classList.toggle("active", mode === "CLP_TO_UF");
  el("inputLabel").textContent = mode === "UF_TO_CLP" ? "Monto en UF" : "Monto en pesos (CLP)";
}

async function renderHeaderAndCompute() {
  const dateISO = state.selectedDate;
  el("ufDateLabel").textContent = dateISO ? `Fecha: ${new Date(dateISO + "T00:00:00").toLocaleDateString("es-CL")}` : "Fecha: —";

  let uf = null;
  if (state.ufManualOverride && Number.isFinite(state.ufManualOverride)) uf = state.ufManualOverride;
  else if (dateISO) uf = await idbGetUF(dateISO);

  el("ufValue").textContent = uf ? formatUF(uf) : "—";
  el("savedAt").textContent = state.savedAt ? new Date(state.savedAt).toLocaleString("es-CL") : "—";

  const mm = await idbGetMinMaxDates();
  el("cachePill").textContent = (mm.min && mm.max) ? `Cache: ${mm.min} → ${mm.max}` : "Cache: —";

  compute(uf);
}

function compute(ufOverride) {
  const uf = ufOverride ?? null;
  const amount = parseNumberLoose(el("amountInput").value);
  if (!uf || !Number.isFinite(uf) || !Number.isFinite(amount)) {
    el("resultValue").textContent = "—";
    return;
  }
  if (state.mode === "UF_TO_CLP") el("resultValue").textContent = `$ ${formatCLP(amount * uf)}`;
  else el("resultValue").textContent = `${formatUF(amount / uf)} UF`;
}

/* ---------- Sync rules ---------- */
async function bootstrapIfEmpty() {
  if (!navigator.onLine) return;
  if ((await idbCountUF()) > 0) return;

  toast("Inicializando cache UF desde 2010… (1ª vez)");
  const startYear = 2010;
  const endYear = new Date().getFullYear() + 1; // incluye futuro cercano
  for (let y = startYear; y <= endYear; y++) {
    try {
      const rows = await fetchUFYear(y);
      await idbBulkPutUF(rows);
      toast(`Inicializando cache UF… (${y})`);
    } catch (e) {
      console.warn("bootstrap year error", y, e);
    }
  }
  state.savedAt = new Date().toISOString();
  saveState();
}

async function syncFutureHorizon() {
  if (!navigator.onLine) return;

  const today = todayLocalISO();
  const horizon = addDaysISO(today, 35);

  const mm = await idbGetMinMaxDates();
  if (mm.max && mm.max >= horizon) return;

  const y1 = new Date().getFullYear();
  const y2 = y1 + 1;

  try { await idbBulkPutUF(await fetchUFYear(y1)); } catch (e) { console.warn("sync year", y1, e); }
  try { await idbBulkPutUF(await fetchUFYear(y2)); } catch (e) { console.warn("sync year", y2, e); }

  state.savedAt = new Date().toISOString();
  saveState();
}

async function ensureOfflineRangeForDate(dateISO) {
  if (!navigator.onLine) return;

  const y = Number(dateISO.slice(0,4));
  try { await idbBulkPutUF(await fetchUFYear(y - 1)); } catch (e) { console.warn("prev year fail", y-1, e); }
  try { await idbBulkPutUF(await fetchUFYear(y)); } catch (e) { console.warn("year fail", y, e); }

  // Asegurar valor exacto del día
  try { await idbBulkPutUF([await fetchUFForDate(dateISO)]); } catch {}
  state.savedAt = new Date().toISOString();
  saveState();
}

/* ---------- Date selection ---------- */
async function setSelectedDate(dateISO, { userAction = false } = {}) {
  if (!dateISO) return;
  state.selectedDate = dateISO;
  state.ufManualOverride = null;
  saveState();

  if (userAction) {
    if (!navigator.onLine) {
      if (!(await idbHasDate(dateISO))) {
        showAlert(
          "Fuera de rango sin conexión",
          "No tengo guardado el valor UF para esa fecha. Conéctate a internet y vuelve a intentarlo; descargaré esa fecha y 1 año previo para dejarlo offline."
        );
        el("dateInput").value = state.selectedDate || todayLocalISO();
        return;
      }
    } else {
      toast("Sincronizando datos para dejar offline…");
      await ensureOfflineRangeForDate(dateISO);
      await syncFutureHorizon();
    }
  }

  await renderHeaderAndCompute();
}

function setDateInputBounds() {
  el("dateInput").min = "2010-01-01";
  el("dateInput").max = addDaysISO(todayLocalISO(), 40);
}

/* ---------- Modal editar UF ---------- */
function openModal() {
  el("ufManualInput").value = "";
  el("ufManualDate").value = state.selectedDate ? new Date(state.selectedDate + "T00:00:00").toLocaleDateString("es-CL") : "";
  el("modal").classList.remove("hidden");
}
function closeModal() { el("modal").classList.add("hidden"); }
function saveManualUF() {
  const uf = parseNumberLoose(el("ufManualInput").value);
  if (!Number.isFinite(uf) || uf <= 0) return toast("Ingresa un valor UF válido (ej: 39.716,44).");
  state.ufManualOverride = uf;
  saveState();
  closeModal();
  toast("UF aplicada manualmente (solo para esta fecha).");
  renderHeaderAndCompute();
}
async function resetManualUFToWeb() {
  if (!navigator.onLine) return toast("Offline: no puedo restaurar desde la web.");
  const dateISO = state.selectedDate || todayLocalISO();
  await ensureOfflineRangeForDate(dateISO);
  state.ufManualOverride = null;
  saveState();
  closeModal();
  toast("UF restaurada desde la web.");
  await renderHeaderAndCompute();
}

/* ---------- PWA install ---------- */
function setupInstallUI() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el("installBtn").classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    el("installBtn").classList.add("hidden");
    toast("Listo: instalada como app.");
  });
  el("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return toast("El navegador no ofrece instalación en este momento.");
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
}

/* ---------- SW ---------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("./sw.js"); }
  catch (e) { console.warn("SW error", e); }
}

/* ---------- Events ---------- */
function wire() {
  el("modeUfToClp").addEventListener("click", () => { state.mode="UF_TO_CLP"; saveState(); renderMode(state.mode); compute(); });
  el("modeClpToUf").addEventListener("click", () => { state.mode="CLP_TO_UF"; saveState(); renderMode(state.mode); compute(); });

  el("amountInput").addEventListener("input", () => compute());

  el("refreshBtn").addEventListener("click", async () => {
    if (!navigator.onLine) return toast("Offline: no puedo actualizar.");
    try {
      await bootstrapIfEmpty();
      await ensureOfflineRangeForDate(state.selectedDate || todayLocalISO());
      await syncFutureHorizon();
      toast("Actualizado.");
      await renderHeaderAndCompute();
    } catch (e) {
      console.warn(e);
      toast("No se pudo actualizar.");
    }
  });

  el("todayBtn").addEventListener("click", async () => {
    const t = todayLocalISO();
    el("dateInput").value = t;
    await setSelectedDate(t, { userAction: true });
  });

  el("dateInput").addEventListener("change", async () => {
    const v = el("dateInput").value;
    if (!v) return;
    await setSelectedDate(v, { userAction: true });
  });

  el("editUfBtn").addEventListener("click", openModal);
  el("closeModalBtn").addEventListener("click", closeModal);
  el("modalBackdrop").addEventListener("click", closeModal);
  el("saveUfBtn").addEventListener("click", saveManualUF);
  el("resetUfBtn").addEventListener("click", resetManualUFToWeb);

  // alert modal
  el("alertCloseBtn").addEventListener("click", closeAlert);
  el("alertOkBtn").addEventListener("click", closeAlert);
  el("alertBackdrop").addEventListener("click", closeAlert);

  window.addEventListener("online", async () => {
    setNetState();
    try {
      await bootstrapIfEmpty();
      await syncFutureHorizon();
      const d = state.selectedDate || todayLocalISO();
      if (!(await idbHasDate(d))) await ensureOfflineRangeForDate(d);
      await renderHeaderAndCompute();
      toast("Online: cache sincronizada.");
    } catch (e) { console.warn(e); }
  });
  window.addEventListener("offline", () => setNetState());

  el("copyBtn").addEventListener("click", async () => {
    const txt = el("resultValue").textContent || "";
    if (!txt || txt === "—") return toast("Nada que copiar.");
    try { await navigator.clipboard.writeText(txt); toast("Copiado."); }
    catch { toast("No se pudo copiar (permiso)."); }
  });
}

/* ---------- Boot ---------- */
(async function init(){
  loadState();
  setNetState();
  setDateInputBounds();

  const initialDate = state.selectedDate || todayLocalISO();
  el("dateInput").value = initialDate;
  renderMode(state.mode);

  if (navigator.onLine) {
    try {
      await bootstrapIfEmpty();     // si está vacío, baja desde 2010
      await syncFutureHorizon();    // verifica valores futuros (~1 mes)
      await ensureOfflineRangeForDate(initialDate); // guarda fecha seleccionada + 1 año previo
    } catch (e) { console.warn(e); }
  }

  await setSelectedDate(initialDate, { userAction: false });

  wire();
  setupInstallUI();
  registerSW();
})();
