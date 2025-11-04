import { ref, computed } from 'vue'

export function useOverlay({ emit, maxW, maxH, panCont, initialScale, pz, pdfCanvas, pdfRenderScale }) {
  const overlayX = ref(0)
  const overlayY = ref(0)
  const overlayW = ref(0)
  const overlayH = ref(0)
  const overlayVisible = ref(true)

  const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  let resizing = false
  let resizeDir = null
  const resizeStart = {}

  let dragging = false
  const dragStart = {}

  const overlayStyle = computed(() => {
    const s = initialScale.value || 1

    return {
      position: 'absolute',
      left: `${overlayX.value * s}px`,
      top: `${overlayY.value * s}px`,
      width: `${overlayW.value * s}px`,
      height: `${overlayH.value * s}px`,
      border: '2px dashed #ff3b30',
      boxSizing: 'border-box',
      pointerEvents: 'all',
      zIndex: 5,
    }
  })

  function setupOverlay(w, h) {
    overlayX.value = 0
    overlayY.value = 0
    overlayW.value = w
    overlayH.value = h
    emit('update:overlay', { width: w, height: h, x: 0, y: 0 })
  }

  function showOverlay(w, h, x = overlayX.value, y = overlayY.value) {
    const MW = maxW.value || 0
    const MH = maxH.value || 0

    const cw = Math.max(1, Math.min(w ?? MW, MW || w || 1))
    const ch = Math.max(1, Math.min(h ?? MH, MH || h || 1))
    const cx = MW ? Math.max(0, Math.min(x, MW - cw)) : (x ?? 0)
    const cy = MH ? Math.max(0, Math.min(y, MH - ch)) : (y ?? 0)

    overlayW.value = Math.round(cw)
    overlayH.value = Math.round(ch)
    overlayX.value = Math.round(cx)
    overlayY.value = Math.round(cy)

    emit('update:overlay', {
      width: overlayW.value,
      height: overlayH.value,
      x: overlayX.value,
      y: overlayY.value,
    })
  }

  function hideOverlay() {
    overlayW.value = 0
    overlayH.value = 0
    emit('update:overlay', { width: 0, height: 0, x: 0, y: 0 })
  }

  function toggleOverlayVisibility(visible) {
    overlayVisible.value = visible
  }

  function overlayBoxPdfCoords() {
    const Hpx = pdfCanvas.value.height
    const s = pdfRenderScale.value || 1

    return {
      x: overlayX.value / s,
      y: (Hpx - overlayY.value - overlayH.value) / s,
      width: overlayW.value / s,
      height: overlayH.value / s,
    }
  }

  function startResize(dir) {
    resizing = true
    resizeDir = dir
    resizeStart.rect = panCont.value.getBoundingClientRect()

    if (pz && pz()) {
      pz().pause()
    }

    const currentZoom = pz && pz() ? pz().getTransform().scale : 1
    resizeStart.scale = initialScale.value * currentZoom

    resizeStart.origX = overlayX.value
    resizeStart.origY = overlayY.value
    resizeStart.origW = overlayW.value
    resizeStart.origH = overlayH.value

    window.addEventListener('mousemove', onResize)
    window.addEventListener('mouseup', stopResize)
  }

  function onResize(e) {
    if (!resizing) {
      return
    }

    const rect = panCont.value.getBoundingClientRect()
    const scale = resizeStart.scale

    const natX = (e.clientX - rect.left) / scale
    const natY = (e.clientY - rect.top) / scale

    const MAXW = maxW.value || 1
    const MAXH = maxH.value || 1
    const MINW = 10, MINH = 10

    let NX = resizeStart.origX
    let NY = resizeStart.origY
    let NW = resizeStart.origW
    let NH = resizeStart.origH

    if (resizeDir.includes('e')) {
      NW = Math.max(MINW, Math.min(natX - resizeStart.origX, MAXW - resizeStart.origX))
    }

    if (resizeDir.includes('s')) {
      NH = Math.max(MINH, Math.min(natY - resizeStart.origY, MAXH - resizeStart.origY))
    }

    if (resizeDir.includes('w')) {
      NX = Math.max(0, Math.min(natX, resizeStart.origX + resizeStart.origW - MINW))
      NW = (resizeStart.origX + resizeStart.origW) - NX
    }

    if (resizeDir.includes('n')) {
      NY = Math.max(0, Math.min(natY, resizeStart.origY + resizeStart.origH - MINH))
      NH = (resizeStart.origY + resizeStart.origH) - NY
    }

    NX = Math.max(0, Math.min(NX, MAXW - MINW))
    NY = Math.max(0, Math.min(NY, MAXH - MINH))
    NW = Math.max(MINW, Math.min(NW, MAXW - NX))
    NH = Math.max(MINH, Math.min(NH, MAXH - NY))

    overlayX.value = Math.round(NX)
    overlayY.value = Math.round(NY)
    overlayW.value = Math.round(NW)
    overlayH.value = Math.round(NH)

    if (overlayX.value + overlayW.value > MAXW) {
      overlayW.value = MAXW - overlayX.value
    }
    if (overlayY.value + overlayH.value > MAXH) {
      overlayH.value = MAXH - overlayY.value
    }

    emit('update:overlay', { width: overlayW.value, height: overlayH.value, x: overlayX.value, y: overlayY.value })
  }

  function stopResize() {
    resizing = false
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)
    if (pz && pz()) pz().resume()
  }

  function startDrag(e) {
    dragging = true

    if (pz && pz()) {
      pz().pause()
    }

    const currentZoom = pz && pz() ? pz().getTransform().scale : 1
    dragStart.scale = initialScale.value * currentZoom

    const rect = panCont.value.getBoundingClientRect()
    dragStart.startX = e.clientX
    dragStart.startY = e.clientY
    dragStart.origX = overlayX.value
    dragStart.origY = overlayY.value

    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function onDrag(e) {
    if (!dragging) {
      return
    }

    const dx = (e.clientX - dragStart.startX) / dragStart.scale
    const dy = (e.clientY - dragStart.startY) / dragStart.scale

    const MAXW = maxW.value || 1
    const MAXH = maxH.value || 1

    let newX = dragStart.origX + dx
    let newY = dragStart.origY + dy

    newX = Math.max(0, Math.min(newX, MAXW - overlayW.value))
    newY = Math.max(0, Math.min(newY, MAXH - overlayH.value))

    overlayX.value = Math.round(newX)
    overlayY.value = Math.round(newY)

    emit('update:overlay', { width: overlayW.value, height: overlayH.value, x: overlayX.value, y: overlayY.value })
  }

  function stopDrag() {
    dragging = false
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
    if (pz && pz()) pz().resume()
  }

  return {
    overlayX,
    overlayY,
    overlayW,
    overlayH,
    overlayVisible,
    overlayStyle,
    dirs,
    setupOverlay,
    showOverlay,
    hideOverlay,
    toggleOverlayVisibility,
    overlayBoxPdfCoords,
    startResize,
    startDrag,
  }
}