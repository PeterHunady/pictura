import { ref, computed } from 'vue'

export function useOverlay({ emit, maxW, maxH, canvasWrapper, initialScale, panzoom, pdfCanvas, pdfRenderScale }) {
  const overlayX = ref(0)
  const overlayY = ref(0)
  const overlayW = ref(0)
  const overlayH = ref(0)
  const overlayVisible = ref(true)
  const resizeHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  let resizing = false
  let activeResizeHandle = null
  let dragging = false
  const resizeStart = {}
  const dragStart = {}

  const overlayStyle = computed(() => {
    const scale = initialScale.value || 1

    return {
      position: 'absolute',
      left: `${overlayX.value * scale}px`,
      top: `${overlayY.value * scale}px`,
      width: `${overlayW.value * scale}px`,
      height: `${overlayH.value * scale}px`,
      border: '2px dashed #ff3b30',
      boxSizing: 'border-box',
      pointerEvents: 'none',
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
    const maxWidth = maxW.value || 0
    const maxHeight = maxH.value || 0

    const overlayWidth = Math.max(1, Math.min(w ?? maxWidth, maxWidth || w || 1))
    const overlayHeight = Math.max(1, Math.min(h ?? maxHeight, maxHeight || h || 1))
    const clampedX = maxWidth ? Math.max(0, Math.min(x, maxWidth - overlayWidth)) : (x ?? 0)
    const clampedY = maxHeight ? Math.max(0, Math.min(y, maxHeight - overlayHeight)) : (y ?? 0)

    overlayW.value = Math.round(overlayWidth)
    overlayH.value = Math.round(overlayHeight)
    overlayX.value = Math.round(clampedX)
    overlayY.value = Math.round(clampedY)

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

  function setOverlayVisible(visible) {
    overlayVisible.value = visible
  }

  function getPdfOverlayBox() {
    const canvasHeight = pdfCanvas.value.height
    const scale = pdfRenderScale.value || 1

    return {
      x: overlayX.value / scale,
      y: (canvasHeight - overlayY.value - overlayH.value) / scale,
      width: overlayW.value / scale,
      height: overlayH.value / scale
    }
  }

  function startResize(handle) {
    resizing = true
    activeResizeHandle = handle
    resizeStart.rect = canvasWrapper.value.getBoundingClientRect()

    if (panzoom && panzoom()) {
      panzoom().pause()
    }

    const currentZoom = panzoom && panzoom() ? panzoom().getTransform().scale : 1
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

    const rect = canvasWrapper.value.getBoundingClientRect()
    const scale = resizeStart.scale
    const mouseX = (e.clientX - rect.left) / scale
    const mouseY = (e.clientY - rect.top) / scale

    const maxWidth = maxW.value || 1
    const maxHeight = maxH.value || 1
    const MINW = 10, MINH = 10

    let newX = resizeStart.origX
    let newY = resizeStart.origY
    let newW = resizeStart.origW
    let newH = resizeStart.origH

    if (activeResizeHandle.includes('e')) {
      newW = Math.max(MINW, Math.min(mouseX - resizeStart.origX, maxWidth - resizeStart.origX))
    }

    if (activeResizeHandle.includes('s')) {
      newH = Math.max(MINH, Math.min(mouseY - resizeStart.origY, maxHeight - resizeStart.origY))
    }

    if (activeResizeHandle.includes('w')) {
      newX = Math.max(0, Math.min(mouseX, resizeStart.origX + resizeStart.origW - MINW))
      newW = (resizeStart.origX + resizeStart.origW) - newX
    }

    if (activeResizeHandle.includes('n')) {
      newY = Math.max(0, Math.min(mouseY, resizeStart.origY + resizeStart.origH - MINH))
      newH = (resizeStart.origY + resizeStart.origH) - newY
    }

    newX = Math.max(0, Math.min(newX, maxWidth - MINW))
    newY = Math.max(0, Math.min(newY, maxHeight - MINH))
    newW = Math.max(MINW, Math.min(newW, maxWidth - newX))
    newH = Math.max(MINH, Math.min(newH, maxHeight - newY))

    overlayX.value = Math.round(newX)
    overlayY.value = Math.round(newY)
    overlayW.value = Math.round(newW)
    overlayH.value = Math.round(newH)

    if (overlayX.value + overlayW.value > maxWidth) {
      overlayW.value = maxWidth - overlayX.value
    }
    if (overlayY.value + overlayH.value > maxHeight) {
      overlayH.value = maxHeight - overlayY.value
    }

    emit('update:overlay', { width: overlayW.value, height: overlayH.value, x: overlayX.value, y: overlayY.value })
  }

  function stopResize() {
    resizing = false
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)

    if (panzoom && panzoom()) {
      panzoom().resume()
    }
  }

  function startDrag(e) {
    dragging = true

    if (panzoom && panzoom()) {
      panzoom().pause()
    }

    const currentZoom = panzoom && panzoom() ? panzoom().getTransform().scale : 1
    dragStart.scale = initialScale.value * currentZoom
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

    const moveX = (e.clientX - dragStart.startX) / dragStart.scale
    const moveY = (e.clientY - dragStart.startY) / dragStart.scale
    const maxWidth = maxW.value || 1
    const maxHeight = maxH.value || 1

    let newX = dragStart.origX + moveX
    let newY = dragStart.origY + moveY

    newX = Math.max(0, Math.min(newX, maxWidth - overlayW.value))
    newY = Math.max(0, Math.min(newY, maxHeight - overlayH.value))
    overlayX.value = Math.round(newX)
    overlayY.value = Math.round(newY)

    emit('update:overlay', { width: overlayW.value, height: overlayH.value, x: overlayX.value, y: overlayY.value })
  }

  function stopDrag() {
    dragging = false
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)

    if (panzoom && panzoom()) {
      panzoom().resume()
    }
  }

  return {
    overlayX,
    overlayY,
    overlayW,
    overlayH,
    overlayVisible,
    overlayStyle,
    resizeHandles,
    setupOverlay,
    showOverlay,
    hideOverlay,
    setOverlayVisible,
    getPdfOverlayBox,
    startResize,
    startDrag,
  }
}