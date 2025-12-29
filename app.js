/* UF Pocket – compact date rail + offline cache (IndexedDB) + inline sync status + smart input formatting */
const STORAGE_KEY = "uf-pocket:state:v5";
const DB_NAME = "uf-pocket-db";
const DB_VER = 1;

const el = (id) => document.getElementById(id);

const state = {
  mode: "UF_TO_CLP",
  selectedDate: null,     // YYYY-MM-DD
  savedAt: null,          // ISO string (sync time)
  ufManualOverride: null, // number or null (override for selected date only)
};

let deferredInstallPrompt = null;
let dbPromise = null;
let currentUF = null; // numeric UF value for selected date (manual override or DB)

const LIMITS = { min: "2010-01-01", max: null };

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
/* Accepts inputs like:
   - "1234" "1.234" "$ 1.234" "$1.234,56" "39.716,44" "39,716.44" etc.
   Strategy: keep only digits and separators, decide decimal separator as LAST occurrence of ',' or '.'
   (If only one separator and there are 3 digits after, treat as thousands, not decimal).
*/
function parseFlexibleNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, "");
  s = s.replace(/[^\d.,-]/g, ""); // remove $, UF, etc.
  if (!s) return null;

  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decSep = null;

  if (lastComma === -1 && lastDot === -1) {
    decSep = null;
  } else {
    decSep = lastComma > lastDot ? "," : ".";
  }

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

/* caret preservation: keep digit count before caret */
function reformatInputKeepingCaret(inputEl, mode) {
  const raw = inputEl.value;
  const caret = inputEl.selectionStart ?? raw.length;

  const left = raw.slice(0, caret);
  const digitsLeft = (left.match(/\d/g) || []).length;

  const formatted = formatNumberForModeFromRaw(raw, mode);
  inputEl.value = formatted;

  let pos = 0, seen = 0;
  while (pos < formatted.length) {
    if (/\d/.test(formatted[pos])) seen++;
    if (seen >= digitsLeft) { pos++; break; }
    pos++;
  }
  inputEl.setSelectionRange(pos, pos);
}

/* ---------- UI helpers ---------- */
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
    hint.textContent = "Tip: desliza el carril para cambiar de fecha.";
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

