import { PDFDocument } from 'pdf-lib'

export function useCrop({
  isPdf,
  pdfCanvas,
  imgEl,
  overlayX,
  overlayY,
  overlayW,
  overlayH,
  origBg,
  emit,
  pdfBytes,
  originalPdf,
  originalFileSize,
  originalLastModified,
  preview,
  makeDocSig,
  renderPdfPage,
  setupOverlay,
  setHasAlpha,
  canvasHasAlpha,
  pushHistory,
  showOverlay,
  currentPage,
  detectBackground
}) {
  function getSourceCanvas() {
    if (isPdf.value && pdfCanvas.value?.width) {
      return pdfCanvas.value
    }
    const img = imgEl.value
    if (!img?.naturalWidth) return null

    const off = document.createElement('canvas')
    off.width = img.naturalWidth
    off.height = img.naturalHeight
    off.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    return off
  }

  function previewCropToContent() {
    const sourceCanvas = getSourceCanvas()
    if (!sourceCanvas) return

    const W = sourceCanvas.width
    const H = sourceCanvas.height

    let roiX = 0, roiY = 0, roiW = W, roiH = H
    if (overlayW.value > 0 && overlayH.value > 0) {
      const sx = Math.max(0, Math.floor(overlayX.value))
      const sy = Math.max(0, Math.floor(overlayY.value))
      const ex = Math.min(W, Math.floor(overlayX.value + overlayW.value))
      const ey = Math.min(H, Math.floor(overlayY.value + overlayH.value))

      roiX = Math.min(sx, W - 1)
      roiY = Math.min(sy, H - 1)
      roiW = Math.max(1, ex - sx)
      roiH = Math.max(1, ey - sy)
    }

    const roi = document.createElement('canvas')
    roi.width = roiW; roi.height = roiH
    roi.getContext('2d', { willReadFrequently: true })
      .drawImage(sourceCanvas, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH)

    const width = roiW, height = roiH
    const context = roi.getContext('2d', { willReadFrequently: true })
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const indexOf = (x, y) => (y * width + x) * 4
    const squaredDistance = (r1, g1, b1, r2, g2, b2) => {
      const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
      return dr * dr + dg * dg + db * db
    }
    const averagePatch = (cx, cy, r = 1) => {
      let R = 0, G = 0, B = 0, c = 0, lowAlpha = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.min(width - 1, Math.max(0, cx + dx))
          const y = Math.min(height - 1, Math.max(0, cy + dy))
          const i = indexOf(x, y)
          R += data[i]; G += data[i + 1]; B += data[i + 2]; c++
          if (data[i + 3] <= 12) lowAlpha++
        }
      }
      return { rgb: [R / c, G / c, B / c], lowAlphaRatio: lowAlpha / Math.max(1, c) }
    }

    const p1 = averagePatch(0, 0)
    const p2 = averagePatch(width - 1, 0)
    const p3 = averagePatch(0, height - 1)
    const p4 = averagePatch(width - 1, height - 1)

    const avgAlpha = (p1.lowAlphaRatio + p2.lowAlphaRatio + p3.lowAlphaRatio + p4.lowAlphaRatio) / 4
    const alphaOnly = avgAlpha > 0.5

    let bg
    if (!alphaOnly) {
      const cs = [p1.rgb, p2.rgb, p3.rgb, p4.rgb]
      const groups = cs.map(c => ({ c, n: 1 }))
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          if (squaredDistance(...cs[i], ...cs[j]) < 25) groups[i].n++
        }
      }
      groups.sort((a, b) => b.n - a.n)
      const top = groups[0].c
      bg = { r: Math.round(top[0]), g: Math.round(top[1]), b: Math.round(top[2]) }
    } else {
      bg = origBg.value
      console.log('Using alpha-based detection, bg:', bg, 'avgAlpha:', avgAlpha)
    }

    const tolSq = 140
    const alphaMin = 12

    const visited = new Uint8Array(width * height)
    const q = []

    const tryPush = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return
      const id = y * width + x
      if (visited[id]) return
      const i = indexOf(x, y)
      const a = data[i + 3]
      const isBg = alphaOnly
        ? (a <= alphaMin)
        : (a <= alphaMin) || (squaredDistance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) <= tolSq)
      if (isBg) { visited[id] = 1; q.push(id) }
    }

    tryPush(0, 0); tryPush(width - 1, 0); tryPush(0, height - 1); tryPush(width - 1, height - 1)
    while (q.length) {
      const id = q.pop()
      const x = id % width, y = (id / width) | 0
      tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1)
    }

    let left = width, top = height, right = -1, bottom = -1

    const colAllBg = (x, yMin, yMax) => {
      for (let y = yMin; y <= yMax; y++) {
        if (!visited[y * width + x]) return false
      }
      return true
    }
    const rowAllBg = (y, xMin, xMax) => {
      for (let x = xMin; x <= xMax; x++) {
        if (!visited[y * width + x]) return false
      }
      return true
    }

    for (let x = 0; x < width; x++) if (!colAllBg(x, 0, height - 1)) { left = x; break }
    for (let x = width - 1; x >= 0; x--) if (!colAllBg(x, 0, height - 1)) { right = x; break }
    for (let y = 0; y < height; y++) if (!rowAllBg(y, 0, width - 1)) { top = y; break }
    for (let y = height - 1; y >= 0; y--) if (!rowAllBg(y, 0, width - 1)) { bottom = y; break }

    console.log('Initial bounds:', { left, right, top, bottom, width, height })

    while (left < right && colAllBg(left, top, bottom)) left++
    while (left < right && colAllBg(right, top, bottom)) right--
    while (top < bottom && rowAllBg(top, left, right)) top++
    while (top < bottom && rowAllBg(bottom, left, right)) bottom--

    console.log('Final bounds:', { left, right, top, bottom })

    let newX = roiX + left
    let newY = roiY + top
    let newW = Math.max(1, right - left + 1)
    let newH = Math.max(1, bottom - top + 1)

    console.log('Result overlay:', { newX, newY, newW, newH, roiX, roiY, roiW, roiH })

    const paddedX = Math.max(0, newX - 1)
    const paddedY = Math.max(0, newY - 1)
    const globalRight = Math.min(W, newX + newW + 1)
    const globalBottom = Math.min(H, newY + newH + 1)
    const paddedW = Math.max(1, globalRight - paddedX)
    const paddedH = Math.max(1, globalBottom - paddedY)

    showOverlay(paddedW, paddedH, paddedX, paddedY)
  }

  async function cropToOverlay() {
    pushHistory()

    if (isPdf.value) {
      if (overlayW.value < 1 || overlayH.value < 1) return

      const canvas = pdfCanvas.value
      if (!canvas?.width || !canvas?.height) return
      const canvasW = canvas.width
      const canvasH = canvas.height

      const bytes = pdfBytes()
      const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const outDoc = await PDFDocument.create()

      const pages = srcDoc.getPages()
      const pageIndex = Math.max(
        0,
        Math.min(pages.length - 1, (currentPage?.value || 1) - 1),
      )

      const srcPage = pages[pageIndex]
      const { width: pageW, height: pageH } = srcPage.getSize()

      const x0c = overlayX.value
      const y0c = overlayY.value
      const x1c = overlayX.value + overlayW.value
      const y1c = overlayY.value + overlayH.value

      const nx0 = x0c / canvasW
      const nx1 = x1c / canvasW
      const ny0 = y0c / canvasH
      const ny1 = y1c / canvasH

      let left   = nx0 * pageW
      let right  = nx1 * pageW
      let top    = (1 - ny0) * pageH
      let bottom = (1 - ny1) * pageH

      left   = Math.max(0, Math.min(pageW, left))
      right  = Math.max(0, Math.min(pageW, right))
      bottom = Math.max(0, Math.min(pageH, bottom))
      top    = Math.max(0, Math.min(pageH, top))

      if (right <= left || top <= bottom) return

      const embedded = await outDoc.embedPage(srcPage, { left, bottom, right, top })

      const outW = right - left
      const outH = top - bottom

      const outPage = outDoc.addPage([outW, outH])
      outPage.drawPage(embedded, { x: 0, y: 0 })

      const newBytes = await outDoc.save()
      originalPdf.value = newBytes
      if (preview.value && preview.value.startsWith('blob:')) {
        URL.revokeObjectURL(preview.value)
      }
      preview.value = URL.createObjectURL(
        new Blob([newBytes], { type: 'application/pdf' }),
      )
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)

      await renderPdfPage()
      const newCanvas = pdfCanvas.value
      const newW = newCanvas?.width || outW
      const newH = newCanvas?.height || outH

      emit('update:meta', {
        name: 'cropped.pdf',
        type: 'application/pdf',
        size: newBytes.length,
        width: newW,
        height: newH,
        lastModified: Date.now(),
        docSig: makeDocSig(),
      })

      setupOverlay(newW, newH)

      if (typeof detectBackground === 'function') {
        requestAnimationFrame(() => detectBackground())
      }

      return
    }

    const img = imgEl.value
    if (!img) return

    const imgW = img.naturalWidth
    const imgH = img.naturalHeight

    const sx0 = overlayX.value
    const sy0 = overlayY.value
    const ex0 = overlayX.value + overlayW.value
    const ey0 = overlayY.value + overlayH.value

    const sx = Math.max(0, Math.floor(sx0))
    const sy = Math.max(0, Math.floor(sy0))
    const ex = Math.min(imgW, Math.floor(ex0))
    const ey = Math.min(imgH, Math.floor(ey0))

    const sw = Math.max(1, ex - sx)
    const sh = Math.max(1, ey - sy)

    const c = document.createElement('canvas')
    c.width = sw; c.height = sh
    const ctx = c.getContext('2d')

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const newSrc = c.toDataURL('image/png')
    preview.value = newSrc
    const tmp = document.createElement('canvas')
    tmp.width = sw; tmp.height = sh
    tmp.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    setHasAlpha(canvasHasAlpha(tmp))

    emit('update:preview', newSrc)
    emit('update:meta', {
      name: 'cropped.png', type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: sw, height: sh,
      lastModified: Date.now()
    })

    setupOverlay(sw, sh)

    if (typeof detectBackground === 'function') {
      requestAnimationFrame(() => detectBackground())
    }
  }

  return {
    previewCropToContent,
    cropToOverlay,
  }
}