const ENDPOINT = "https://visiontrainings.endora.site/collect";
;

let state = {
    sessionId: null,
    closed: false,
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

    if (navigator.sendBeacon) {
        return navigator.sendBeacon(ENDPOINT, blob);
    }

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
    return state.sessionId;
}

export function log() {}

export function endSession(extra = {}) {
    if (!isActive()) return false;
    const actions = Array.isArray(extra.actions) ? extra.actions : [];
    const payload = { session_id: state.sessionId, actions };
    const ok = postPayload(payload);
    state.closed = true;
    return ok;
}

export function endIfActive() { return false; }
export function bindUnloadOnce() {}