/* ---------- Smooth scroll ease-out ---------- */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function animateScrollTo(container, target, duration = 320) {
  const start = container.scrollLeft;
  const delta = target - start;
  const t0 = performance.now();
  const d = Math.max(160, duration);
  function step(now){
    const t = Math.min(1, (now - t0) / d);
    container.scrollLeft = start + delta * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function centerChip(dateISO, { smooth = true } = {}) {
  const rail = el("dateRail");
  const chip = rail.querySelector(`.chip[data-date="${dateISO}"]`);
  if (!chip) return;
  const railRect = rail.getBoundingClientRect();
  const chipRect = chip.getBoundingClientRect();
  const target = rail.scrollLeft + (chipRect.left - railRect.left) - (railRect.width/2 - chipRect.width/2);
  if (smooth) animateScrollTo(rail, target, 300);
  else rail.scrollLeft = target;
}

/* ---------- Date rail ---------- */
function dayLabel(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "");
  const mon = d.toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
  return { dow: dow.toUpperCase(), day: String(d.getDate()).padStart(2, "0"), mon: mon.toUpperCase() };
}
function formatMonthTitle(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  const m = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}
function buildRail(centerISO) {
  const rail = el("dateRail");
  rail.innerHTML = "";
  const start = clampISO(addDaysISO(centerISO, -31));
  const end = clampISO(addDaysISO(centerISO, 31));
  let cur = start;
  while (cur <= end) {
    const { dow, day, mon } = dayLabel(cur);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.setAttribute("role", "option");
    btn.dataset.date = cur;
    btn.innerHTML = `<div class="dow">${dow}</div><div class="day">${day}</div><div class="mon">${mon}</div>`;
    btn.addEventListener("click", () => setSelectedDate(cur, { userAction: true, fromRail: true }));
    rail.appendChild(btn);
    cur = addDaysISO(cur, 1);
  }
  markSelected(centerISO);
  requestAnimationFrame(() => centerChip(centerISO, { smooth: false }));
}
function markSelected(dateISO) {
  const rail = el("dateRail");
  rail.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selected", c.dataset.date === dateISO));
}
function updateMonthLabel() { el("monthLabel").textContent = state.selectedDate ? formatMonthTitle(state.selectedDate) : "—"; }

let railSnapTimer = null;
function nearestChipToCenter() {
  const rail = el("dateRail");
  const railRect = rail.getBoundingClientRect();
  const cx = railRect.left + railRect.width/2;
  let best = null, bestDist = Infinity;
  rail.querySelectorAll(".chip").forEach((chip) => {
    const r = chip.getBoundingClientRect();
    const cc = r.left + r.width/2;
    const dist = Math.abs(cc - cx);
    if (dist < bestDist) { bestDist = dist; best = chip; }
  });
  return best;
}
function onRailScrollEndSnap() {
  clearTimeout(railSnapTimer);
  railSnapTimer = setTimeout(() => {
    const best = nearestChipToCenter();
    if (!best) return;
    const dateISO = best.dataset.date;
    centerChip(dateISO, { smooth: true });
    if (dateISO !== state.selectedDate) setSelectedDate(dateISO, { userAction: true, fromRail: true });
  }, 140);
}

/* ---------- UI render ---------- */
function renderMode(mode) {
  el("modeUfToClp").classList.toggle("active", mode === "UF_TO_CLP");
  el("modeClpToUf").classList.toggle("active", mode === "CLP_TO_UF");
  el("inputLabel").textContent = mode === "UF_TO_CLP" ? "Monto en UF" : "Monto en pesos (CLP)";
  el("amountInput").placeholder = mode === "UF_TO_CLP" ? "0" : "$ 0";
}

async function renderHeaderAndCompute() {
  const dateISO = state.selectedDate;
  el("ufDateLabel").textContent = dateISO ? `Fecha: ${new Date(dateISO + "T00:00:00").toLocaleDateString("es-CL")}` : "Fecha: —";

  if (state.ufManualOverride && Number.isFinite(state.ufManualOverride)) currentUF = state.ufManualOverride;
  else if (dateISO) currentUF = await idbGetUF(dateISO);
  else currentUF = null;

  el("ufValue").textContent = currentUF ? toUFString(currentUF) : "—";
  el("savedAt").textContent = state.savedAt ? new Date(state.savedAt).toLocaleString("es-CL") : "—";

  const mm = await idbGetMinMaxDates();
  el("cachePill").textContent = (mm.min && mm.max) ? `Cache: ${mm.min} → ${mm.max}` : "Cache: —";

  computeLive();
}

function computeLive() {
  const amount = parseFlexibleNumber(el("amountInput").value);
  if (!currentUF || !Number.isFinite(currentUF) || !Number.isFinite(amount) || amount < 0) {
    el("resultValue").textContent = "—";
    return;
  }
  if (state.mode === "UF_TO_CLP") {
    const clp = amount * currentUF;
    el("resultValue").textContent = `$ ${toCLPString(clp)}`;
  } else {
    const uf = amount / currentUF;
    el("resultValue").textContent = `${toUFString(uf)} UF`;
  }
}

/* Switch mode: move previous result into input */
function transferOnModeSwitch(oldMode, newMode) {
  const amount = parseFlexibleNumber(el("amountInput").value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(currentUF) || !currentUF) {
    el("amountInput").value = formatNumberForModeFromRaw(el("amountInput").value, newMode);
    return;
  }

  if (oldMode === "UF_TO_CLP" && newMode === "CLP_TO_UF") {
    const clp = amount * currentUF;
    el("amountInput").value = `$ ${toCLPString(clp)}`;
  } else if (oldMode === "CLP_TO_UF" && newMode === "UF_TO_CLP") {
    const uf = amount / currentUF;
    el("amountInput").value = toUFString(uf);
  } else {
    el("amountInput").value = formatNumberForModeFromRaw(el("amountInput").value, newMode);
  }
}

/* ---------- Sync rules (inline status) ---------- */
async function bootstrapIfEmpty() {
  if (!navigator.onLine) return;
  if ((await idbCountUF()) > 0) return;

  const startYear = 2010;
  const endYear = new Date().getFullYear() + 1;
  const total = (endYear - startYear + 1);

  for (let i=0, y=startYear; y<=endYear; y++, i++) {
    setSyncInline(`(Actualizando ${y}… ${Math.round(((i+1)/total)*100)}%)`);
    try { await idbBulkPutUF(await fetchUFYear(y)); }
    catch (e) { console.warn("bootstrap year error", y, e); }
  }
  state.savedAt = new Date().toISOString();
  saveState();
  setSyncInline("(Base UF lista)");
}
async function syncFutureHorizon() {
  if (!navigator.onLine) return;
  const today = todayLocalISO();
  const horizon = addDaysISO(today, 35);
  const mm = await idbGetMinMaxDates();
  if (mm.max && mm.max >= horizon) return;

  const y1 = new Date().getFullYear();
  const y2 = y1 + 1;

  setSyncInline(`(Actualizando ${y1})`);
  try { await idbBulkPutUF(await fetchUFYear(y1)); } catch (e) { console.warn("sync year", y1, e); }
  setSyncInline(`(Actualizando ${y2})`);
  try { await idbBulkPutUF(await fetchUFYear(y2)); } catch (e) { console.warn("sync year", y2, e); }

  state.savedAt = new Date().toISOString();
  saveState();
  setSyncInline("(Actualización lista)");
}
async function ensureOfflineRangeForDate(dateISO) {
  if (!navigator.onLine) return;
  const y = Number(dateISO.slice(0,4));

  setSyncInline(`(Actualizando ${y-1})`);
  try { await idbBulkPutUF(await fetchUFYear(y - 1)); } catch (e) { console.warn("prev year fail", y-1, e); }

  setSyncInline(`(Actualizando ${y})`);
  try { await idbBulkPutUF(await fetchUFYear(y)); } catch (e) { console.warn("year fail", y, e); }

  setSyncInline(`(Actualizando ${dateISO})`);
  try { await idbBulkPutUF([await fetchUFForDate(dateISO)]); } catch {}

  state.savedAt = new Date().toISOString();
  saveState();
  setSyncInline("(Offline listo)");
}

/* ---------- Date selection ---------- */
async function setSelectedDate(dateISO, { userAction = false, fromRail = false } = {}) {
  if (!dateISO) return;
  dateISO = clampISO(dateISO);

  const prev = state.selectedDate;
  const farJump = !prev || Math.abs((new Date(dateISO) - new Date(prev)) / 86400000) > 22;

  state.selectedDate = dateISO;
  state.ufManualOverride = null;
  saveState();
  updateMonthLabel();

  if (farJump || !fromRail) buildRail(dateISO);
  else { markSelected(dateISO); centerChip(dateISO, { smooth: userAction }); }

  el("dateInput").value = dateISO;

  if (userAction) {
    if (!navigator.onLine) {
      if (!(await idbHasDate(dateISO))) {
        showAlert(
          "Fuera de rango sin conexión",
          "No tengo guardado el valor UF para esa fecha. Conéctate a internet y vuelve a intentarlo; descargaré esa fecha y 1 año previo para dejarlo offline."
        );
        if (prev) setSelectedDate(prev, { userAction: false, fromRail: false });
        return;
      }
    } else {
      await ensureOfflineRangeForDate(dateISO);
      await syncFutureHorizon();
    }
  }

  await renderHeaderAndCompute();
}

/* ---------- Modal editar UF ---------- */
function openModal() { el("ufManualInput").value = ""; el("modal").classList.remove("hidden"); }
function closeModal() { el("modal").classList.add("hidden"); }
function saveManualUF() {
  const uf = parseFlexibleNumber(el("ufManualInput").value);
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
    toast("Instalada como app.");
  });
  el("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return toast("El navegador no ofrece instalación ahora.");
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
  el("modeUfToClp").addEventListener("click", () => {
    const old = state.mode;
    const next = "UF_TO_CLP";
    if (old === next) return;
    transferOnModeSwitch(old, next);
    state.mode = next;
    saveState();
    renderMode(state.mode);
    el("amountInput").value = formatNumberForModeFromRaw(el("amountInput").value, state.mode);
    computeLive();
  });

  el("modeClpToUf").addEventListener("click", () => {
    const old = state.mode;
    const next = "CLP_TO_UF";
    if (old === next) return;
    transferOnModeSwitch(old, next);
    state.mode = next;
    saveState();
    renderMode(state.mode);
    el("amountInput").value = formatNumberForModeFromRaw(el("amountInput").value, state.mode);
    computeLive();
  });

  el("amountInput").addEventListener("input", () => {
    reformatInputKeepingCaret(el("amountInput"), state.mode);
    computeLive();
  });

  el("amountInput").addEventListener("focus", () => {
    if (state.mode === "CLP_TO_UF" && !el("amountInput").value) {
      el("amountInput").value = "$ ";
      el("amountInput").setSelectionRange(el("amountInput").value.length, el("amountInput").value.length);
    }
  });

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

  el("dateRail").addEventListener("scroll", onRailScrollEndSnap, { passive: true });

  el("openCalendarBtn").addEventListener("click", () => el("dateInput").showPicker?.() || el("dateInput").click());
  el("dateInput").addEventListener("change", async () => {
    const v = el("dateInput").value;
    if (!v) return;
    await setSelectedDate(v, { userAction: true, fromRail: false });
  });

  el("editUfBtn").addEventListener("click", openModal);
  el("closeModalBtn").addEventListener("click", closeModal);
  el("modalBackdrop").addEventListener("click", closeModal);
  el("saveUfBtn").addEventListener("click", saveManualUF);
  el("resetUfBtn").addEventListener("click", resetManualUFToWeb);

  el("alertCloseBtn").addEventListener("click", closeAlert);
  el("alertOkBtn").addEventListener("click", closeAlert);
  el("alertBackdrop").addEventListener("click", closeAlert);

  el("copyBtn").addEventListener("click", async () => {
    const txt = el("resultValue").textContent || "";
    if (!txt || txt === "—") return toast("Nada que copiar.");
    try { await navigator.clipboard.writeText(txt); toast("Copiado."); }
    catch { toast("No se pudo copiar (permiso)."); }
  });

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
}

/* ---------- Boot ---------- */
(async function init(){
  loadState();
  setNetState();

  LIMITS.max = addDaysISO(todayLocalISO(), 40);
  el("dateInput").min = LIMITS.min;
  el("dateInput").max = LIMITS.max;

  const initialDate = clampISO(state.selectedDate || todayLocalISO());
  state.selectedDate = initialDate;
  saveState();

  el("dateInput").value = initialDate;

  renderMode(state.mode);
  updateMonthLabel();
  buildRail(initialDate);

  el("amountInput").value = formatNumberForModeFromRaw(el("amountInput").value, state.mode);

  if (navigator.onLine) {
    try {
      await bootstrapIfEmpty();
      await syncFutureHorizon();
      await ensureOfflineRangeForDate(initialDate);
    } catch (e) { console.warn(e); }
  }

  await setSelectedDate(initialDate, { userAction: false, fromRail: true });
  await renderHeaderAndCompute();

  wire();
  setupInstallUI();
  registerSW();
})();
