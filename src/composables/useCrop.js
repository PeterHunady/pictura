import { PDFDocument } from 'pdf-lib'

export function useCrop({
  isPdf,
  pdfCanvas,
  imgEl,
  overlayX,
  overlayY,
  overlayW,
  overlayH,
  originalBackground,
  emit,
  pdfBytes,
  originalPdf,
  originalFileSize,
  originalLastModified,
  preview,
  makeFileSignature,
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
    if (!img?.naturalWidth) {
      return null
    }

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = img.naturalWidth
    tempCanvas.height = img.naturalHeight
    tempCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    return tempCanvas
  }

  function previewCropToContent() {
    const sourceCanvas = getSourceCanvas()
    if (!sourceCanvas) {
      return
    }

    const sourceWidth = sourceCanvas.width
    const sourceHeight = sourceCanvas.height

    let cropX = 0, cropY = 0, cropWidth = sourceWidth, cropHeight = sourceHeight
    if (overlayW.value > 0 && overlayH.value > 0) {
      const startX = Math.max(0, Math.floor(overlayX.value))
      const startY = Math.max(0, Math.floor(overlayY.value))
      const endX = Math.min(sourceWidth, Math.floor(overlayX.value + overlayW.value))
      const endY = Math.min(sourceHeight, Math.floor(overlayY.value + overlayH.value))

      cropX = Math.min(startX, sourceWidth - 1)
      cropY = Math.min(startY, sourceHeight - 1)
      cropWidth = Math.max(1, endX - startX)
      cropHeight = Math.max(1, endY - startY)
    }

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropWidth
    cropCanvas.height = cropHeight
    cropCanvas.getContext('2d', { willReadFrequently: true }).drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

    const width = cropWidth, height = cropHeight
    const context = cropCanvas.getContext('2d', { willReadFrequently: true })
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const indexOf = (x, y) => (y * width + x) * 4
    const squaredDistance = (r1, g1, b1, r2, g2, b2) => {
      const redDiff = r1 - r2, greenDiff = g1 - g2, blueDiff = b1 - b2
      return redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff
    }
    
    const getAverageColor = (centerX, centerY, r = 1) => {
      let R = 0, G = 0, B = 0, count = 0, lowAlpha = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.min(width - 1, Math.max(0, centerX + dx))
          const y = Math.min(height - 1, Math.max(0, centerY + dy))
          const i = indexOf(x, y)

          R += data[i]; G += data[i + 1]; B += data[i + 2]; count++
          if (data[i + 3] <= 12) {
            lowAlpha++
          }
        }
      }
      return { rgb: [R / count, G / count, B / count], lowAlphaRatio: lowAlpha / Math.max(1, count) }
    }

    const topLeft = getAverageColor(0, 0)
    const topRight = getAverageColor(width - 1, 0)
    const bottomLeft = getAverageColor(0, height - 1)
    const bottomRight = getAverageColor(width - 1, height - 1)

    const averageAlpha = (topLeft.lowAlphaRatio + topRight.lowAlphaRatio + bottomLeft.lowAlphaRatio + bottomRight.lowAlphaRatio) / 4
    const alphaOnly = averageAlpha > 0.5

    let background
    if (!alphaOnly) {
      const cornerColors = [topLeft.rgb, topRight.rgb, bottomLeft.rgb, bottomRight.rgb]
      const groups = cornerColors.map(color => ({ color, count: 1 }))

      for (let i = 0; i < cornerColors.length; i++) {
        for (let j = i + 1; j < cornerColors.length; j++) {
          if (squaredDistance(...cornerColors[i], ...cornerColors[j]) < 25) {
            groups[i].count++
          }
        }
      }

      groups.sort((a, b) => b.count - a.count)

      const mainColor = groups[0].color
      background = {
        r: Math.round(mainColor[0]),
        g: Math.round(mainColor[1]),
        b: Math.round(mainColor[2])
      }
    } else {
      background = originalBackground.value
    }

    const colorTolerance = 140
    const alphaMin = 12
    const visited = new Uint8Array(width * height)
    const queue = []

    const tryPush = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        return
      }

      const pixelIndex = y * width + x
      if (visited[pixelIndex]) {
        return
      }

      const i = indexOf(x, y)
      const alpha = data[i + 3]
      const isBackground = alphaOnly ? (alpha <= alphaMin) : (alpha <= alphaMin) || (squaredDistance(data[i], data[i + 1], data[i + 2], background.r, background.g, background.b) <= colorTolerance)
      if (isBackground) { 
        visited[pixelIndex] = 1
        queue.push(pixelIndex)
      }
    }

    tryPush(0, 0)
    tryPush(width - 1, 0)
    tryPush(0, height - 1)
    tryPush(width - 1, height - 1)

    while (queue.length) {
      const pixelIndex = queue.pop()
      const x = pixelIndex % width, y = (pixelIndex / width) | 0
      tryPush(x + 1, y)
      tryPush(x - 1, y)
      tryPush(x, y + 1)
      tryPush(x, y - 1)
    }

    let left = width, top = height, right = -1, bottom = -1

    const isColumnBackground = (x, yMin, yMax) => {
      for (let y = yMin; y <= yMax; y++) {
        if (!visited[y * width + x]) {
          return false
        }
      }
      return true
    }
    const isRowBackground = (y, xMin, xMax) => {
      for (let x = xMin; x <= xMax; x++) {
        if (!visited[y * width + x]) {
          return false
        }
      }
      return true
    }

    for (let x = 0; x < width; x++) if (!isColumnBackground(x, 0, height - 1)) { left = x; break }
    for (let x = width - 1; x >= 0; x--) if (!isColumnBackground(x, 0, height - 1)) { right = x; break }
    for (let y = 0; y < height; y++) if (!isRowBackground(y, 0, width - 1)) { top = y; break }
    for (let y = height - 1; y >= 0; y--) if (!isRowBackground(y, 0, width - 1)) { bottom = y; break }

    while (left < right && isColumnBackground(left, top, bottom)) left++
    while (left < right && isColumnBackground(right, top, bottom)) right--
    while (top < bottom && isRowBackground(top, left, right)) top++
    while (top < bottom && isRowBackground(bottom, left, right)) bottom--

    let newX = cropX + left
    let newY = cropY + top
    let newW = Math.max(1, right - left + 1)
    let newH = Math.max(1, bottom - top + 1)

    const paddedX = Math.max(0, newX - 1)
    const paddedY = Math.max(0, newY - 1)
    const globalRight = Math.min(sourceWidth, newX + newW + 1)
    const globalBottom = Math.min(sourceHeight, newY + newH + 1)
    const paddedW = Math.max(1, globalRight - paddedX)
    const paddedH = Math.max(1, globalBottom - paddedY)

    showOverlay(paddedW, paddedH, paddedX, paddedY)
  }

  async function cropToOverlay() {
    pushHistory()

    if (isPdf.value) {
      if (overlayW.value < 1 || overlayH.value < 1) {
        return
      }

      const canvas = pdfCanvas.value
      if (!canvas?.width || !canvas?.height) {
        return
      }

      const canvasW = canvas.width
      const canvasH = canvas.height
      const bytes = pdfBytes()
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const croppedPdf = await PDFDocument.create()

      const pages = sourcePdf.getPages()
      const pageIndex = Math.max(0, Math.min(pages.length - 1, (currentPage?.value || 1) - 1),)
      const srcPage = pages[pageIndex]
      const { width: pageW, height: pageH } = srcPage.getSize()

      const overlayLeft = overlayX.value
      const overlayTop = overlayY.value
      const overlayRight = overlayX.value + overlayW.value
      const overlayBottom = overlayY.value + overlayH.value

      const leftRatio = overlayLeft / canvasW
      const rightRatio = overlayRight / canvasW
      const topRatio = overlayTop / canvasH
      const bottomRatio = overlayBottom / canvasH

      let left = leftRatio * pageW
      let right = rightRatio * pageW
      let top = (1 - topRatio) * pageH
      let bottom = (1 - bottomRatio) * pageH

      left = Math.max(0, Math.min(pageW, left))
      right = Math.max(0, Math.min(pageW, right))
      bottom = Math.max(0, Math.min(pageH, bottom))
      top = Math.max(0, Math.min(pageH, top))

      if (right <= left || top <= bottom) {
        return
      }

      const croppedPage = await croppedPdf.embedPage(srcPage, { left, bottom, right, top })
      const outW = right - left
      const outH = top - bottom

      const newPage = croppedPdf.addPage([outW, outH])
      newPage.drawPage(croppedPage, { x: 0, y: 0 })
      const newBytes = await croppedPdf.save()
      originalPdf.value = newBytes

      if (preview.value && preview.value.startsWith('blob:')) {
        URL.revokeObjectURL(preview.value)
      }

      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }),)
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
        docSig: makeFileSignature(),
      })

      setupOverlay(newW, newH)

      if (typeof detectBackground === 'function') {
        requestAnimationFrame(() => detectBackground())
      }

      return
    }

    const img = imgEl.value
    if (!img) {
      return
    }

    const imgW = img.naturalWidth
    const imgH = img.naturalHeight

    const overlayLeft = overlayX.value
    const overlayTop = overlayY.value
    const overlayRight = overlayX.value + overlayW.value
    const overlayBottom = overlayY.value + overlayH.value

    const startX = Math.max(0, Math.floor(overlayLeft))
    const startY = Math.max(0, Math.floor(overlayTop))
    const endX = Math.min(imgW, Math.floor(overlayRight))
    const endY = Math.min(imgH, Math.floor(overlayBottom))

    const cropWidth = Math.max(1, endX - startX)
    const cropHeight = Math.max(1, endY - startY)

    const canvas = document.createElement('canvas')
    canvas.width = cropWidth; canvas.height = cropHeight
    const context = canvas.getContext('2d')

    context.drawImage(img, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

    const newSrc = canvas.toDataURL('image/png')
    preview.value = newSrc
    setHasAlpha(canvasHasAlpha(canvas))

    emit('update:preview', newSrc)
    emit('update:meta', {
      name: 'cropped.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: cropWidth,
      height: cropHeight,
      lastModified: Date.now()
    })

    setupOverlay(cropWidth, cropHeight)

    if (typeof detectBackground === 'function') {
      requestAnimationFrame(() => detectBackground())
    }
  }

  return {
    previewCropToContent,
    cropToOverlay,
  }
}