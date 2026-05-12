// Author: Peter Huňady (xhunadp00)
// File: useBlur.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref, watch, nextTick } from 'vue'
import { getCanvasPosition, clearToolCanvas, prepareToolCanvas, saveCanvas } from './canvasToolUtils'

const CURSOR_OUTER_LINE_WIDTH = 1.5
const CURSOR_INNER_LINE_WIDTH = 1
// part of the brush radius used between blur steps while dragging
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
      active: blurActive,
      isPdf: isPdf,
      pdfCanvas: pdfCanvas,
      imgEl: imgEl,
      editCanvas: editCanvas,
      toolCanvas: toolCanvas,
      canvasReady: blurCanvasReady,
      force: force
    })

    if (prepared) {
      clearToolCanvas(toolCanvas.value)
      blurCanvasReady = true
    }
  }

  // draw two circles, dark outside and light inside, so the cursor is easy to see
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

  // cut the canvas to a circle and draw it again with blur
  // this makes only the circle area blurred
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

  // add blur between the last and current position to avoid gaps when the mouse moves fast
  function applyBlurAt(position) {
    if (!blurLastAppliedPosition) {
      applyBlur(position)
    } else {
      const moveX = position.x - blurLastAppliedPosition.x
      const moveY = position.y - blurLastAppliedPosition.y
      const distance = Math.sqrt(moveX * moveX + moveY * moveY)
      const radius = Math.max(1, Number(blurRadius.value) || 1)
      const step = Math.max(MIN_BLUR_STEP_PX, radius * BLUR_STEP_FRACTION)

      if (distance <= step) {
        applyBlur(position)
      } else {
        const steps = Math.ceil(distance / step)

        for (let i = 1; i <= steps; i++) {
          const moveRatio = i / steps
          applyBlur({ x: blurLastAppliedPosition.x + moveX * moveRatio, y: blurLastAppliedPosition.y + moveY * moveRatio })
        }
      }
    }
    blurLastAppliedPosition = position
  }

  function saveBlur() {
    saveCanvas({
      editCanvasEl: editCanvas.value,
      originalFileName: originalFileName,
      isPdf: isPdf,
      originalFileType: originalFileType,
      skipChange: blurSkipImgLoad,
      suffix: 'blur',
      preview: preview,
      emit: emit,
      canvasHasAlpha: canvasHasAlpha,
      setHasAlpha: setHasAlpha
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

    // keep getting pointer events even if the pointer leaves the canvas during drawing
    try {
      toolCanvas.value?.setPointerCapture?.(e.pointerId)
    } catch (error) {}

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

    // blurFrameActive stops many animation frame calls from running at the same time
    blurFrameActive = true

    requestAnimationFrame(() => {
      blurFrameActive = false
      if (!blurPointerPosition) {
        return
      }
      blurCursor(blurPointerPosition)

      if (blurPainting) {
        applyBlurAt(blurPointerPosition)
      }
    })
  }

  function onBlurPointerUp(e) {
    if (!blurActive.value) {
      return
    }

    if (blurPainting) {
      blurPainting = false
      blurLastAppliedPosition = null
      saveBlur()
    }

    try { 
      toolCanvas.value?.releasePointerCapture?.(e.pointerId)
    } catch (error) {}
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
    watch(blurActive, (newValue) => {
      if (newValue) {
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

  // saving blur reloads the image, so blurSkipImgLoad skips one canvas reset
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
