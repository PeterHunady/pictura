// Author: Peter Huňady (xhunadp00)
// File: usePanzoom.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref, nextTick } from 'vue'
import createPanzoom from 'panzoom'

const PZ_MIN_ZOOM = 0.2
const PZ_MAX_ZOOM = 20
  
export function usePanzoom({
  isPdf,
  pdfCanvas,
  imgEl,
  previewWrap,
  canvasWrapper,
  markCanvas,
  emit,
  displayScale,
  referenceWidthMm,
  screenDPI,
  basePixelWidth,
  minScalePercent,
  maxScalePercent,
  highlightOn,
  endPreviewBackgroundColor
}) {
  let panzoom = null
  // scale where the whole image fits in the view, used as the base for zoom
  const initialScale = ref(1)
  const minZoomScale = ref(null)
  const maxZoomScale = ref(null)
  let lastWrapWidth = null

  const lastPointer = { x: null, y: null }
  let pointerListenersAdded = false

  function rememberPointer(e) {
    lastPointer.x = e.clientX
    lastPointer.y = e.clientY
  }

  // convert image scale to percent based on the reference width, 100% means the image has the same width as referenceWidthMm on screen
  function getScaleLimits() {
    const naturalWidth = basePixelWidth.value || 1
    const referenceWidth = (referenceWidthMm.value / 25.4) * screenDPI.value

    const minScale = minZoomScale.value || ((initialScale.value || 1) * PZ_MIN_ZOOM)
    const maxScale = maxZoomScale.value || ((initialScale.value || 1) * PZ_MAX_ZOOM)
    const minPercent = (naturalWidth * minScale / referenceWidth) * 100
    const maxPercent = (naturalWidth * maxScale / referenceWidth) * 100
    return { minPercent: minPercent, maxPercent: maxPercent }
  }

  function updateScaleLimits() {
    const { minPercent, maxPercent } = getScaleLimits()
    minScalePercent.value = minPercent
    maxScalePercent.value = maxPercent
  }

  function updateDisplayScale() {
    if (!panzoom || !basePixelWidth.value) {
      return
    }

    const currentTransform = panzoom.getTransform()
    const absoluteScale = initialScale.value * currentTransform.scale
    const currentWidth = basePixelWidth.value * absoluteScale
    const referenceWidth = (referenceWidthMm.value / 25.4) * screenDPI.value

    const percent = (currentWidth / referenceWidth) * 100
    displayScale.value = percent

    emit('update:scale', {
      displayScale: displayScale.value,
      referenceWidthMm: referenceWidthMm.value,
      basePixelWidth: basePixelWidth.value,
      minDisplayScale: minScalePercent.value,
      maxDisplayScale: maxScalePercent.value,
    })
  }

  // reverse of updateDisplayScale — converts a target percentage to a panzoom zoom factor and applies it
  function setDisplayScale(newScale) {
    if (!panzoom || !basePixelWidth.value) {
      return
    }

    let newPercent = Number(newScale) || 0
    if (newPercent < minScalePercent.value) {
      newPercent = minScalePercent.value
    }

    if (newPercent > maxScalePercent.value) {
      newPercent = maxScalePercent.value
    }

    const referenceWidth = (referenceWidthMm.value / 25.4) * screenDPI.value
    const newScreenWidth = (newPercent / 100) * referenceWidth
    const newImageScale = newScreenWidth / basePixelWidth.value
    const currentTransform = panzoom.getTransform()
    const currentZoom = currentTransform.scale || 1
    const minUserZoom = panzoom.getMinZoom ? panzoom.getMinZoom() : PZ_MIN_ZOOM
    const maxUserZoom = panzoom.getMaxZoom ? panzoom.getMaxZoom() : PZ_MAX_ZOOM

    let newZoom = newImageScale / (initialScale.value || 1)
    if (newZoom < minUserZoom) {
      newZoom = minUserZoom
    }
    if (newZoom > maxUserZoom) {
      newZoom = maxUserZoom
    }

    const zoomFactor = newZoom / currentZoom

    // skip very small changes, so rounding does not make the view shake
    if (!isFinite(zoomFactor) || Math.abs(zoomFactor - 1) < 0.0001) {
      return
    }

    const wrap = previewWrap.value
    if (!wrap) {
      return
    }

    const wrapRect = wrap.getBoundingClientRect()
    const centerX = wrapRect.left + wrapRect.width / 2
    const centerY = wrapRect.top + wrapRect.height / 2
    panzoom.zoomTo(centerX, centerY, zoomFactor)
    nextTick(updateDisplayScale)
  }

  function setReferenceWidth(newWidth) {
    referenceWidthMm.value = newWidth
    updateScaleLimits()
    updateDisplayScale()
  }

  async function initPanzoom() {
    await nextTick()
    const el = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!el) {
      return
    }

    const naturalWidth = isPdf.value ? el.width : el.naturalWidth
    const naturalHeight = isPdf.value ? el.height : el.naturalHeight

    const wrap = previewWrap.value

    if (wrap && !pointerListenersAdded) {
      wrap.addEventListener('mousemove', rememberPointer)
      wrap.addEventListener('mousedown', rememberPointer)

      wrap.addEventListener('wheel', function(event) {
          rememberPointer(event)
          // ctrl or meta with wheel means zoom, so let panzoom handle it
          if (event.ctrlKey || event.metaKey) {
            return
          }

          // passive: false is needed so we can stop the page from scrolling
          event.preventDefault()
          const scrollSpeed = 0.5
          if (panzoom) {
            const dx = -event.deltaX * scrollSpeed
            const dy = -event.deltaY * scrollSpeed
            panzoom.moveBy(dx, dy)
          }
        }, { passive: false }
      )

      pointerListenersAdded = true
    }

    // use the smaller scale so the whole image fits without being cut
    const scaleW = Math.floor(wrap.clientWidth) / naturalWidth
    const scaleH = Math.floor(wrap.clientHeight) / naturalHeight
    initialScale.value = Math.min(scaleW, scaleH)

    if (panzoom) {
      panzoom.dispose()
      panzoom = null
    }

    canvasWrapper.value.style.transform = 'translate(0px, 0px) scale(1)'
    canvasWrapper.value.style.width = `${naturalWidth * initialScale.value}px`
    canvasWrapper.value.style.height = `${naturalHeight * initialScale.value}px`
    minZoomScale.value = initialScale.value * PZ_MIN_ZOOM
    maxZoomScale.value = initialScale.value * PZ_MAX_ZOOM

    panzoom = createPanzoom(canvasWrapper.value, {
      // panzoom uses relative zoom, so divide by initialScale to get the right limits
      minZoom: minZoomScale.value / initialScale.value,
      maxZoom: maxZoomScale.value / initialScale.value,
      bounds: false,
      boundsPadding: 0.1,

      beforeWheel: function (e) {
        const isZoomGesture = e.ctrlKey || e.metaKey
        // return true to make panzoom skip this event, because normal scroll is used for panning
        return !isZoomGesture
      },
    })

    panzoom.on('zoom', updateDisplayScale)
    panzoom.on('pan', updateDisplayScale)

    if (wrap) {
      // center the image when it loads for the first time
      const contentWidth = naturalWidth * initialScale.value
      const contentHeight = naturalHeight * initialScale.value
      const offsetX = (wrap.clientWidth - contentWidth) / 2
      const offsetY = (wrap.clientHeight - contentHeight) / 2
      panzoom.moveTo(offsetX, offsetY)

      lastWrapWidth = wrap.clientWidth
    }

    markCanvas.value.width = naturalWidth
    markCanvas.value.height = naturalHeight
    const markContext = markCanvas.value.getContext('2d')
    markContext.clearRect(0, 0, naturalWidth, naturalHeight)
    highlightOn.value = false

    basePixelWidth.value = naturalWidth
    updateScaleLimits()
    updateDisplayScale()
    endPreviewBackgroundColor()
  }

  function handleWrapperResize() {
    const el = isPdf.value ? pdfCanvas.value : imgEl.value
    const wrap = previewWrap.value
    
    if (!el || !wrap || !canvasWrapper.value || !panzoom) {
      return
    }

    const newWrapWidth = wrap.clientWidth

    if (lastWrapWidth == null) {
      lastWrapWidth = newWrapWidth
      return
    }

    const deltaW = newWrapWidth - lastWrapWidth
    lastWrapWidth = newWrapWidth
    const transform = panzoom.getTransform()
    // move by half of the width change, so the image stays centered
    panzoom.moveTo(transform.x + deltaW/2, transform.y)

    updateDisplayScale()
  }

  function disposePanzoom() {
    if (panzoom) {
      panzoom.dispose()
      panzoom = null
    }
  }

  function getPanzoom() {
    return panzoom
  }

  function centerImage() {
    if (!panzoom) {
      return
    }

    const wrap = previewWrap.value
    const el = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!wrap || !el) {
      return
    }

    const naturalWidth = isPdf.value ? el.width : el.naturalWidth
    const naturalHeight = isPdf.value ? el.height : el.naturalHeight
    const currentTransform = panzoom.getTransform()
    const absoluteScale = initialScale.value * currentTransform.scale

    const contentWidth = naturalWidth * absoluteScale
    const contentHeight = naturalHeight * absoluteScale
    const offsetX = (wrap.clientWidth - contentWidth) / 2
    const offsetY = (wrap.clientHeight - contentHeight) / 2

    panzoom.moveTo(offsetX, offsetY)
  }

  return {
    initialScale,
    minZoomScale,
    maxZoomScale,
    initPanzoom,
    updateDisplayScale,
    setDisplayScale,
    setReferenceWidth,
    updateScaleLimits,
    handleWrapperResize,
    disposePanzoom,
    getPanzoom,
    centerImage,
  }
}