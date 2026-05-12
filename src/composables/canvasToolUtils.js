// Author: Peter Huňady (xhunadp00)
// File: canvasToolUtils.js
// Bachelor's Thesis, VUT Brno, 2026

// convert mouse position to real canvas pixels
// canvas size can be different from its visible size, so we scale it
export function getCanvasPosition(event, toolCanvas) {
  if (!toolCanvas) {
    return null
  }

  const rect = toolCanvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) * (toolCanvas.width / rect.width)
  const y = (event.clientY - rect.top) * (toolCanvas.height / rect.height)

  // the canvas can be hidden, and then the position could become invalid
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  let clampedX = x
  if (clampedX < 0) { 
    clampedX = 0 
  }
  if (clampedX > toolCanvas.width) { 
    clampedX = toolCanvas.width 
  }

  let clampedY = y
  if (clampedY < 0) { 
    clampedY = 0 
  }
  if (clampedY > toolCanvas.height) { 
    clampedY = toolCanvas.height 
  }

  return { x: clampedX, y: clampedY }
}

export function clearToolCanvas(toolCanvas) {
  if (!toolCanvas) {
    return
  }

  const context = toolCanvas.getContext('2d')
  // reset the transform first, so clearRect clears the whole canvas
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, toolCanvas.width, toolCanvas.height)
}

// set editCanvas and toolCanvas to the same size as the source
// return true when setup was done, or false when it was skipped
export function prepareToolCanvas(params) {
  if (!params.active.value) {
    return false
  }

  const editCanvasEl = params.editCanvas.value
  const toolCanvasEl = params.toolCanvas.value
  let sourceWidth, sourceHeight, source

  if (params.isPdf.value) {
    const pdfCanvasEl = params.pdfCanvas.value
    if (!pdfCanvasEl || !editCanvasEl || !toolCanvasEl || !pdfCanvasEl.width || !pdfCanvasEl.height) {
      return false
    }

    sourceWidth = pdfCanvasEl.width
    sourceHeight = pdfCanvasEl.height
    source = pdfCanvasEl
  } else {
    const img = params.imgEl.value
    if (!img || !editCanvasEl || !toolCanvasEl || !img.naturalWidth || !img.naturalHeight) {
      return false
    }

    sourceWidth = img.naturalWidth
    sourceHeight = img.naturalHeight
    source = img
  }

  // skip setup when the canvas already has the right size, unless force is used
  if (!params.force && params.canvasReady && editCanvasEl.width === sourceWidth && editCanvasEl.height === sourceHeight) {
    return false
  }

  if (editCanvasEl.width !== sourceWidth || editCanvasEl.height !== sourceHeight) {
    editCanvasEl.width = sourceWidth
    editCanvasEl.height = sourceHeight
  }

  if (toolCanvasEl.width !== sourceWidth || toolCanvasEl.height !== sourceHeight) {
    toolCanvasEl.width = sourceWidth
    toolCanvasEl.height = sourceHeight
  }

  const context = editCanvasEl.getContext('2d')
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.filter = 'none'
  context.clearRect(0, 0, editCanvasEl.width, editCanvasEl.height)
  context.drawImage(source, 0, 0)

  return true
}

export function saveCanvas(params) {
  const editCanvasEl = params.editCanvasEl
  if (!editCanvasEl || !editCanvasEl.width || !editCanvasEl.height) {
    return
  }

  const base = (params.originalFileName.value || 'image').replace(/\.[^.]+$/, '')
  const newName = `${base}-${params.suffix}.png`
  const dataUrl = editCanvasEl.toDataURL('image/png')
  const b64 = dataUrl.split(',')[1] || ''

  // decode base64 to get the real bytes and use them for the file size
  const size = atob(b64).length
  // stop the watcher from taking this preview update as a user change
  params.skipChange.value = true

  if (params.isPdf.value) {
    // save the canvas as PNG, so from now on it is not a PDF anymore
    params.isPdf.value = false
    if (params.originalFileType) {
      params.originalFileType.value = 'image/png'
    }
  }

  params.preview.value = dataUrl
  params.emit('update:preview', params.preview.value)
  const isAlpha = params.canvasHasAlpha(editCanvasEl)
  params.setHasAlpha(isAlpha)

  params.emit('update:meta', {
    name: newName,
    type: 'image/png',
    size: size,
    width: editCanvasEl.width,
    height: editCanvasEl.height,
    lastModified: Date.now()
  })
}
