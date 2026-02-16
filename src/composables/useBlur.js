import { ref, watch, nextTick } from 'vue'

export function useBlur({
  isPdf,
  imgEl,
  editCanvas,
  toolCanvas,
  preview,
  originalFileName,
  blurActive,
  blurRadius,
  blurIntensity,
  emit,
  setHasAlpha,
  canvasHasAlpha,
  pushHistory
}) {
  let blurPainting = false
  let blurPendingFrame = false
  let blurLastPt = null
  let blurCanvasReady = false
  const blurSuppressNextImgLoadResync = ref(false)

  function prepareBlurCanvases(force = false) {
    if (!blurActive.value) return
    if (isPdf.value) return

    const img = imgEl.value
    const ec = editCanvas.value
    const tc = toolCanvas.value
    if (!img || !ec || !tc || !img.naturalWidth || !img.naturalHeight) return

    if (!force && blurCanvasReady && ec.width === img.naturalWidth && ec.height === img.naturalHeight) {
      return
    }

    if (ec.width !== img.naturalWidth || ec.height !== img.naturalHeight) {
      ec.width = img.naturalWidth
      ec.height = img.naturalHeight
    }
    if (tc.width !== img.naturalWidth || tc.height !== img.naturalHeight) {
      tc.width = img.naturalWidth
      tc.height = img.naturalHeight
    }

    const ctx = ec.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    ctx.clearRect(0, 0, ec.width, ec.height)
    ctx.drawImage(img, 0, 0)

    clearBlurCursor()
    blurCanvasReady = true
  }

  function canvasPtFromEvent(e) {
    const tc = toolCanvas.value
    if (!tc) return null
    const rect = tc.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (tc.width / rect.width)
    const y = (e.clientY - rect.top) * (tc.height / rect.height)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      x: Math.max(0, Math.min(tc.width, x)),
      y: Math.max(0, Math.min(tc.height, y))
    }
  }

  function clearBlurCursor() {
    const tc = toolCanvas.value
    if (!tc) return
    const ctx = tc.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, tc.width, tc.height)
  }

  function drawBlurCursor(pt) {
    const tc = toolCanvas.value
    if (!tc || !pt) return
    const ctx = tc.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, tc.width, tc.height)

    const r = Math.max(1, Number(blurRadius.value) || 1)
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.stroke()
  }

  function applyBlurAt(pt) {
    const ec = editCanvas.value
    if (!ec || !pt) return
    const ctx = ec.getContext('2d')

    const r = Math.max(1, Number(blurRadius.value) || 1)
    const blurPx = Math.max(0, Number(blurIntensity.value) || 0)

    ctx.save()
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'
    ctx.drawImage(ec, 0, 0)
    ctx.restore()
  }

  function commitBlurToPreview() {
    if (isPdf.value) return
    const ec = editCanvas.value
    if (!ec || !ec.width || !ec.height) return

    const base = (originalFileName.value || 'image').replace(/\.[^.]+$/, '')
    const newName = `${base}-blur.png`
    const dataUrl = ec.toDataURL('image/png')

    const b64 = dataUrl.split(',')[1] || ''
    const size = atob(b64).length

    blurSuppressNextImgLoadResync.value = true

    preview.value = dataUrl
    emit('update:preview', preview.value)

    const alphaNow = canvasHasAlpha(ec)
    setHasAlpha(alphaNow)

    emit('update:meta', {
      name: newName,
      type: 'image/png',
      size,
      width: ec.width,
      height: ec.height,
      lastModified: Date.now()
    })

    emit('blur-stroke', {
      radius: blurRadius.value,
      intensity: blurIntensity.value
    })
  }

  function onBlurPointerDown(e) {
    if (!blurActive.value) return
    if (isPdf.value) return
    if (!preview.value) return

    if (!blurCanvasReady) prepareBlurCanvases(true)

    const pt = canvasPtFromEvent(e)
    if (!pt) return

    blurPainting = true
    blurLastPt = pt

    try { toolCanvas.value?.setPointerCapture?.(e.pointerId) } catch (_) {}

    emit('editing')

    pushHistory()
    applyBlurAt(pt)
    drawBlurCursor(pt)
  }

  function onBlurPointerMove(e) {
    if (!blurActive.value) return
    if (isPdf.value) return
    const pt = canvasPtFromEvent(e)
    if (!pt) return

    blurLastPt = pt

    if (blurPendingFrame) return
    blurPendingFrame = true

    requestAnimationFrame(() => {
      blurPendingFrame = false
      if (!blurLastPt) return
      drawBlurCursor(blurLastPt)

      if (blurPainting) {
        applyBlurAt(blurLastPt)
      }
    })
  }

  function onBlurPointerUp(e) {
    if (!blurActive.value) return
    if (isPdf.value) return

    if (blurPainting) {
      blurPainting = false
      commitBlurToPreview()
    }

    try { toolCanvas.value?.releasePointerCapture?.(e.pointerId) } catch (_) {}
  }

  function onBlurPointerLeave() {
    if (!blurActive.value) return
    if (blurPainting) {
      blurPainting = false
      commitBlurToPreview()
    }
    clearBlurCursor()
  }

  function setupBlurWatchers() {
    watch(blurActive, (on) => {
      if (on) {
        blurCanvasReady = false
        blurSuppressNextImgLoadResync.value = false
        nextTick(() => prepareBlurCanvases(true))
      } else {
        if (blurPainting) {
          blurPainting = false
          commitBlurToPreview()
        }
        clearBlurCursor()
        blurCanvasReady = false
      }
    })

    watch(blurRadius, () => {
      if (blurActive.value && blurLastPt) drawBlurCursor(blurLastPt)
    })
  }

  function handleImageLoadedBlur() {
    if (blurSuppressNextImgLoadResync.value) {
      blurSuppressNextImgLoadResync.value = false
    } else {
      blurCanvasReady = false
      prepareBlurCanvases(true)
    }
  }

  return {
    blurSuppressNextImgLoadResync,
    prepareBlurCanvases,
    onBlurPointerDown,
    onBlurPointerMove,
    onBlurPointerUp,
    onBlurPointerLeave,
    setupBlurWatchers,
    handleImageLoadedBlur
  }
}
