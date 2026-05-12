// Author: Peter Huňady (xhunadp00)
// File: useMark.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref, watch, nextTick } from 'vue'
import { getCanvasPosition, clearToolCanvas, prepareToolCanvas, saveCanvas } from './canvasToolUtils'

const HANDLE_SIZE = 8
const HANDLE_HIT_SIZE = 12
const MIN_SHAPE_SIZE = 2

export function useMark({
  isPdf,
  pdfCanvas,
  imgEl,
  editCanvas,
  toolCanvas,
  preview,
  originalFileName,
  originalFileType,
  markActive,
  markThickness,
  markColor,
  markShape,
  emit,
  setHasAlpha,
  canvasHasAlpha,
  pushHistory
}) {
  let markPainting = false
  let markStartPt = null
  let markCanvasReady = false
  let shapeDragStart = null

  const markSuppressNextImgLoadResync = ref(false)
  const activeShape = ref(null)
  const shapeMode = ref(null)
  const activeHandle = ref(null)
  const markCursor = ref(null)

  function prepareMarkCanvases(force = false) {
    const prepared = prepareToolCanvas({
      active: markActive, isPdf: isPdf, pdfCanvas: pdfCanvas, imgEl: imgEl, editCanvas: editCanvas, toolCanvas: toolCanvas, canvasReady: markCanvasReady, force: force
    })

    if (prepared) {
      clearToolCanvas(toolCanvas.value)
      markCanvasReady = true
    }
  }

  // redraw the tool canvas overlay, startPoint and endPoint show the shape while it is being drawn
  function drawMarkPreview(startPoint, endPoint) {
    const toolCanvasEl = toolCanvas.value
    if (!toolCanvasEl) {
      return
    }

    const context = toolCanvasEl.getContext('2d')
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, toolCanvasEl.width, toolCanvasEl.height)

    if (activeShape.value) {
      const shape = activeShape.value
      drawShapeOnContext(context, shape)
      drawResizeHandles(context, shape)
    }

    if (startPoint && endPoint) {
      context.strokeStyle = markColor.value
      context.lineWidth = markThickness.value
      context.lineCap = 'round'
      context.lineJoin = 'round'

      const x = Math.min(startPoint.x, endPoint.x)
      const y = Math.min(startPoint.y, endPoint.y)
      const shapeWidth = Math.abs(endPoint.x - startPoint.x)
      const shapeHeight = Math.abs(endPoint.y - startPoint.y)

      context.beginPath()
      if (markShape.value === 'circle') {
        const centerX = x + shapeWidth / 2
        const centerY = y + shapeHeight / 2
        const horizontalRadius = shapeWidth / 2
        const verticalRadius = shapeHeight / 2
        context.ellipse(centerX, centerY, horizontalRadius, verticalRadius, 0, 0, Math.PI * 2)
      } else {
        context.rect(x, y, shapeWidth, shapeHeight)
      }
      context.stroke()
    }
  }

  function drawShapeOnContext(context, shape) {
    context.strokeStyle = shape.color
    context.lineWidth = shape.thickness
    context.lineCap = 'round'
    context.lineJoin = 'round'

    context.beginPath()
    if (shape.type === 'circle') {
      const centerX = shape.x + shape.width / 2
      const centerY = shape.y + shape.height / 2
      const horizontalRadius = shape.width / 2
      const verticalRadius = shape.height / 2
      context.ellipse(centerX, centerY, horizontalRadius, verticalRadius, 0, 0, Math.PI * 2)
    } else {
      context.rect(shape.x, shape.y, shape.width, shape.height)
    }
    context.stroke()
  }

  function drawResizeHandles(context, shape) {
    const handles = getHandlePositions(shape)

    context.fillStyle = '#ffffff'
    context.strokeStyle = '#000000'
    context.lineWidth = 1

    const handlePositions = [handles.nw, handles.ne, handles.sw, handles.se]
    for (const pos of handlePositions) {
      context.fillRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      context.strokeRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }
  }

  function getHandlePositions(shape) {
    return {
      nw: { x: shape.x, y: shape.y },
      ne: { x: shape.x + shape.width, y: shape.y },
      sw: { x: shape.x, y: shape.y + shape.height },
      se: { x: shape.x + shape.width, y: shape.y + shape.height }
    }
  }

  function hitTestHandle(position, shape) {
    const handles = getHandlePositions(shape)
    const handleNames = ['nw', 'ne', 'sw', 'se']

    for (const name of handleNames) {
      const pos = handles[name]
      const distX = position.x - pos.x
      const distY = position.y - pos.y

      if (Math.abs(distX) <= HANDLE_HIT_SIZE / 2 && Math.abs(distY) <= HANDLE_HIT_SIZE / 2) {
        return name
      }
    }
    return null
  }

  function hitTestShape(position, shape) {
    return position.x >= shape.x && position.x <= shape.x + shape.width && position.y >= shape.y && position.y <= shape.y + shape.height
  }

  function commitMarkToPreview() {
    saveCanvas({
      editCanvasEl: editCanvas.value,
      originalFileName: originalFileName,
      isPdf: isPdf,
      originalFileType: originalFileType,
      skipChange: markSuppressNextImgLoadResync,
      suffix: 'marked',
      preview: preview, 
      emit: emit, 
      canvasHasAlpha: canvasHasAlpha,
      setHasAlpha: setHasAlpha
    })
  }

  // draw the active shape to the edit canvas and clear the overlay
  function commitActiveShape() {
    if (!activeShape.value) {
      return
    }

    const editCanvasEl = editCanvas.value
    if (!editCanvasEl) {
      return
    }

    const shape = activeShape.value
    const context = editCanvasEl.getContext('2d')
    drawShapeOnContext(context, shape)

    emit('mark-shape', {
      thickness: shape.thickness,
      color: shape.color,
      shape: shape.type,
      width: Math.round(shape.width),
      height: Math.round(shape.height)
    })

    activeShape.value = null
    shapeMode.value = null
    activeHandle.value = null
    shapeDragStart = null

    commitMarkToPreview()
    clearToolCanvas(toolCanvas.value)
  }

  function onMarkPointerDown(e) {
    if (!markActive.value || !preview.value) {
      return
    }

    if (!markCanvasReady) {
      prepareMarkCanvases(true)
    }

    const position = getCanvasPosition(e, toolCanvas.value)
    if (!position) {
      return
    }

    try {
      toolCanvas.value?.setPointerCapture?.(e.pointerId)
    } catch (error) {}

    if (activeShape.value) {
      const handle = hitTestHandle(position, activeShape.value)
      if (handle) {
        shapeMode.value = 'resizing'
        activeHandle.value = handle
        // save the shape at the start of dragging, so resize uses the original shape
        shapeDragStart = {
          x: position.x,
          y: position.y,
          shapeX: activeShape.value.x,
          shapeY: activeShape.value.y,
          shapeW: activeShape.value.width,
          shapeH: activeShape.value.height
        }
        return
      }

      if (hitTestShape(position, activeShape.value)) {
        shapeMode.value = 'moving'
        shapeDragStart = {
          x: position.x,
          y: position.y,
          shapeX: activeShape.value.x,
          shapeY: activeShape.value.y,
          shapeW: activeShape.value.width,
          shapeH: activeShape.value.height
        }
        return
      }

      // click outside the active shape to save it and start a new one
      commitActiveShape()
    }

    shapeMode.value = 'drawing'
    markPainting = true
    markStartPt = position

    emit('editing')
    pushHistory()
  }

  function onMarkPointerMove(e) {
    if (!markActive.value) {
      return
    }

    const position = getCanvasPosition(e, toolCanvas.value)
    if (!position) {
      return
    }

    if (shapeMode.value === 'resizing' && activeShape.value && shapeDragStart) {
      const moveX = position.x - shapeDragStart.x
      const moveY = position.y - shapeDragStart.y
      const handle = activeHandle.value

      let newX = shapeDragStart.shapeX
      let newY = shapeDragStart.shapeY
      let newW = shapeDragStart.shapeW
      let newH = shapeDragStart.shapeH

      // each corner changes the position and size in a different way
      if (handle === 'nw') {
        newX = shapeDragStart.shapeX + moveX
        newY = shapeDragStart.shapeY + moveY
        newW = shapeDragStart.shapeW - moveX
        newH = shapeDragStart.shapeH - moveY
      } else if (handle === 'ne') {
        newY = shapeDragStart.shapeY + moveY
        newW = shapeDragStart.shapeW + moveX
        newH = shapeDragStart.shapeH - moveY
      } else if (handle === 'sw') {
        newX = shapeDragStart.shapeX + moveX
        newW = shapeDragStart.shapeW - moveX
        newH = shapeDragStart.shapeH + moveY
      } else if (handle === 'se') {
        newW = shapeDragStart.shapeW + moveX
        newH = shapeDragStart.shapeH + moveY
      }

      // if the user drags past the other corner, flip the shape so width and height stay positive
      if (newW < 0) {
        newX = newX + newW
        newW = -newW
      }

      if (newH < 0) {
        newY = newY + newH
        newH = -newH
      }

      activeShape.value = {
        x: newX,
        y: newY,
        width: newW,
        height: newH,
        type: activeShape.value.type,
        color: activeShape.value.color,
        thickness: activeShape.value.thickness
      }

      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'moving' && activeShape.value && shapeDragStart) {
      const moveX = position.x - shapeDragStart.x
      const moveY = position.y - shapeDragStart.y

      activeShape.value = {
        x: shapeDragStart.shapeX + moveX,
        y: shapeDragStart.shapeY + moveY,
        width: activeShape.value.width,
        height: activeShape.value.height,
        type: activeShape.value.type,
        color: activeShape.value.color,
        thickness: activeShape.value.thickness
      }

      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'drawing' && markPainting && markStartPt) {
      drawMarkPreview(markStartPt, position)
      return
    }

    if (activeShape.value && !shapeMode.value) {
      const handle = hitTestHandle(position, activeShape.value)
      if (handle) {
        markCursor.value = `cursor-${handle}-resize`
        return
      }
      if (hitTestShape(position, activeShape.value)) {
        markCursor.value = 'cursor-move'
        return
      }
    }
    markCursor.value = null
  }

  function onMarkPointerUp(e) {
    if (!markActive.value) {
      return
    }

    try {
      toolCanvas.value?.releasePointerCapture?.(e.pointerId)
    } catch (error) {}

    if (shapeMode.value === 'resizing' || shapeMode.value === 'moving') {
      shapeMode.value = null
      activeHandle.value = null
      shapeDragStart = null
      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'drawing' && markPainting && markStartPt) {
      const position = getCanvasPosition(e, toolCanvas.value)
      
      if (position) {
        const x = Math.min(markStartPt.x, position.x)
        const y = Math.min(markStartPt.y, position.y)
        const shapeWidth = Math.abs(position.x - markStartPt.x)
        const shapeHeight = Math.abs(position.y - markStartPt.y)

        if (shapeWidth > MIN_SHAPE_SIZE && shapeHeight > MIN_SHAPE_SIZE) {
          activeShape.value = {
            x: x,
            y: y,
            width: shapeWidth,
            height: shapeHeight,
            type: markShape.value,
            color: markColor.value,
            thickness: markThickness.value
          }
        }
      }

      markPainting = false
      markStartPt = null
      shapeMode.value = null
      drawMarkPreview(null, null)
    }
  }

  function onMarkPointerLeave() {
    if (!markActive.value) {
      return
    }

    if (shapeMode.value === 'drawing' && markPainting) {
      markPainting = false
      markStartPt = null
      shapeMode.value = null
      drawMarkPreview(null, null)
    }

    if (shapeMode.value === 'resizing' || shapeMode.value === 'moving') {
      shapeMode.value = null
      activeHandle.value = null
      shapeDragStart = null
      drawMarkPreview(null, null)
    }
  }

  function setupMarkWatchers() {
    watch(markActive, function(newValue) {
      if (newValue) {
        markCanvasReady = false
        markSuppressNextImgLoadResync.value = false
        nextTick(() => prepareMarkCanvases(true))
      } else {
        if (activeShape.value) {
          commitActiveShape()
        }

        if (markPainting) {
          markPainting = false
          markStartPt = null
        }

        shapeMode.value = null
        activeHandle.value = null
        shapeDragStart = null
        markCursor.value = null
        clearToolCanvas(toolCanvas.value)
        markCanvasReady = false
      }
    })
  }

  // saving the mark reloads the image, so skip one canvas reset
  function handleImageLoadedMark() {
    if (markSuppressNextImgLoadResync.value) {
      markSuppressNextImgLoadResync.value = false
    } else {
      markCanvasReady = false
      prepareMarkCanvases(true)
    }
  }

  return {
    markSuppressNextImgLoadResync,
    markCursor,
    prepareMarkCanvases,
    onMarkPointerDown,
    onMarkPointerMove,
    onMarkPointerUp,
    onMarkPointerLeave,
    setupMarkWatchers,
    handleImageLoadedMark
  }
}
