/* UF Pocket – dual fields + mini keypad + offline UF cache (IndexedDB) + inline sync status */
const STORAGE_KEY = "uf-pocket:state:v18";
const DB_NAME = "uf-pocket-db";
const DB_VER = 1;

const el = (id) => document.getElementById(id);

const state = {
  // Reuse same naming as earlier builds so the UI (segmented buttons) stays familiar
  // UF_TO_CLP => UF field is active; CLP_TO_UF => CLP field is active
  mode: "UF_TO_CLP",
  selectedDate: null,     // YYYY-MM-DD
  savedAt: null,          // ISO string (sync time)
  ufManualOverride: null, // number or null (override for selected date only)
};

let deferredInstallPrompt = null;
let dbPromise = null;
let currentUF = null; // numeric UF value for selected date (manual override or DB)
let activeField = "UF"; // "UF" | "CLP"

const calc = {
  UF: { entry: "", acc: null, op: null },
  CLP:{ entry: "", acc: null, op: null },
};

const LIMITS = { min: "2010-01-01", max: null };

const elUF = () => el("ufInput");
const elCLP = () => el("clpInput");

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
function clampISO(iso) {
  if (iso < LIMITS.min) return LIMITS.min;
  if (LIMITS.max && iso > LIMITS.max) return LIMITS.max;
  return iso;
}
function isoToDMY(iso) {
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/* ---------- Number parsing & formatting ---------- */
function parseFlexibleNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, "");
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;

  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decSep = null;

  if (lastComma === -1 && lastDot === -1) decSep = null;
  else decSep = lastComma > lastDot ? "," : ".";

  let intPart = s;
  let decPart = "";

  if (decSep) {
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);

    const onlyOneSep = (s.split(",").length - 1) + (s.split(".").length - 1) === 1;
    if (onlyOneSep && decPart.length === 3) {
      intPart = (intPart + decPart);
      decPart = "";
      decSep = null;
    }
  }

  intPart = intPart.replace(/[.,]/g, "");
  decPart = decPart.replace(/[.,]/g, "");
  if (!intPart) intPart = "0";

  const numStr = decPart ? `${intPart}.${decPart}` : intPart;
  const n = Number(numStr);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function formatGroupedInt(intStr) {
  const chars = intStr.split("");
  let out = "";
  let count = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    out = chars[i] + out;
    count++;
    if (count === 3 && i !== 0) {
      out = "." + out;
      count = 0;
    }
  }
  return out;
}

