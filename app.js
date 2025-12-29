/* UF Pocket – dual fields + mini keypad + offline UF cache (IndexedDB) + inline sync status */
const STORAGE_KEY = "uf-pocket:state:v8";
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

/* ---------- Header render ---------- */
async function renderHeader() {
  const dateISO = state.selectedDate;
  el("ufDateLabel").textContent = dateISO ? `Fecha: ${new Date(dateISO + "T00:00:00").toLocaleDateString("es-CL")}` : "Fecha: —";

  if (state.ufManualOverride && Number.isFinite(state.ufManualOverride)) currentUF = state.ufManualOverride;
  else if (dateISO) currentUF = await idbGetUF(dateISO);
  else currentUF = null;

  el("ufValue").textContent = currentUF ? toUFString(currentUF) : "—";
  el("savedAt").textContent = state.savedAt ? new Date(state.savedAt).toLocaleString("es-CL") : "—";

  const mm = await idbGetMinMaxDates();
  el("cachePill").textContent = (mm.min && mm.max) ? `Cache: ${mm.min} → ${mm.max}` : "Cache: —";
}

/* ---------- Active field / segmented buttons ---------- */
function renderModeButtons() {
  el("modeUfToClp").classList.toggle("active", state.mode === "UF_TO_CLP");
  el("modeClpToUf").classList.toggle("active", state.mode === "CLP_TO_UF");
}
function setActive(field, { fromButton = false } = {}) {
  activeField = field;
  state.mode = (field === "UF") ? "UF_TO_CLP" : "CLP_TO_UF";
  saveState();
  renderModeButtons();
  el(fieldWrapId("UF")).classList.toggle("active", field === "UF");
  el(fieldWrapId("CLP")).classList.toggle("active", field === "CLP");

  // Update micro "Convertido" line immediately
  refreshConvertedLine();

  if (fromButton) {
    // optional toast
  }
}

/* ---------- Field display & conversion ---------- */
function getDisplayNumber(field) {
  const c = calc[field];
  if (c.entry !== "") return c.entry;
  if (c.acc !== null && Number.isFinite(c.acc)) return String(c.acc);
  return "";
}
function setDisplayFromCalc(field) {
  const raw = getDisplayNumber(field);
  const formatted = raw ? formatNumberForModeFromRaw(raw, fieldMode(field)) : "";
  fieldEl(field).value = formatted;
}

function refreshConvertedLine() {
  const from = activeField;
  const to = otherField(from);
  const v = fieldEl(to).value;
  if (!v) { el("resultValue").textContent = "—"; return; }
  el("resultValue").textContent = (to === "UF") ? `${v} UF` : v;
}

function clearField(field) {
  calc[field].entry = "";
  calc[field].acc = null;
  calc[field].op = null;
  fieldEl(field).value = "";
}

function effectiveValue(field) {
  const raw = getDisplayNumber(field);
  const n = parseFlexibleNumber(raw);
  return Number.isFinite(n) ? n : null;
}

/* We'll implement without recursion: set target calc state directly */
function setTargetValue(target, num) {
  if (target === "CLP") {
    calc.CLP.entry = clpCanonical(num);
    calc.CLP.acc = null;
    calc.CLP.op = null;
  } else {
    calc.UF.entry = ufCanonical(num);
    calc.UF.acc = null;
    calc.UF.op = null;
  }
  setDisplayFromCalc(target);
}

function updateConversionFromField(field) {
  if (!currentUF || !Number.isFinite(currentUF)) {
    clearField(otherField(field));
    refreshConvertedLine();
    return;
  }
  const val = effectiveValue(field);
  const tgt = otherField(field);

  if (val === null) {
    clearField(tgt);
    refreshConvertedLine();
    return;
  }

  if (field === "UF") {
    const clp = val * currentUF;
    setTargetValue("CLP", clp);
  } else {
    const uf = val / currentUF;
    setTargetValue("UF", uf);
  }
  refreshConvertedLine();
}

