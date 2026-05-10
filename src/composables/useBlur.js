import { ref, watch, nextTick } from 'vue'
import { getCanvasPosition, clearToolCanvas, prepareToolCanvas, saveCanvas } from './canvasToolUtils'

const CURSOR_OUTER_LINE_WIDTH = 1.5
const CURSOR_INNER_LINE_WIDTH = 1
const BLUR_STEP_FRACTION = 0.5
const MIN_BLUR_STEP_PX = 2

export function useBlur({
  isPdf,
  pdfCanvas,
  imgEl,
  editCanvas,
  toolCanvas,
  preview,
  originalFileName,
  originalFileType,
  blurActive,
  blurRadius,
  blurIntensity,
  emit,
  setHasAlpha,
  canvasHasAlpha,
  pushHistory
}) {
  let blurPainting = false
  let blurFrameActive = false
  let blurPointerPosition = null
  let blurLastAppliedPosition = null
  let blurCanvasReady = false
  const blurSkipImgLoad = ref(false)

  function prepareBlurCanvas(force = false) {
    const prepared = prepareToolCanvas({
      active: blurActive, isPdf, pdfCanvas, imgEl, editCanvas, toolCanvas,
      canvasReady: blurCanvasReady, force
    })

    if (prepared) {
      clearToolCanvas(toolCanvas.value)
      blurCanvasReady = true
    }
  }

  function blurCursor(position) {
    const toolCanvasEl = toolCanvas.value
    if (!toolCanvasEl || !position) {
      return
    }

    const context = toolCanvasEl.getContext('2d')
    const radius = Math.max(1, Number(blurRadius.value) || 1)

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, toolCanvasEl.width, toolCanvasEl.height)
    context.beginPath()
    context.arc(position.x, position.y, radius, 0, Math.PI * 2)
    context.lineWidth = CURSOR_OUTER_LINE_WIDTH
    context.strokeStyle = 'rgba(0,0,0,0.85)'
    context.stroke()
    context.beginPath()
    context.arc(position.x, position.y, radius, 0, Math.PI * 2)
    context.lineWidth = CURSOR_INNER_LINE_WIDTH
    context.strokeStyle = 'rgba(255,255,255,0.9)'
    context.stroke()
  }

  function applyBlur(position) {
    const editCanvasEl = editCanvas.value
    if (!editCanvasEl || !position) {
      return
    }

    const context = editCanvasEl.getContext('2d')
    const radius = Math.max(1, Number(blurRadius.value) || 1)
    const blurPx = Math.max(0, Number(blurIntensity.value) || 0)

    context.save()
    context.beginPath()
    context.arc(position.x, position.y, radius, 0, Math.PI * 2)
    context.clip()
    context.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'
    context.drawImage(editCanvasEl, 0, 0)
    context.restore()
  }

  function applyBlurAt(position) {
    if (!blurLastAppliedPosition) {
      applyBlur(position)
    } else {
      const dx = position.x - blurLastAppliedPosition.x
      const dy = position.y - blurLastAppliedPosition.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(1, Number(blurRadius.value) || 1)
      const step = Math.max(MIN_BLUR_STEP_PX, radius * BLUR_STEP_FRACTION)

      if (distance <= step) {
        applyBlur(position)
      } else {
        const steps = Math.ceil(distance / step)

        for (let i = 1; i <= steps; i++) {
          const moveRatio = i / steps
          applyBlur({ x: blurLastAppliedPosition.x + dx * moveRatio, y: blurLastAppliedPosition.y + dy * moveRatio })
        }
      }
    }
    blurLastAppliedPosition = position
  }

  function saveBlur() {
    saveCanvas({
      editCanvasEl: editCanvas.value,
      originalFileName, isPdf, originalFileType,
      skipChange: blurSkipImgLoad,
      suffix: 'blur',
      preview, emit, canvasHasAlpha, setHasAlpha
    })

    emit('blur-stroke', {
      radius: blurRadius.value,
      intensity: blurIntensity.value
    })
  }

  function onBlurPointerDown(e) {
    if (!blurActive.value || !preview.value) {
      return
    }

    if (!blurCanvasReady) {
      prepareBlurCanvas(true)
    }

    const position = getCanvasPosition(e, toolCanvas.value)
    if (!position) {
      return
    }

    blurPainting = true
    blurPointerPosition = position
    blurLastAppliedPosition = null

    try { 
      toolCanvas.value?.setPointerCapture?.(e.pointerId) 
    } catch (_) {}

    emit('editing')
    pushHistory()
    applyBlurAt(position)
    blurCursor(position)
  }

  function onBlurPointerMove(e) {
    if (!blurActive.value) {
      return
    }

    const position = getCanvasPosition(e, toolCanvas.value)
    if (!position) {
      return
    }

    blurPointerPosition = position
    if (blurFrameActive) {
      return
    }

    blurFrameActive = true

    requestAnimationFrame(() => {
      blurFrameActive = false
      if (!blurPointerPosition) return
      blurCursor(blurPointerPosition)

      if (blurPainting) {
        applyBlurAt(blurPointerPosition)
      }
    })
  }

  function onBlurPointerUp(e) {
    if (!blurActive.value) return

    if (blurPainting) {
      blurPainting = false
      blurLastAppliedPosition = null
      saveBlur()
    }

    try { 
      toolCanvas.value?.releasePointerCapture?.(e.pointerId)
    } catch (_) {}
  }

  function onBlurPointerLeave() {
    if (!blurActive.value) {
      return
    }

    if (blurPainting) {
      blurPainting = false
      blurLastAppliedPosition = null
      saveBlur()
    }

    clearToolCanvas(toolCanvas.value)
  }

  function setupBlurWatchers() {
    watch(blurActive, (on) => {
      if (on) {
        blurCanvasReady = false
        blurSkipImgLoad.value = false
        nextTick(() => prepareBlurCanvas(true))
      } else {
        if (blurPainting) {
          blurPainting = false
          saveBlur()
        }

        clearToolCanvas(toolCanvas.value)
        blurCanvasReady = false
      }
    })

    watch(blurRadius, () => {
      if (blurActive.value && blurPointerPosition) {
        blurCursor(blurPointerPosition)
      }
    })
  }

  function handleImageLoadedBlur() {
    if (blurSkipImgLoad.value) {
      blurSkipImgLoad.value = false
    } else {
      blurCanvasReady = false
      prepareBlurCanvas(true)
    }
  }

  return {
    blurSkipImgLoad,
    prepareBlurCanvas,
    onBlurPointerDown,
    onBlurPointerMove,
    onBlurPointerUp,
    onBlurPointerLeave,
    setupBlurWatchers,
    handleImageLoadedBlur
  }
}
