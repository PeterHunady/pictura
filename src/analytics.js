const ENDPOINT = "https://visiontrainings.endora.site/collect/";

let state = {
  sessionId: null,
  closed: false,
  actions: [],
  boundUnload: false,
  currentFormat: "png",
  sourceFormat: "png",
};

function uuidv4() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeFmt(fmt) {
  const f = String(fmt || "").trim().toLowerCase();
  if (f === "jpeg") return "jpg";
  if (f === "jpg" || f === "png" || f === "pdf") return f;
  return "png";
}

function postPayload(payload) {
  if (!ENDPOINT) return false;
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: "application/json" });
  if (navigator.sendBeacon) return navigator.sendBeacon(ENDPOINT, blob);
  fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => {});
  return true;
}

export function isActive() { return !!state.sessionId && !state.closed; }
export function hasActive() { return isActive(); }

export function startSession() {
  if (isActive()) return state.sessionId;
  state.sessionId = uuidv4();
  state.closed = false;
  state.actions = [];
  return state.sessionId;
}

export function log(name, data = {}) {
  if (!isActive()) startSession();
  state.actions.push({ t: name, ts: Date.now(), ...data });
}

export function setSourceFormat(fmt) {
  const f = normalizeFmt(fmt);
  state.sourceFormat = f;
  state.currentFormat = f;
}

export function setExportFormat(fmt) {
  const to = normalizeFmt(fmt);
  const from = normalizeFmt(state.currentFormat);
  if (to !== from) {
    log("export_format_change", { from, to });
    state.currentFormat = to;
  }
}

export function endSession(extra = {}) {
  if (!isActive()) return false;
  const actions = [...state.actions, ...(Array.isArray(extra.actions) ? extra.actions : [])];
  const payload = { session_id: state.sessionId, actions };
  const ok = postPayload(payload);
  state.closed = true;
  state.sessionId = null;
  state.actions = [];
  state.currentFormat = "png";
  state.sourceFormat = "png";
  return ok;
}

export function endIfActive(extra = {}) {
  if (isActive()) return endSession(extra);
  return false;
}

export function bindUnloadOnce() {
  if (state.boundUnload) return;
  state.boundUnload = true;
  const handler = () => { try { endIfActive(); } catch {} };
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") handler(); });
  window.addEventListener("pagehide", handler);
  window.addEventListener("beforeunload", handler);
}