/* ---------- Mini keypad calculator logic (per-field) ---------- */
function normalizeEntryForAppend(cur) {
  // Remove leading zeros unless "0." form
  if (cur === "0") return "";
  return cur;
}
function appendDigit(field, d) {
  const c = calc[field];
  // If currently showing accumulator (entry empty) and operator is set, start a fresh entry
  if (c.entry === "" && c.op) {
    // start new entry
  }
  c.entry = normalizeEntryForAppend(c.entry) + d;
  setDisplayFromCalc(field);
  updateConversionFromField(field);
}
function appendDecimal(field) {
  const c = calc[field];
  if (c.entry === "") c.entry = "0.";
  else if (!c.entry.includes(".")) c.entry += ".";
  setDisplayFromCalc(field);
  updateConversionFromField(field);
}
function backspace(field) {
  const c = calc[field];
  if (c.entry === "") {
    // if no entry, allow backspace to clear accumulator
    if (c.acc !== null) { c.acc = null; c.op = null; }
    setDisplayFromCalc(field);
    updateConversionFromField(field);
    return;
  }
  c.entry = c.entry.slice(0, -1);
  setDisplayFromCalc(field);
  updateConversionFromField(field);
}
function clearAll(field) {
  calc[field] = { entry: "", acc: null, op: null };
  fieldEl(field).value = "";
  updateConversionFromField(field);
}

function applyOp(acc, b, op) {
  if (op === "+") return acc + b;
  if (op === "-") return acc - b;
  return b;
}
function pressOperator(field, op) {
  const c = calc[field];
  const cur = effectiveValue(field);

  if (cur === null) {
    // If nothing typed but there is an acc, just update operator
    if (c.acc !== null) c.op = op;
    return;
  }

  if (c.acc === null) c.acc = cur;
  else if (c.op) c.acc = applyOp(c.acc, cur, c.op);
  else c.acc = cur;

  c.op = op;
  c.entry = ""; // next digits start a new entry
  // Show accumulator in field display
  fieldEl(field).value = formatNumberForModeFromRaw(String(c.acc), fieldMode(field));
  updateConversionFromField(field);
}
function pressEquals(field) {
  const c = calc[field];
  const cur = effectiveValue(field);

  if (c.acc === null) {
    // nothing pending; keep as-is
    updateConversionFromField(field);
    return;
  }

  const b = (cur === null) ? c.acc : cur;
  const res = c.op ? applyOp(c.acc, b, c.op) : b;

  c.acc = null;
  c.op = null;
  c.entry = (field === "CLP") ? clpCanonical(res) : ufCanonical(res);

  setDisplayFromCalc(field);
  updateConversionFromField(field);
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

  await renderHeader();
  updateConversionFromField(activeField);
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
  renderHeader().then(() => updateConversionFromField(activeField));
}
async function resetManualUFToWeb() {
  if (!navigator.onLine) return toast("Offline: no puedo restaurar desde la web.");
  const dateISO = state.selectedDate || todayLocalISO();
  await ensureOfflineRangeForDate(dateISO);
  state.ufManualOverride = null;
  saveState();
  closeModal();
  toast("UF restaurada desde la web.");
  await renderHeader();
  updateConversionFromField(activeField);
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
  try { await navigator.serviceWorker.register("./sw.js?v=8"); }
  catch (e) { console.warn("SW error", e); }
}

/* ---------- Events ---------- */
function wire() {
  // Segmented buttons now just choose the active field (and can transfer value if other field has data)
  el("modeUfToClp").addEventListener("click", () => {
    // If CLP has value, transfer it to UF (like previous behavior)
    if (effectiveValue("CLP") !== null && currentUF) {
      const uf = effectiveValue("CLP") / currentUF;
      calc.UF = { entry: ufCanonical(uf), acc: null, op: null };
      setDisplayFromCalc("UF");
      setActive("UF", { fromButton: true });
      updateConversionFromField("UF");
      return;
    }
    setActive("UF", { fromButton: true });
  });
  el("modeClpToUf").addEventListener("click", () => {
    if (effectiveValue("UF") !== null && currentUF) {
      const clp = effectiveValue("UF") * currentUF;
      calc.CLP = { entry: clpCanonical(clp), acc: null, op: null };
      setDisplayFromCalc("CLP");
      setActive("CLP", { fromButton: true });
      updateConversionFromField("CLP");
      return;
    }
    setActive("CLP", { fromButton: true });
  });

  // Tapping the field selects it as active (without opening native keyboard)
  el(fieldWrapId("UF")).addEventListener("click", () => setActive("UF"));
  el(fieldWrapId("CLP")).addEventListener("click", () => setActive("CLP"));

  // Date rail
  el("dateRail").addEventListener("scroll", onRailScrollEndSnap, { passive: true });
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
    const txt = el("resultValue").textContent || "";
    if (!txt || txt === "—") return toast("Nada que copiar.");
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

  LIMITS.max = addDaysISO(todayLocalISO(), 40);
  el("dateInput").min = LIMITS.min;
  el("dateInput").max = LIMITS.max;

  const initialDate = clampISO(state.selectedDate || todayLocalISO());
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
