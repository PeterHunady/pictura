const ENDPOINT = "https://visiontrainings.endora.site/collect/";
const SESSION_COOKIE_NAME = "analytics_session_id";
const SESSION_COOKIE_DAYS = 30;

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

function getCookie(name) {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
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

  let sessionId = getCookie(SESSION_COOKIE_NAME);
  if (!sessionId) {
    sessionId = uuidv4();
    setCookie(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_DAYS);
  }

  state.sessionId = sessionId;
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
  if (!isActive()) {
    console.warn('[Analytics] endSession called but no active session');
    return false;
  }
  const actions = [...state.actions, ...(Array.isArray(extra.actions) ? extra.actions : [])];

  console.log('[Analytics] endSession - state.actions:', state.actions);
  console.log('[Analytics] endSession - extra.actions:', extra.actions);
  console.log('[Analytics] endSession - combined actions:', actions);

  if (actions.length === 0) {
    console.warn('[Analytics] No actions to send, skipping payload');
    state.closed = true;
    state.sessionId = null;
    state.actions = [];
    state.currentFormat = "png";
    state.sourceFormat = "png";
    return false;
  }

  const payload = { session_id: state.sessionId, actions };
  console.log('[Analytics] Sending payload:', payload);
  const ok = postPayload(payload);
  console.log('[Analytics] Payload sent, result:', ok);
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
  window.addEventListener("pagehide", handler);
  window.addEventListener("beforeunload", handler);
}
