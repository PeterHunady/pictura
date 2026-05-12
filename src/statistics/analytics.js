// Author: Peter Huňady (xhunadp00)
// File: analytics.js
// Bachelor's Thesis, VUT Brno, 2026

const ENDPOINT = "https://visiontrainings.endora.site/collect/"
const SESSION_COOKIE_NAME = "analytics_session_id"
const SESSION_COOKIE_DAYS = 30

let state = {
  sessionId: null,
  closed: false,
  actions: [],
  boundUnload: false,
  currentFormat: "png",
  sourceFormat: "png"
}

// create UUID manually when crypto.randomUUID is not supported
function uuidv4() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID()
  }

  // set the needed UUID variant bits
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(char) {
    const randomValue = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> 0
    const uuidValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8
    return uuidValue.toString(16)
  })
}

function getCookie(name) {
  const cookies = document.cookie.split(';')

  for (const cookie of cookies) {
    const parts = cookie.trim().split('=')
    const key = parts[0]
    const value = parts[1]

    if (key === name) {
      return decodeURIComponent(value)
    }
  }
  return null
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

function normalizeFmt(format) {
  const normalized = String(format || "").trim().toLowerCase()
  if (normalized === "jpeg") {
    return "jpg"
  }

  if (normalized === "jpg" || normalized === "png" || normalized === "pdf") {
    return normalized
  }
  return "png"
}

// use sendBeacon first, because it can still send data when the page closes
// use fetch with keepalive as a fallback
function postPayload(payload) {
  if (!ENDPOINT) {
    return false
  }

  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: "application/json" })

  if (navigator.sendBeacon) {
    return navigator.sendBeacon(ENDPOINT, blob)
  }

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true
  }).catch(function() {})

  return true
}

export function isActive() { 
  return !!state.sessionId && !state.closed
}

export function hasActive() { 
  return isActive()
}

export function startSession() {
  if (isActive()) {
    return state.sessionId
  }

  let sessionId = getCookie(SESSION_COOKIE_NAME)
  if (!sessionId) {
    sessionId = uuidv4()
    setCookie(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_DAYS)
  }

  state.sessionId = sessionId
  state.closed = false
  state.actions = []
  return state.sessionId
}

export function log(name, data = {}) {
  if (!isActive()) {
    startSession()
  }
  const entry = { t: name }
  Object.assign(entry, data)
  state.actions.push(entry)
}

export function setSourceFormat(fmt) {
  const normalized = normalizeFmt(fmt)
  state.sourceFormat = normalized
  state.currentFormat = normalized
}

export function setExportFormat(format) {
  const to = normalizeFmt(format)
  const from = normalizeFmt(state.currentFormat)

  if (to !== from) {
    log("export_format_change", { from: from, to: to })
    state.currentFormat = to
  }
}

export function endSession(extra = {}) {
  if (!isActive()) {
    return false
  }
  // extra.actions can add last events before sending the data
  let actions = state.actions.slice()
  if (Array.isArray(extra.actions)) {
    actions = actions.concat(extra.actions)
  }

  // do not send an empty session, because there is no useful data
  if (actions.length === 0) {
    state.closed = true
    state.sessionId = null
    state.actions = []
    state.currentFormat = "png"
    state.sourceFormat = "png"
    return false
  }

  const payload = { session_id: state.sessionId, actions: actions }
  const ok = postPayload(payload)
  state.closed = true
  state.sessionId = null
  state.actions = []
  state.currentFormat = "png"
  state.sourceFormat = "png"
  return ok
}

export function endIfActive(extra = {}) {
  if (isActive()) {
    return endSession(extra)
  }

  return false
}

export function bindUnloadOnce() {
  if (state.boundUnload) {
    return
  }

  state.boundUnload = true
  const handler = function() {
    try {
      endIfActive()
    } catch (error) {}
  }

  window.addEventListener("beforeunload", handler)
}
