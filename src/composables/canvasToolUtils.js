export function getCanvasPosition(event, toolCanvas) {
  if (!toolCanvas) {
    return null
  }

  const rect = toolCanvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) * (toolCanvas.width / rect.width)
  const y = (event.clientY - rect.top) * (toolCanvas.height / rect.height)

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return {
    x: Math.max(0, Math.min(toolCanvas.width, x)),
    y: Math.max(0, Math.min(toolCanvas.height, y))
  }
}

export function clearToolCanvas(toolCanvas) {
  if (!toolCanvas) {
    return
  }

  const context = toolCanvas.getContext('2d')
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, toolCanvas.width, toolCanvas.height)
}

export function prepareToolCanvas({ active, isPdf, pdfCanvas, imgEl, editCanvas, toolCanvas, canvasReady, force }) {
  if (!active.value) {
    return false
  }

  const editCanvasEl = editCanvas.value
  const toolCanvasEl = toolCanvas.value
  let sourceWidth, sourceHeight, source

  if (isPdf.value) {
    const pdfCanvasEl = pdfCanvas.value
    if (!pdfCanvasEl || !editCanvasEl || !toolCanvasEl || !pdfCanvasEl.width || !pdfCanvasEl.height) {
      return false
    }

    sourceWidth = pdfCanvasEl.width; sourceHeight = pdfCanvasEl.height; source = pdfCanvasEl
  } else {
    const img = imgEl.value
    if (!img || !editCanvasEl || !toolCanvasEl || !img.naturalWidth || !img.naturalHeight) {
      return false
    }

    sourceWidth = img.naturalWidth; sourceHeight = img.naturalHeight; source = img
  }

  if (!force && canvasReady && editCanvasEl.width === sourceWidth && editCanvasEl.height === sourceHeight) {
    return false
  }

  if (editCanvasEl.width !== sourceWidth || editCanvasEl.height !== sourceHeight) {
    editCanvasEl.width = sourceWidth; editCanvasEl.height = sourceHeight
  }

  if (toolCanvasEl.width !== sourceWidth || toolCanvasEl.height !== sourceHeight) {
    toolCanvasEl.width = sourceWidth; toolCanvasEl.height = sourceHeight
  }

  const context = editCanvasEl.getContext('2d')
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.filter = 'none'
  context.clearRect(0, 0, editCanvasEl.width, editCanvasEl.height)
  context.drawImage(source, 0, 0)

  return true
}

export function saveCanvas({ editCanvasEl, originalFileName, isPdf, originalFileType, skipChange, suffix, preview, emit, canvasHasAlpha, setHasAlpha }) {
  if (!editCanvasEl || !editCanvasEl.width || !editCanvasEl.height) {
    return
  }

  const base = (originalFileName.value || 'image').replace(/\.[^.]+$/, '')
  const newName = `${base}-${suffix}.png`
  const dataUrl = editCanvasEl.toDataURL('image/png')
  const b64 = dataUrl.split(',')[1] || ''
  const size = atob(b64).length
  skipChange.value = true

  if (isPdf.value) {
    isPdf.value = false
    if (originalFileType) {
      originalFileType.value = 'image/png'
    }
  }

  preview.value = dataUrl
  emit('update:preview', preview.value)
  const isAlpha = canvasHasAlpha(editCanvasEl)
  setHasAlpha(isAlpha)

  emit('update:meta', {
    name: newName,
    type: 'image/png', size,
    width: editCanvasEl.width,
    height: editCanvasEl.height,
    lastModified: Date.now()
  })
}