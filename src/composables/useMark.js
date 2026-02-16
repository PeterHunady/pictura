import { ref, watch, nextTick } from 'vue'

const HANDLE_SIZE = 8
const HANDLE_HIT_SIZE = 12

export function useMark({
  isPdf,
  imgEl,
  editCanvas,
  toolCanvas,
  preview,
  originalFileName,
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
    if (!markActive.value) return
    if (isPdf.value) return

    const img = imgEl.value
    const ec = editCanvas.value
    const tc = toolCanvas.value
    if (!img || !ec || !tc || !img.naturalWidth || !img.naturalHeight) return

    if (!force && markCanvasReady && ec.width === img.naturalWidth && ec.height === img.naturalHeight) {
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

    clearMarkPreview()
    markCanvasReady = true
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

  function clearMarkPreview() {
    const tc = toolCanvas.value
    if (!tc) return
    const ctx = tc.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, tc.width, tc.height)
  }

  function drawMarkPreview(startPt, endPt) {
    const tc = toolCanvas.value
    if (!tc) return
    const ctx = tc.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, tc.width, tc.height)

    if (activeShape.value) {
      const shape = activeShape.value
      drawShapeOnContext(ctx, shape)
      drawResizeHandles(ctx, shape)
    }

    if (startPt && endPt) {
      ctx.strokeStyle = markColor.value
      ctx.lineWidth = markThickness.value
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const x = Math.min(startPt.x, endPt.x)
      const y = Math.min(startPt.y, endPt.y)
      const w = Math.abs(endPt.x - startPt.x)
      const h = Math.abs(endPt.y - startPt.y)

      ctx.beginPath()
      if (markShape.value === 'circle') {
        const cx = x + w / 2
        const cy = y + h / 2
        const rx = w / 2
        const ry = h / 2
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      } else {
        ctx.rect(x, y, w, h)
      }
      ctx.stroke()
    }
  }

  function drawShapeOnContext(ctx, shape) {
    ctx.strokeStyle = shape.color
    ctx.lineWidth = shape.thickness
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    if (shape.type === 'circle') {
      const cx = shape.x + shape.width / 2
      const cy = shape.y + shape.height / 2
      const rx = shape.width / 2
      const ry = shape.height / 2
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(shape.x, shape.y, shape.width, shape.height)
    }
    ctx.stroke()
  }

  function drawResizeHandles(ctx, shape) {
    const handles = getHandlePositions(shape)

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1

    for (const pos of Object.values(handles)) {
      ctx.fillRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      ctx.strokeRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
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

  function hitTestHandle(pt, shape) {
    const handles = getHandlePositions(shape)
    for (const [name, pos] of Object.entries(handles)) {
      const dx = pt.x - pos.x
      const dy = pt.y - pos.y
      if (Math.abs(dx) <= HANDLE_HIT_SIZE / 2 && Math.abs(dy) <= HANDLE_HIT_SIZE / 2) {
        return name
      }
    }
    return null
  }

  function hitTestShape(pt, shape) {
    return pt.x >= shape.x && pt.x <= shape.x + shape.width &&
           pt.y >= shape.y && pt.y <= shape.y + shape.height
  }

  function commitMarkToPreview() {
    if (isPdf.value) return
    const ec = editCanvas.value
    if (!ec || !ec.width || !ec.height) return

    const base = (originalFileName.value || 'image').replace(/\.[^.]+$/, '')
    const newName = `${base}-marked.png`
    const dataUrl = ec.toDataURL('image/png')

    const b64 = dataUrl.split(',')[1] || ''
    const size = atob(b64).length

    markSuppressNextImgLoadResync.value = true

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
  }

  function commitActiveShape() {
    if (!activeShape.value) return
    if (isPdf.value) return

    const ec = editCanvas.value
    if (!ec) return

    const shape = activeShape.value
    const ctx = ec.getContext('2d')
    drawShapeOnContext(ctx, shape)

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
    clearMarkPreview()
  }

  function onMarkPointerDown(e) {
    if (!markActive.value) return
    if (isPdf.value) return
    if (!preview.value) return

    if (!markCanvasReady) prepareMarkCanvases(true)

    const pt = canvasPtFromEvent(e)
    if (!pt) return

    try { toolCanvas.value?.setPointerCapture?.(e.pointerId) } catch (_) {}

    if (activeShape.value) {
      const handle = hitTestHandle(pt, activeShape.value)
      if (handle) {
        shapeMode.value = 'resizing'
        activeHandle.value = handle
        shapeDragStart = {
          x: pt.x,
          y: pt.y,
          shapeX: activeShape.value.x,
          shapeY: activeShape.value.y,
          shapeW: activeShape.value.width,
          shapeH: activeShape.value.height
        }
        return
      }

      if (hitTestShape(pt, activeShape.value)) {
        shapeMode.value = 'moving'
        shapeDragStart = {
          x: pt.x,
          y: pt.y,
          shapeX: activeShape.value.x,
          shapeY: activeShape.value.y,
          shapeW: activeShape.value.width,
          shapeH: activeShape.value.height
        }
        return
      }

      commitActiveShape()
    }

    shapeMode.value = 'drawing'
    markPainting = true
    markStartPt = pt

    emit('editing')
    pushHistory()
  }

  function onMarkPointerMove(e) {
    if (!markActive.value) return
    if (isPdf.value) return

    const pt = canvasPtFromEvent(e)
    if (!pt) return

    if (shapeMode.value === 'resizing' && activeShape.value && shapeDragStart) {
      const dx = pt.x - shapeDragStart.x
      const dy = pt.y - shapeDragStart.y
      const handle = activeHandle.value

      let newX = shapeDragStart.shapeX
      let newY = shapeDragStart.shapeY
      let newW = shapeDragStart.shapeW
      let newH = shapeDragStart.shapeH

      if (handle === 'nw') {
        newX = shapeDragStart.shapeX + dx
        newY = shapeDragStart.shapeY + dy
        newW = shapeDragStart.shapeW - dx
        newH = shapeDragStart.shapeH - dy
      } else if (handle === 'ne') {
        newY = shapeDragStart.shapeY + dy
        newW = shapeDragStart.shapeW + dx
        newH = shapeDragStart.shapeH - dy
      } else if (handle === 'sw') {
        newX = shapeDragStart.shapeX + dx
        newW = shapeDragStart.shapeW - dx
        newH = shapeDragStart.shapeH + dy
      } else if (handle === 'se') {
        newW = shapeDragStart.shapeW + dx
        newH = shapeDragStart.shapeH + dy
      }

      if (newW < 0) {
        newX = newX + newW
        newW = -newW
      }
      if (newH < 0) {
        newY = newY + newH
        newH = -newH
      }

      activeShape.value = {
        ...activeShape.value,
        x: newX,
        y: newY,
        width: newW,
        height: newH
      }

      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'moving' && activeShape.value && shapeDragStart) {
      const dx = pt.x - shapeDragStart.x
      const dy = pt.y - shapeDragStart.y

      activeShape.value = {
        ...activeShape.value,
        x: shapeDragStart.shapeX + dx,
        y: shapeDragStart.shapeY + dy
      }

      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'drawing' && markPainting && markStartPt) {
      drawMarkPreview(markStartPt, pt)
      return
    }

    if (activeShape.value && !shapeMode.value) {
      const handle = hitTestHandle(pt, activeShape.value)
      if (handle) {
        markCursor.value = `cursor-${handle}-resize`
        return
      }
      if (hitTestShape(pt, activeShape.value)) {
        markCursor.value = 'cursor-move'
        return
      }
    }
    markCursor.value = null
  }

  function onMarkPointerUp(e) {
    if (!markActive.value) return
    if (isPdf.value) return

    try { toolCanvas.value?.releasePointerCapture?.(e.pointerId) } catch (_) {}

    if (shapeMode.value === 'resizing' || shapeMode.value === 'moving') {
      shapeMode.value = null
      activeHandle.value = null
      shapeDragStart = null
      drawMarkPreview(null, null)
      return
    }

    if (shapeMode.value === 'drawing' && markPainting && markStartPt) {
      const pt = canvasPtFromEvent(e)
      if (pt) {
        const x = Math.min(markStartPt.x, pt.x)
        const y = Math.min(markStartPt.y, pt.y)
        const w = Math.abs(pt.x - markStartPt.x)
        const h = Math.abs(pt.y - markStartPt.y)

        if (w > 2 && h > 2) {
          activeShape.value = {
            x,
            y,
            width: w,
            height: h,
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
    if (!markActive.value) return

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
    watch(markActive, (on) => {
      if (on) {
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
        clearMarkPreview()
        markCanvasReady = false
      }
    })
  }

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
