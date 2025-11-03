// analytics.js
const ENDPOINT = "https://https://visiontrainings.endora.site/collect";

let state = {
  sessionId: null,
  closed: false,
  startedAt: null,
  actions: [],
  boundUnload: false,
};

function uuidv4() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function postPayload(payload) {
  if (!ENDPOINT) {
    console.warn("[analytics] PICTURA_ANALYTICS_URL nie je nastavené – nič neposielam.");
    return false;
  }
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  if (navigator.sendBeacon) return navigator.sendBeacon(ENDPOINT, blob);

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    mode: "no-cors",
  }).catch(() => {});
  return true;
}

export function isActive() { return !!state.sessionId && !state.closed; }
export function hasActive() { return isActive(); }

export function startSession() {
  if (isActive()) return state.sessionId;
  state.sessionId = uuidv4();
  state.closed = false;
  state.startedAt = Date.now();
  state.actions = [];
  return state.sessionId;
}

// ← TOTO si chcel: logovanie akcií počas editácie
export function log(name, data = {}) {
  if (!isActive()) startSession();
  state.actions.push({
    t: name,
    ts: Date.now(),
    ...data,
  });
}

export function endSession(extra = {}) {
  if (!isActive()) return false;

  const actions = [
    ...state.actions,
    ...(Array.isArray(extra.actions) ? extra.actions : []),
  ];

  const payload = {
    session_id: state.sessionId,
    started_at: state.startedAt,
    ended_at: Date.now(),
    actions,
    // voliteľné doplnky od teba
    ...('meta' in extra ? { meta: extra.meta } : {}),
  };

  const ok = postPayload(payload);

  // uzavri lokálny stav
  state.closed = true;
  state.sessionId = null;
  state.startedAt = null;
  state.actions = [];

  return ok;
}

export function endIfActive(extra = {}) {
  if (isActive()) return endSession(extra);
  return false;
}

// poisti sa, že pri zavretí tabu sa odošle session
export function bindUnloadOnce() {
  if (state.boundUnload) return;
  state.boundUnload = true;

  const handler = () => {
    try { endIfActive(); } catch {}
  };

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handler();
  });
  window.addEventListener("pagehide", handler);
  window.addEventListener("beforeunload", handler);
}
