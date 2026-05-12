// Author: Peter Huňady (xhunadp00)
// File: useBackground.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { hexToRgb, rgbToHex, dataURLtoU8, canvasHasAlpha } from './imageProcessing'

const PDF_EXPORT_DPI = 600
const MAX_CANVAS_PIXELS = 25000000

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
  // save the image after background removal, so new colors do not stack on old changes
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

  // guess the background color from pixels near the image edges
  // the most common similar color there is used as the background
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
    const smaller = Math.min(width, height)
    const inset = Math.max(1, Math.round(smaller * 0.01))
    const step = Math.max(1, Math.floor(smaller / 80))
    const MIN_ALPHA = 8

    const sums = new Map()

    for (const y of [inset, Math.max(inset, height - 1 - inset)]) {
      const row = context.getImageData(0, y, width, 1).data
      for (let x = 0; x < width; x += step) {
        const i = x * 4
        if (row[i + 3] <= MIN_ALPHA) {
          continue
        }
        const r = row[i]
        const g = row[i + 1]
        const b = row[i + 2]
        const k = Math.floor(r / 16) + '_' + Math.floor(g / 16) + '_' + Math.floor(b / 16)
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

    for (const x of [inset, Math.max(inset, width - 1 - inset)]) {
      const col = context.getImageData(x, 0, 1, height).data
      for (let y = 0; y < height; y += step) {
        const i = y * 4
        if (col[i + 3] <= MIN_ALPHA) {
          continue
        }
        const r = col[i]
        const g = col[i + 1]
        const b = col[i + 2]
        const k = Math.floor(r / 16) + '_' + Math.floor(g / 16) + '_' + Math.floor(b / 16)
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

    if (sums.size === 0) {
      return
    }

    let mainColorKey = null
    let mainColorCount = -1
    for (const entry of sums.entries()) {
      const k = entry[0]
      const bucket = entry[1]

      if (bucket.count > mainColorCount) {
        mainColorCount = bucket.count
        mainColorKey = k
      }
    }

    const mainColorBucket = sums.get(mainColorKey)
    const r = Math.round(mainColorBucket.R / mainColorBucket.count)
    const g = Math.round(mainColorBucket.G / mainColorBucket.count)
    const b = Math.round(mainColorBucket.B / mainColorBucket.count)

    originalBackground.value = { r: r, g: g, b: b }
    emit('update:bgcolor', rgbToHex(originalBackground.value))
  }

  // start from all image edges and find connected background areas
  // use a wider limit for spreading and a stricter one for small inside background spots
  function makeBackgroundTransparent(canvas, bgRGB) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = canvas.width
    const height = canvas.height
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const backgroundMask = new Uint8Array(width * height)
    const BACKGROUND_LIMIT = 2500
    const BACKGROUND_CORE_LIMIT = 300

    function colorDifferenceFromBackground(r, g, b) {
      const redDiff = r - bgRGB.r
      const greenDiff = g - bgRGB.g
      const blueDiff = b - bgRGB.b
      return redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff
    }

    function isBackgroundColor(index) {
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const a = data[index + 3]

      if (a < 10) {
        return true
      }
      return colorDifferenceFromBackground(r, g, b) <= BACKGROUND_LIMIT
    }

    function isBackgroundCore(index) {
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

    // keep spreading to nearby pixels that are close to the background color
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

      for (const neighbor of neighbors) {
        const nextX = neighbor.nextX
        const nextY = neighbor.nextY

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

    // second pass finds small inside background pixels that were not reached before
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

  // replace background pixels and softly blend pixels near the background edge
  // pixels close to the background get a small color change when they are near background pixels
  function changeBackgroundColor(canvas, bgRGB, newHexColor) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = canvas.width
    const height = canvas.height
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const background = bgRGB || { r: data[0], g: data[1], b: data[2] }
    const newBackground = hexToRgb(newHexColor)
    if (!newBackground) {
      return canvas.toDataURL('image/png')
    }

    const COLOR_LIMIT = 140
    const NEAR_RADIUS = 2
    const MAX_DIST = 3 * 255 * 255

    const backgroundPixels = new Uint8Array(width * height)

    function colorDifferenceFromBackground(r, g, b) {
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

        let nearBackground = false
        for (let offsetY = -NEAR_RADIUS; offsetY <= NEAR_RADIUS && !nearBackground; offsetY++) {
          const nextY = y + offsetY
          if (nextY < 0 || nextY >= height) {
            continue
          }

          for (let offsetX = -NEAR_RADIUS; offsetX <= NEAR_RADIUS; offsetX++) {
            const nextX = x + offsetX
            if (nextX < 0 || nextX >= width || (offsetX === 0 && offsetY === 0)) {
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

        // estimate how much of this pixel is background using compositing model:
        // pixel = bgAlpha * background + (1 - bgAlpha) * content
        // bgAlpha = 1 - sqrt(colorDifference / MAX_DIST) gives the correct fraction
        // for grayscale pixels and approximates well for colored ones
        const bgAlpha = 1 - Math.sqrt(colorDifference / MAX_DIST)
        if (bgAlpha <= 0) {
          continue
        }

        let newR = r + bgAlpha * (newBackground.r - background.r)
        let newG = g + bgAlpha * (newBackground.g - background.g)
        let newB = b + bgAlpha * (newBackground.b - background.b)

        if (newR < 0) { newR = 0 }
        if (newR > 255) { newR = 255 }
        if (newG < 0) { newG = 0 }
        if (newG > 255) { newG = 255 }
        if (newB < 0) { newB = 0 }
        if (newB > 255) { newB = 255 }

        data[index] = Math.round(newR)
        data[index + 1] = Math.round(newG)
        data[index + 2] = Math.round(newB)
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
      const renderedPdf = await pdfjsLib.getDocument({ data: bytes }).promise
      const croppedPdf = await PDFDocument.create()
      const background = originalBackground.value

      const pageCount = sourcePdf.getPageCount()
      let activeIndex = (currentPage.value || 1) - 1
      if (activeIndex < 0) {
        activeIndex = 0
      }

      if (activeIndex > pageCount - 1) {
        activeIndex = pageCount - 1
      }

      const rasterPage = await renderedPdf.getPage(activeIndex + 1)
      const defaultViewport = rasterPage.getViewport({ scale: 1 })

      // PDF points are 72 per inch, so we scale up for a sharper raster image
      // limit the scale so the canvas does not get too large
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

      const pageSize = sourcePdf.getPage(activeIndex).getSize()
      const pageWidth = pageSize.width
      const pageHeight = pageSize.height
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
    if (!img?.naturalWidth) {
      return
    }

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
      width: width,
      height: height,
      lastModified: Date.now(),
    })
    emit('update:bgcolor', null)

    imgTransparent.value = true
    checkerOn.value = true
    setHasAlpha(true)
  }

  async function canvasFromDataUrl(dataUrl) {
    return new Promise(function(resolve, reject) {
      const img = new Image()
      img.onload = function() {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
        resolve(canvas)
      }

      img.onerror = function(error) {
        reject(error)
      }
      img.src = dataUrl
    })
  }

  async function previewBackgroundColor(hexColor) {
    let src

    if (isPdf.value) {
      src = getSourceCanvas()
    } else if (transparentBase.value) {
      try {
        // use the saved transparent image, so previews do not stack over each other
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
    const MAX_PREVIEW_PIXELS = 2000000
    const scale = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (src.width * src.height)) || 1)

    let previewWidth = Math.round(src.width * scale)
    if (previewWidth < 1) {
      previewWidth = 1
    }
    let previewHeight = Math.round(src.height * scale)
    if (previewHeight < 1) {
      previewHeight = 1
    }

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
      const renderedPdf = await pdfjsLib.getDocument({ data: bytes }).promise
      let activeIndex = (currentPage.value || 1) - 1

      if (activeIndex < 0) {
        activeIndex = 0
      }

      if (activeIndex > pageCount - 1) {
        activeIndex = pageCount - 1
      }

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
          const pageSize = page.getSize()
          page.drawImage(pngImg, { x: 0, y: 0, width: pageSize.width, height: pageSize.height })
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
      // the image has transparency, so draw the solid color first and then draw the image over it
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
      name: (originalFileName.value || 'image').replace(/\.[^.]+$/, '') + '-backgroundCanvas.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: width,
      height: height,
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
