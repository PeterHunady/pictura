// Author: Peter Huňady (xhunadp00)
// File: useOverlay.js
// Bachelor's Thesis, VUT Brno, 2026

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
  const resizeStart = {}

  const overlayStyle = computed(function() {
    const scale = initialScale.value || 1

    return {
      position: 'absolute',
      left: `${overlayX.value * scale}px`,
      top: `${overlayY.value * scale}px`,
      width: `${overlayW.value * scale}px`,
      height: `${overlayH.value * scale}px`,
      border: '2px dashed #ff3b30',
      boxSizing: 'border-box',
      pointerEvents: 'none', // let mouse events go to the canvas under it
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

    // when maxWidth or maxHeight is only a fallback value, the image is not loaded yet, so use the given size instead of limiting it
    const effectiveMaxW = maxWidth > 1 ? maxWidth : (w || 1)
    const effectiveMaxH = maxHeight > 1 ? maxHeight : (h || 1)

    let overlayWidth = w || effectiveMaxW
    if (overlayWidth < 1) {
      overlayWidth = 1
    }
    if (overlayWidth > effectiveMaxW) {
      overlayWidth = effectiveMaxW
    }

    let overlayHeight = h || effectiveMaxH
    if (overlayHeight < 1) {
      overlayHeight = 1
    }
    if (overlayHeight > effectiveMaxH) {
      overlayHeight = effectiveMaxH
    }

    let newX = 0
    if (effectiveMaxW > overlayWidth) {
      newX = x
      if (newX < 0) {
        newX = 0
      }

      if (newX > effectiveMaxW - overlayWidth) {
        newX = effectiveMaxW - overlayWidth
      }
    }

    let newY = 0
    if (effectiveMaxH > overlayHeight) {
      newY = y
      if (newY < 0) {
        newY = 0
      }

      if (newY > effectiveMaxH - overlayHeight) {
        newY = effectiveMaxH - overlayHeight
      }
    }

    overlayW.value = Math.round(overlayWidth)
    overlayH.value = Math.round(overlayHeight)
    overlayX.value = Math.round(newX)
    overlayY.value = Math.round(newY)

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

  // convert overlay position to PDF position, PDF starts from the bottom-left, so Y is opposite to canvas
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

    // pause panzoom, so resizing does not move the canvas too
    if (panzoom && panzoom()) {
      panzoom().pause()
    }

    // combine initial scale and current zoom to convert mouse position to image pixels
    let currentZoom = 1
    if (panzoom && panzoom()) {
      currentZoom = panzoom().getTransform().scale
    }

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
    const MINW = 10
    const MINH = 10

    let newX = resizeStart.origX
    let newY = resizeStart.origY
    let newW = resizeStart.origW
    let newH = resizeStart.origH

    // handle names like 'nw' or 'se' show which sides they change, west and north handles move the start point and change the size
    if (activeResizeHandle.includes('e')) {
      newW = mouseX - resizeStart.origX
      if (newW < MINW) {
        newW = MINW
      }

      if (newW > maxWidth - resizeStart.origX) {
        newW = maxWidth - resizeStart.origX
      }
    }

    if (activeResizeHandle.includes('s')) {
      newH = mouseY - resizeStart.origY
      if (newH < MINH) {
        newH = MINH
      }

      if (newH > maxHeight - resizeStart.origY) {
        newH = maxHeight - resizeStart.origY
      }
    }

    if (activeResizeHandle.includes('w')) {
      newX = mouseX
      if (newX < 0) {
        newX = 0
      }

      if (newX > resizeStart.origX + resizeStart.origW - MINW) {
        newX = resizeStart.origX + resizeStart.origW - MINW
      }
      newW = (resizeStart.origX + resizeStart.origW) - newX
    }

    if (activeResizeHandle.includes('n')) {
      newY = mouseY
      if (newY < 0) {
        newY = 0
      }
      
      if (newY > resizeStart.origY + resizeStart.origH - MINH) {
        newY = resizeStart.origY + resizeStart.origH - MINH
      }
      newH = (resizeStart.origY + resizeStart.origH) - newY
    }

    if (newX < 0) { newX = 0 }
    if (newX > maxWidth - MINW) { newX = maxWidth - MINW }
    if (newY < 0) { newY = 0 }
    if (newY > maxHeight - MINH) { newY = maxHeight - MINH }
    if (newW < MINW) { newW = MINW }
    if (newW > maxWidth - newX) { newW = maxWidth - newX }
    if (newH < MINH) { newH = MINH }
    if (newH > maxHeight - newY) { newH = maxHeight - newY }

    overlayX.value = Math.round(newX)
    overlayY.value = Math.round(newY)
    overlayW.value = Math.round(newW)
    overlayH.value = Math.round(newH)

    // check limits again, because rounding can move the edge outside the image
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
  }
}