function extractEditParts(raw) {
  let s = String(raw ?? "").trim().replace(/\s+/g, "");
  s = s.replace(/[^\d.,]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const sep = (lastComma === -1 && lastDot === -1) ? null : (lastComma > lastDot ? "," : ".");
  let intPart = s;
  let decPart = "";
  if (sep) {
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  decPart = decPart.replace(/[.,]/g, "");
  return { sep, intPart: intPart || "0", decPart: decPart || "" };
}

function formatUFInputFromParts(parts) {
  const intFmt = formatGroupedInt(parts.intPart);
  const dec = parts.decPart.slice(0, 4);
  if (parts.sep) return `${intFmt},${dec}`;
  return intFmt;
}
function formatCLPInputFromParts(parts) {
  const intFmt = formatGroupedInt(parts.intPart);
  const dec = parts.decPart.slice(0, 2);
  if (parts.sep) return `$ ${intFmt},${dec}`;
  return `$ ${intFmt}`;
}

function formatNumberForModeFromRaw(raw, mode) {
  const parts = extractEditParts(raw);
  return (mode === "CLP_TO_UF") ? formatCLPInputFromParts(parts) : formatUFInputFromParts(parts);
}

function toUFString(n) {
  return new Intl.NumberFormat("es-CL", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
}
function toCLPString(n) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
}
function ufCanonical(n) {
  if (!Number.isFinite(n)) return "";
  let s = n.toFixed(4);
  // trim trailing zeros but keep at least 1 decimal if user expects decimals? (keep simple)
  s = s.replace(/\.?0+$/,"");
  return s;
}
function clpCanonical(n) {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function fieldMode(field) {
  return field === "CLP" ? "CLP_TO_UF" : "UF_TO_CLP";
}
function fieldWrapId(field) {
  return field === "CLP" ? "clpFieldWrap" : "ufFieldWrap";
}
function fieldEl(field) {
  return field === "CLP" ? elCLP() : elUF();
}
function otherField(field) {
  return field === "CLP" ? "UF" : "CLP";
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
    hint.textContent = "Tip: toca UF o CLP y usa el teclado para ingresar valores.";
    hint.style.color = "";
  }, 3200);
}

/* ---------- Inline sync status (non-blocking) ---------- */
let syncTimer = null;
function setSyncInline(text) {
  const box = el("syncInline");
  if (!box) return;
  box.textContent = text || "";
  if (syncTimer) clearTimeout(syncTimer);
  if (text) syncTimer = setTimeout(() => { box.textContent = ""; }, 2600);
}


/* ---------- Bootstrap modal (first run) ---------- */
function showBootProgress(line, pct) {
  const m = el("bootModal");
  if (!m) return;
  m.classList.remove("hidden");
  if (el("bootLine")) el("bootLine").textContent = line || "Preparando…";
  const p = Math.max(0, Math.min(100, Number(pct ?? 0)));
  if (el("bootPct")) el("bootPct").textContent = `${Math.round(p)}%`;
  if (el("bootBarFill")) el("bootBarFill").style.width = `${p}%`;
}
function hideBootProgress() {
  const m = el("bootModal");
  if (!m) return;
  m.classList.add("hidden");
}

/* ---------- Alert modal ---------- */
function showAlert(title, text) {
  el("alertTitle").textContent = title || "Aviso";
  el("alertText").textContent = text || "";
  el("alertModal").classList.remove("hidden");
}
function closeAlert() { el("alertModal").classList.add("hidden"); }

/* ---------- State persistence ---------- */
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
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

/* ---------- IndexedDB ---------- */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("uf")) {
        const store = db.createObjectStore("uf", { keyPath: "date" });
        store.createIndex("byDate", "date", { unique: true });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
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
    const req = tx.objectStore(storeName).get(key);
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
async function idbHasDate(dateISO) { return !!(await idbGet("uf", dateISO)); }
async function idbGetUF(dateISO) { return (await idbGet("uf", dateISO))?.value ?? null; }

async function idbSetMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.objectStore("meta").put({ key, value });
  });
}
async function idbGetMeta(key) {
  const row = await idbGet("meta", key);
  return row ? row.value : null;
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
      if (cur) { dates.push(cur.key); cur.continue(); }
      else {
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
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  const s = data?.serie?.[0];
  if (!s || typeof s.valor !== "number") throw new Error("Estructura inesperada");
  const gotISO = mindicadorDateToISO(s.fecha) || dateISO;
  return { date: gotISO, value: s.valor };
}
async function fetchUFYear(year) {
  const url = `https://mindicador.cl/api/uf/${year}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
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

/* ---------- Smooth scroll ease-out ---------- */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function animateScrollTo(container, target, duration = 220) {
  const token = ++scrollAnimToken;
  const start = container.scrollLeft;
  const delta = target - start;
  const t0 = performance.now();
  const d = Math.max(140, duration);
  function step(now){
    if (token !== scrollAnimToken) return; // cancelled
    const t = Math.min(1, (now - t0) / d);
    container.scrollLeft = start + delta * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function centerChip(dateISO, { smooth = true } = {}) {
  const rail = el("dateRail");
  rail.addEventListener("scroll", onRailScroll, { passive: true });
  el("todayBtn").addEventListener("click", async () => {
    const t = todayLocalISO();
    await setSelectedDate(t, { userAction: true, fromRail: false });
  });

  el("openCalendarBtn").addEventListener("click", () => el("dateInput").showPicker?.() || el("dateInput").click());
  el("dateInput").addEventListener("change", async () => {
    const v = el("dateInput").value;
    if (!v) return;
    await setSelectedDate(v, { userAction: true, fromRail: false });
  });

  // Refresh
  el("refreshBtn").addEventListener("click", async () => {
    if (!navigator.onLine) return toast("Offline: no puedo actualizar.");
    try {
      await bootstrapIfEmpty();
      await ensureOfflineRangeForDate(state.selectedDate || todayLocalISO());
      await syncFutureHorizon();
      toast("Actualizado.");
      await renderHeader();
      updateConversionFromField(activeField);
    } catch (e) {
      console.warn(e);
      toast("No se pudo actualizar.");
    }
  });

  // Keypad (event delegation)
  el("keypad").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-k]");
    if (!btn) return;
    const k = btn.dataset.k;

    const f = activeField;

    if (k >= "0" && k <= "9") return appendDigit(f, k);
    if (k === ".") return appendDecimal(f);
    if (k === "bk") return backspace(f);
    if (k === "c") return clearAll(f);
    if (k === "+" || k === "-") return pressOperator(f, k);
    if (k === "=") return pressEquals(f);
  });

  // Copy "Convertido" line
  el("copyBtn").addEventListener("click", async () => {
    const target = (state.mode === "UF_TO_CLP") ? el("clpInput") : el("ufInput");
    let txt = (target?.value || "").trim();
    if (!txt) return toast("Nada que copiar.");

    const withFmt = !!el("copyFormatToggle")?.checked;
    if (!withFmt) {
      // Quita signo $ y separadores de miles (.) y espacios.
      // Mantiene coma decimal si existiera.
      txt = txt.replace(/\$/g, "").replace(/\s/g, "");
      txt = txt.replace(/\./g, "");
    }

    try { await navigator.clipboard.writeText(txt); toast("Copiado."); }
    catch { toast("No se pudo copiar (permiso)."); }
  });

  // Manual UF modal
  el("editUfBtn").addEventListener("click", openModal);
  el("closeModalBtn").addEventListener("click", closeModal);
  el("modalBackdrop").addEventListener("click", closeModal);
  el("saveUfBtn").addEventListener("click", saveManualUF);
  el("resetUfBtn").addEventListener("click", resetManualUFToWeb);

  // Alert
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
      await renderHeader();
      updateConversionFromField(activeField);
      toast("Online: cache sincronizada.");
    } catch (e) { console.warn(e); }
  });
  window.addEventListener("offline", () => setNetState());
}

/* ---------- Boot ---------- */
(async function init(){
  loadState();
  setNetState();

  LIMITS.max = publishedMaxDateISO(todayLocalISO());
  el("dateInput").min = LIMITS.min;
  el("dateInput").max = LIMITS.max;

  const initialDate = clampISO(todayLocalISO());
  state.selectedDate = initialDate;
  saveState();

  el("dateInput").value = initialDate;

  updateMonthLabel();
  buildRail(initialDate);

  // active field from saved mode
  activeField = (state.mode === "CLP_TO_UF") ? "CLP" : "UF";
  renderModeButtons();
  el(fieldWrapId("UF")).classList.toggle("active", activeField === "UF");
  el(fieldWrapId("CLP")).classList.toggle("active", activeField === "CLP");

  if (navigator.onLine) {
    try {
      await bootstrapIfEmpty();
      await syncFutureHorizon();
      await ensureOfflineRangeForDate(initialDate);
    } catch (e) { console.warn(e); }
  }

  await setSelectedDate(initialDate, { userAction: false, fromRail: true });
  await renderHeader();

  // start with zeros (empty)
  clearField("UF");
  clearField("CLP");
  refreshConvertedLine();

  wire();
  setupInstallUI();
  registerSW();
})();
function publishedMaxDateISO(todayISO) {
  // Según práctica: el BC publica valores desde el día 10 del mes hasta el día 9 del mes siguiente.
  const d = new Date(todayISO + "T00:00:00");
  const day = d.getDate();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-11
  const target = new Date(d);
  if (day >= 10) {
    // 9 del mes siguiente
    target.setMonth(m + 1, 9);
  } else {
    // 9 del mes actual
    target.setMonth(m, 9);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


function hoursSinceISO(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}


