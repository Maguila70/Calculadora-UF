/* UF Pocket – lógica PWA + calculadora */
const STORAGE_KEY = "uf-pocket:state:v1";

const el = (id) => document.getElementById(id);

const state = {
  uf: null,          // number (CLP por UF)
  ufDate: null,      // string (YYYY-MM-DD o DD-MM-YYYY)
  savedAt: null,     // ISO string
  mode: "UF_TO_CLP", // or "CLP_TO_UF"
};

let deferredInstallPrompt = null;

function parseNumberLoose(input) {
  if (!input) return null;
  // Permite "39.716,44" o "39716.44" o "39 716,44"
  const s = String(input)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")        // quita separadores miles tipo 39.716,44
    .replace(/,/g, ".");        // coma decimal -> punto
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatCLP(n) {
  if (!Number.isFinite(n)) return "—";
  // CLP sin decimales, con separador de miles local (es-CL)
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

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      if (typeof obj.uf === "number") state.uf = obj.uf;
      if (typeof obj.ufDate === "string") state.ufDate = obj.ufDate;
      if (typeof obj.savedAt === "string") state.savedAt = obj.savedAt;
      if (obj.mode === "UF_TO_CLP" || obj.mode === "CLP_TO_UF") state.mode = obj.mode;
    }
  } catch {}
}

function renderHeader() {
  el("ufValue").textContent = state.uf ? formatUF(state.uf) : "—";
  el("ufDate").textContent = state.ufDate ? `Fecha: ${state.ufDate}` : "Fecha: —";
  el("savedAt").textContent = state.savedAt ? new Date(state.savedAt).toLocaleString("es-CL") : "—";
}

function setMode(mode) {
  state.mode = mode;
  saveState();

  const a = el("modeUfToClp");
  const b = el("modeClpToUf");
  a.classList.toggle("active", mode === "UF_TO_CLP");
  b.classList.toggle("active", mode === "CLP_TO_UF");

  el("inputLabel").textContent = mode === "UF_TO_CLP" ? "Monto en UF" : "Monto en pesos (CLP)";
  el("amountInput").value = "";
  el("resultValue").textContent = "—";
}

function compute() {
  const uf = state.uf;
  const amount = parseNumberLoose(el("amountInput").value);
  if (!uf || !Number.isFinite(uf) || !Number.isFinite(amount)) {
    el("resultValue").textContent = "—";
    return;
  }

  if (state.mode === "UF_TO_CLP") {
    const clp = amount * uf;
    el("resultValue").textContent = `$ ${formatCLP(clp)}`;
  } else {
    const ufOut = amount / uf;
    el("resultValue").textContent = `${formatUF(ufOut)} UF`;
  }
}

async function fetchUF() {
  // Fuente: mindicador.cl (sin API key) – entrega uf.valor en CLP. 
  // Docs: https://mindicador.cl/ (ejemplo fetch)
  const url = "https://mindicador.cl/api";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.uf || typeof data.uf.valor !== "number") {
    throw new Error("Estructura inesperada");
  }
  // data.uf.fecha viene como ISO (p.ej. 2025-12-29T04:00:00.000Z)
  const iso = data.uf.fecha;
  let dateStr = null;
  if (typeof iso === "string") {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      // Mostrar en formato dd-mm-aaaa
      dateStr = d.toLocaleDateString("es-CL");
    }
  }
  state.uf = data.uf.valor;
  state.ufDate = dateStr ?? "—";
  state.savedAt = new Date().toISOString();
  saveState();
  renderHeader();
  compute();
}

function toast(msg) {
  // Simple toast using hint area
  const hint = el("hint");
  hint.textContent = msg;
  hint.style.color = "rgba(255,255,255,.82)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    hint.textContent = "Tip: funciona offline usando el último valor guardado. Si no puede actualizar, edita el valor UF manualmente.";
    hint.style.color = "";
  }, 3800);
}

/* Modal */
function openModal() {
  el("ufManualInput").value = state.uf ? String(state.uf).replace(".", ",") : "";
  el("ufManualDate").value = state.ufDate && state.ufDate !== "—" ? state.ufDate : "";
  el("modal").classList.remove("hidden");
}
function closeModal() {
  el("modal").classList.add("hidden");
}
function saveManualUF() {
  const uf = parseNumberLoose(el("ufManualInput").value);
  if (!Number.isFinite(uf) || uf <= 0) {
    toast("Ingresa un valor UF válido (ej: 39.716,44).");
    return;
  }
  state.uf = uf;
  state.ufDate = el("ufManualDate").value?.trim() || "Manual";
  state.savedAt = new Date().toISOString();
  saveState();
  renderHeader();
  compute();
  closeModal();
  toast("UF guardada localmente.");
}

/* PWA install */
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
    if (!deferredInstallPrompt) {
      toast("El navegador no ofrece instalación en este momento.");
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome !== "accepted") {
      toast("Instalación cancelada.");
    }
  });
}

/* Service Worker */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("SW error", e);
  }
}

/* Events */
function wire() {
  el("modeUfToClp").addEventListener("click", () => setMode("UF_TO_CLP"));
  el("modeClpToUf").addEventListener("click", () => setMode("CLP_TO_UF"));

  el("amountInput").addEventListener("input", compute);

  el("refreshBtn").addEventListener("click", async () => {
    try {
      await fetchUF();
      toast("UF actualizada desde la web.");
    } catch (e) {
      console.warn(e);
      toast("No se pudo actualizar. Estás usando el último valor guardado.");
    }
  });

  el("editUfBtn").addEventListener("click", openModal);
  el("closeModalBtn").addEventListener("click", closeModal);
  el("modalBackdrop").addEventListener("click", closeModal);
  el("saveUfBtn").addEventListener("click", saveManualUF);

  el("resetUfBtn").addEventListener("click", async () => {
    try {
      await fetchUF();
      closeModal();
      toast("UF restaurada desde la web.");
    } catch {
      toast("No se pudo restaurar desde la web.");
    }
  });

  el("copyBtn").addEventListener("click", async () => {
    const txt = el("resultValue").textContent || "";
    if (!txt || txt === "—") return toast("Nada que copiar.");
    try {
      await navigator.clipboard.writeText(txt);
      toast("Copiado.");
    } catch {
      toast("No se pudo copiar (permiso).");
    }
  });

  window.addEventListener("online", () => { setNetState(); });
  window.addEventListener("offline", () => { setNetState(); });
}

/* Boot */
(async function init(){
  loadState();
  setNetState();
  renderHeader();
  setMode(state.mode);

  // Intenta actualizar si está online, sino queda con valor local
  if (navigator.onLine) {
    try { await fetchUF(); }
    catch { /* ignore */ }
  }
  compute();
  wire();
  setupInstallUI();
  registerSW();
})();
