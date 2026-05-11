import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { hexToRgb, rgbToHex, dataURLtoU8, canvasHasAlpha } from './imageProcessing'

const { getDocument } = pdfjsLib
const PDF_EXPORT_DPI = 600
const MAX_CANVAS_PIXELS = 25e6

export function useBackground({
  isPdf,
  pdfCanvas,
  imgEl,
  originalBackground,
  emit,
  hasAlpha,
  checkerOn,
  canvasWrapper,
  madeTransparentPdf,
  imgTransparent,
  originalFileName,
  originalFileType,
  preview,
  originalPdf,
  originalFileSize,
  originalLastModified,
  pdfBytes,
  renderPdfPage,
  setHasAlpha,
  pushHistory,
  currentPage,
}) {
  const previewImg = ref(null)
  const previewOn = ref(false)
  const previewType = ref(null)
  const transparentBase = ref(null)

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

  function detectBackground() {
    let src

    if (isPdf.value && pdfCanvas.value) {
      src = pdfCanvas.value
    } else if (imgEl.value?.naturalWidth) {
      const img = imgEl.value
      const tempCanvas = document.createElement('canvas')

      tempCanvas.width = img.naturalWidth
      tempCanvas.height = img.naturalHeight
      tempCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
      src = tempCanvas
    } else {
      return
    }

    const width = src.width
    const height = src.height
    if (!width || !height) {
      return
    }

    const context = src.getContext('2d', { willReadFrequently: true })
    const inset = Math.max(1, Math.round(Math.min(width, height) * 0.01))
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80))
    const MIN_ALPHA = 8

    const quantize = (v) => v >> 4
    const keyOf = (r, g, b) => (quantize(r) << 8) | (quantize(g) << 4) | quantize(b)
    const sums = new Map()

    const sampleRow = (y) => {
      const row = context.getImageData(0, y, width, 1).data
      for (let x = 0; x < width; x += step) {
        const i = x * 4
        const a = row[i + 3]

        if (a <= MIN_ALPHA) {
          continue
        }

        const r = row[i]
        const g = row[i + 1]
        const b = row[i + 2]
        const k = keyOf(r, g, b)
        let bucket = sums.get(k)

        if (!bucket) {
          bucket = { count: 0, R: 0, G: 0, B: 0 }
          sums.set(k, bucket)
        }

        bucket.count++
        bucket.R += r
        bucket.G += g
        bucket.B += b
      }
    }

    const sampleCol = (x) => {
      const col = context.getImageData(x, 0, 1, height).data
      for (let y = 0; y < height; y += step) {
        const i = y * 4
        const a = col[i + 3]

        if (a <= MIN_ALPHA) {
          continue
        }

        const r = col[i]
        const g = col[i + 1]
        const b = col[i + 2]
        const k = keyOf(r, g, b)
        let bucket = sums.get(k)

        if (!bucket) {
          bucket = { count: 0, R: 0, G: 0, B: 0 }
          sums.set(k, bucket)
        }

        bucket.count++
        bucket.R += r
        bucket.G += g
        bucket.B += b
      }
    }

    sampleRow(inset)
    sampleRow(Math.max(inset, height - 1 - inset))
    sampleCol(inset)
    sampleCol(Math.max(inset, width - 1 - inset))

    if (sums.size === 0) {
      return
    }

    let mainColorKey = null
    let mainColorCount = -1
    for (const [k, bucket] of sums.entries()) {
      if (bucket.count > mainColorCount) {
        mainColorCount = bucket.count
        mainColorKey = k
      }
    }

    const mainColorBucket = sums.get(mainColorKey)
    const r = Math.round(mainColorBucket.R / mainColorBucket.count)
    const g = Math.round(mainColorBucket.G / mainColorBucket.count)
    const b = Math.round(mainColorBucket.B / mainColorBucket.count)

    originalBackground.value = { r, g, b }
    emit('update:bgcolor', rgbToHex(originalBackground.value))
  }

  function makeBackgroundTransparent(canvas, bgRGB) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const { width, height } = canvas
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const backgroundMask = new Uint8Array(width * height)
    const BACKGROUND_LIMIT = 2500
    const BACKGROUND_CORE_LIMIT = 300

    const colorDifferenceFromBackground = (r, g, b) => { 
      const redDiff = r - bgRGB.r
      const greenDiff = g - bgRGB.g
      const blueDiff = b - bgRGB.b
      return redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff
    }

    const isBackgroundColor = (index) => {
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const a = data[index + 3]

      if (a < 10) {
        return true
      }
      return colorDifferenceFromBackground(r, g, b) <= BACKGROUND_LIMIT
    }

    const isBackgroundCore = (index) => {
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const a = data[index + 3]

      if (a < 10) {
        return true
      }
      return colorDifferenceFromBackground(r, g, b) <= BACKGROUND_CORE_LIMIT
    }

    const queue = []

    for (let x = 0; x < width; x++) {
      const topIndex = x * 4
      const bottomIndex = ((height - 1) * width + x) * 4

      if (isBackgroundColor(topIndex) && !backgroundMask[x]) {
        backgroundMask[x] = 1
        queue.push(x)
      }
      const bottomPixel = (height - 1) * width + x

      if (isBackgroundColor(bottomIndex) && !backgroundMask[bottomPixel]) {
        backgroundMask[bottomPixel] = 1
        queue.push(bottomPixel)
      }
    }
    
    for (let y = 0; y < height; y++) {
      const leftIndex = (y * width) * 4
      const rightIndex = (y * width + width - 1) * 4
      const leftPixel = y * width
      const rightPixel = y * width + width - 1

      if (isBackgroundColor(leftIndex) && !backgroundMask[leftPixel]) {
        backgroundMask[leftPixel] = 1
        queue.push(leftPixel)
      }

      if (isBackgroundColor(rightIndex) && !backgroundMask[rightPixel]) {
        backgroundMask[rightPixel] = 1
        queue.push(rightPixel)
      }
    }

    while (queue.length > 0) {
      const pixel = queue.shift()
      const x = pixel % width
      const y = Math.floor(pixel / width)

      const neighbors = [
        { nextX: x - 1, nextY: y },
        { nextX: x + 1, nextY: y },
        { nextX: x, nextY: y - 1 },
        { nextX: x, nextY: y + 1 }
      ]

      for (const { nextX, nextY } of neighbors) {
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue
        }

        const nextPixel = nextY * width + nextX
        if (backgroundMask[nextPixel]) {
          continue
        }

        const nextIndex = nextPixel * 4
        if (isBackgroundColor(nextIndex)) {
          backgroundMask[nextPixel] = 1
          queue.push(nextPixel)
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        if (backgroundMask[pixel]) {
          continue
        }

        const index = pixel * 4
        if (isBackgroundCore(index)) {
          backgroundMask[pixel] = 1
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        const index = pixel * 4

        if (backgroundMask[pixel]) {
          data[index + 3] = 0
        }
      }
    }

    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function changeBackgroundColor(canvas, bgRGB, newHexColor) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const { width, height } = canvas
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const background = bgRGB || { r: data[0], g: data[1], b: data[2] }
    const newBackground = hexToRgb(newHexColor)
    if (!newBackground) {
      return canvas.toDataURL('image/png')
    }

    const COLOR_LIMIT = 140
    const SOFT_EDGE_LIMIT = 100000
    const NEAR_RADIUS = 2

    const backgroundPixels = new Uint8Array(width * height)

    const colorDifferenceFromBackground = (r, g, b) => {
      const redDiff = r - background.r
      const greenDiff = g - background.g
      const blueDiff = b - background.b
      return redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4
        const a = data[index + 3]

        if (a === 0) {
          continue
        }

        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]

        if (colorDifferenceFromBackground(r, g, b) <= COLOR_LIMIT) {
          backgroundPixels[y * width + x] = 1
        }
      }
    }

    const mixColor = (currentColor, target, t) => Math.round(currentColor + (target - currentColor) * t)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        const index = pixel * 4

        const a = data[index + 3]
        if (a === 0) {
          continue
        }

        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]

        const colorDifference = colorDifferenceFromBackground(r, g, b)

        if (colorDifference <= COLOR_LIMIT) {
          data[index] = newBackground.r
          data[index + 1] = newBackground.g
          data[index + 2] = newBackground.b
          data[index + 3] = 255
          continue
        }

        if (colorDifference > SOFT_EDGE_LIMIT) {
          continue
        }

        let nearBackground = false
        for (let dy = -NEAR_RADIUS; dy <= NEAR_RADIUS && !nearBackground; dy++) {
          const nextY = y + dy
          if (nextY < 0 || nextY >= height) {
            continue
          }

          for (let dx = -NEAR_RADIUS; dx <= NEAR_RADIUS; dx++) {
            const nextX = x + dx
            if (nextX < 0 || nextX >= width || (dx === 0 && dy === 0)) {
              continue
            }

            if (backgroundPixels[nextY * width + nextX]) {
              nearBackground = true
              break
            }
          }
        }

        if (!nearBackground) {
          continue
        }

        const ratio = (SOFT_EDGE_LIMIT - colorDifference) / (SOFT_EDGE_LIMIT - COLOR_LIMIT)
        const strength = 0.85
        data[index] = mixColor(r, newBackground.r, ratio * strength)
        data[index + 1] = mixColor(g, newBackground.g, ratio * strength)
        data[index + 2] = mixColor(b, newBackground.b, ratio * strength)
      }
    }

    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  async function removeBackground() {
    if (!isPdf.value && imgEl.value) {
      const img = imgEl.value

      if (img.naturalWidth) {
        const checkCanvas = document.createElement('canvas')
        checkCanvas.width = img.naturalWidth
        checkCanvas.height = img.naturalHeight
        checkCanvas.getContext('2d').drawImage(img, 0, 0)

        if (canvasHasAlpha(checkCanvas)) {
          return
        }
      }
    }

    pushHistory()

    if (isPdf.value) {
      const bytes = pdfBytes()
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const renderedPdf = await getDocument({ data: bytes }).promise
      const croppedPdf = await PDFDocument.create()
      const background = originalBackground.value

      const pageCount = sourcePdf.getPageCount()
      const activeIndex = Math.min(Math.max((currentPage.value || 1) - 1, 0), pageCount - 1)

      const rasterPage = await renderedPdf.getPage(activeIndex + 1)
      const defaultViewport = rasterPage.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_EXPORT_DPI / 72)
      const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (defaultViewport.width * defaultViewport.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const exportViewport = rasterPage.getViewport({ scale })

      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = Math.round(exportViewport.width)
      tempCanvas.height = Math.round(exportViewport.height)

      await rasterPage.render({
        canvasContext: tempCanvas.getContext('2d', { willReadFrequently: true }),
        viewport: exportViewport,
        background: 'rgba(0,0,0,0)',
      }).promise

      const dataUrl = makeBackgroundTransparent(tempCanvas, background)
      const pngBytes = dataURLtoU8(dataUrl)
      const pngImg = await croppedPdf.embedPng(pngBytes)

      const { width: pageWidth, height: pageHeight } = sourcePdf.getPage(activeIndex).getSize()
      const pageIndices = sourcePdf.getPageIndices()
      const copiedPages = await croppedPdf.copyPages(sourcePdf, pageIndices)

      for (let i = 0; i < copiedPages.length; i++) {
        if (i === activeIndex) {
          const newPage = croppedPdf.addPage([pageWidth, pageHeight])
          newPage.drawImage(pngImg, { x: 0, y: 0, width: pageWidth, height: pageHeight })
        } else {
          croppedPdf.addPage(copiedPages[i])
        }
      }

      const newBytes = await croppedPdf.save()
      originalPdf.value = newBytes

      if (preview.value?.startsWith('blob:')) {
        URL.revokeObjectURL(preview.value)
      }

      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }))
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      emit('update:bgcolor', null)
      madeTransparentPdf.value = true
      checkerOn.value = true
      setHasAlpha(true)

      await renderPdfPage()
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return

    const width = img.naturalWidth
    const height = img.naturalHeight
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    tempCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, width, height)

    const dataUrl = makeBackgroundTransparent(tempCanvas, originalBackground.value)
    preview.value = dataUrl
    transparentBase.value = dataUrl

    emit('update:preview', dataUrl)
    emit('update:meta', {
      name: originalFileName.value,
      type: originalFileType.value,
      size: atob(dataUrl.split(',')[1]).length,
      width,
      height,
      lastModified: Date.now(),
    })
    emit('update:bgcolor', null)

    imgTransparent.value = true
    checkerOn.value = true
    setHasAlpha(true)
  }

  async function canvasFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
        resolve(canvas)
      }

      img.onerror = reject
      img.src = dataUrl
    })
  }

  async function previewBackgroundColor(hexColor) {
    let src

    if (isPdf.value) {
      src = getSourceCanvas()
    } else if (transparentBase.value) {
      try {
        src = await canvasFromDataUrl(transparentBase.value)
      } catch (e) {
        console.error('previewBackgroundColor: base load failed', e)
        src = getSourceCanvas()
      }
    } else {
      src = getSourceCanvas()
    }

    if (!src || !previewImg.value) {
      return
    }

    const srcHasAlpha = canvasHasAlpha(src) || hasAlpha.value || imgTransparent.value
    const MAX_PREVIEW_PIXELS = 2e6
    const scale = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (src.width * src.height)) || 1)
    const previewWidth = Math.max(1, Math.round(src.width * scale))
    const previewHeight = Math.max(1, Math.round(src.height * scale))

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = previewWidth
    tempCanvas.height = previewHeight
    tempCanvas.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, previewWidth, previewHeight)

    let dataUrl

    if (!srcHasAlpha) {
      dataUrl = changeBackgroundColor(tempCanvas, originalBackground.value, hexColor)
      previewImg.value.style.backgroundColor = ''
    } else {
      dataUrl = tempCanvas.toDataURL('image/png')
      previewImg.value.style.backgroundColor = hexColor
    }

    previewImg.value.src = dataUrl
    previewType.value = 'bgcolor'
    previewOn.value = true
  }

  function endPreviewBackgroundColor() {
    if (previewImg.value) {
      previewImg.value.src = ''
      previewImg.value.style.backgroundColor = ''
    }

    if (previewType.value === 'bgcolor') {
      previewOn.value = false
      previewType.value = null
    }
  }

  async function setBackgroundColor(hexColor) {
    pushHistory()
    endPreviewBackgroundColor()

    if (isPdf.value) {
      const bytes = pdfBytes()
      let sourcePdf
      try {
        sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      } catch (e) {
        console.error('Failed to load PDF in setBackgroundColor:', e)
        return
      }

      const croppedPdf = await PDFDocument.create()
      const pageCount = sourcePdf.getPageCount()
      const renderedPdf = await getDocument({ data: bytes }).promise
      const activeIndex = Math.min(Math.max((currentPage.value || 1) - 1, 0), pageCount - 1)
      const oldBackground = originalBackground.value || { r: 255, g: 255, b: 255 }
      const rasterPage = await renderedPdf.getPage(activeIndex + 1)

      const defaultViewport = rasterPage.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_EXPORT_DPI / 72)
      const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (defaultViewport.width * defaultViewport.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const exportViewport = rasterPage.getViewport({ scale })

      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = Math.round(exportViewport.width)
      tempCanvas.height = Math.round(exportViewport.height)

      await rasterPage.render({
        canvasContext: tempCanvas.getContext('2d', {willReadFrequently: true, alpha: true}),
        viewport: exportViewport,
        background: 'rgba(0,0,0,0)',
      }).promise

      const rasterHasAlpha = canvasHasAlpha(tempCanvas)
      let pngImg

      if (!rasterHasAlpha) {
        const dataUrl = changeBackgroundColor(tempCanvas, oldBackground, hexColor)
        const pngBytes = dataURLtoU8(dataUrl)
        pngImg = await croppedPdf.embedPng(pngBytes)
      } else {
        const backgroundCanvas = document.createElement('canvas')
        backgroundCanvas.width = tempCanvas.width
        backgroundCanvas.height = tempCanvas.height
        const markContext = backgroundCanvas.getContext('2d', { willReadFrequently: true })

        markContext.fillStyle = hexColor
        markContext.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height)
        markContext.drawImage(tempCanvas, 0, 0)
        const pngBytes = dataURLtoU8(backgroundCanvas.toDataURL('image/png'))
        pngImg = await croppedPdf.embedPng(pngBytes)
      }

      const pageIndices = sourcePdf.getPageIndices()
      const copiedPages = await croppedPdf.copyPages(sourcePdf, pageIndices)

      for (let i = 0; i < copiedPages.length; i++) {
        const page = copiedPages[i]
        if (i === activeIndex) {
          const { width: pw, height: ph } = page.getSize()
          page.drawImage(pngImg, { x: 0, y: 0, width: pw, height: ph })
        }

        croppedPdf.addPage(page)
      }

      const newBytes = await croppedPdf.save()
      originalPdf.value = newBytes

      if (preview.value && preview.value.startsWith('blob:')) {
        URL.revokeObjectURL(preview.value)
      }

      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }))
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()
      emit('update:preview', preview.value)
      emit('update:bgcolor', hexColor)

      originalBackground.value = hexToRgb(hexColor)
      madeTransparentPdf.value = false
      checkerOn.value = false
      setHasAlpha(false)

      if (canvasWrapper.value) {
        canvasWrapper.value.style.backgroundColor = hexColor
      }

      await renderPdfPage(currentPage.value)
      return
    }

    let src
    if (transparentBase.value) {
      try {
        src = await canvasFromDataUrl(transparentBase.value)
      } catch (e) {
        console.error('setBackgroundColor: base load failed', e)
      }
    }

    if (!src) {
      const img = imgEl.value
      if (!img?.naturalWidth) {
        return
      }

      src = document.createElement('canvas')
      src.width = img.naturalWidth
      src.height = img.naturalHeight
      src.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    }

    const width = src.width
    const height = src.height
    const srcHasAlpha = canvasHasAlpha(src) || hasAlpha.value || imgTransparent.value

    if (srcHasAlpha && !transparentBase.value) {
      try {
        transparentBase.value = src.toDataURL('image/png')
      } catch (e) {
        console.error('setBackgroundColor: cannot snapshot base', e)
      }
    }

    let newSrc
    if (!srcHasAlpha) {
      newSrc = changeBackgroundColor(src, originalBackground.value, hexColor)
      setHasAlpha(false)
      imgTransparent.value = false
    } else {
      const backgroundCanvas = document.createElement('canvas')
      backgroundCanvas.width = width
      backgroundCanvas.height = height
      const markContext = backgroundCanvas.getContext('2d', { willReadFrequently: true })

      markContext.fillStyle = hexColor
      markContext.fillRect(0, 0, width, height)
      markContext.drawImage(src, 0, 0)

      newSrc = backgroundCanvas.toDataURL('image/png')
      setHasAlpha(true)
      imgTransparent.value = false
    }

    preview.value = newSrc
    emit('update:preview', newSrc)
    emit('update:bgcolor', hexColor)
    emit('update:meta', {
      name:(originalFileName.value || 'image').replace(/\.[^.]+$/, '') + '-backgroundCanvas.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length, width, height,
      lastModified: Date.now(),
    })

    originalBackground.value = hexToRgb(hexColor)
    checkerOn.value = false
    if (canvasWrapper.value) {
      canvasWrapper.value.style.backgroundColor = hexColor
    }
  }

  function clearBackgroundState() {
    transparentBase.value = null
    previewOn.value = false
    previewType.value = null

    if (previewImg.value) {
      previewImg.value.src = ''
      previewImg.value.style.backgroundColor = ''
    }
  }

  return {
    previewImg,
    previewOn,
    previewType,
    detectBackground,
    removeBackground,
    previewBackgroundColor,
    endPreviewBackgroundColor,
    setBackgroundColor,
    clearBackgroundState,
  }
}
