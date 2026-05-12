// Author: Peter Huňady (xhunadp00)
// File: useExport.js
// Bachelor's Thesis, VUT Brno, 2026

import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, extOf } from './imageProcessing'

const PDF_EXPORT_DPI = 600
const MAX_CANVAS_PIXELS = 25000000

export function useExport({
  isPdf,
  pdfCanvas,
  imgEl,
  overlayX,
  overlayY,
  overlayW,
  overlayH,
  pdfBytes,
  currentPage,
  pdfRenderScale,
  preview,
  maxW,
  maxH,
}) {
  function hasOverlayBox() {
    return overlayW.value > 0 && overlayH.value > 0
  }

  function getCropBox(canvas) {
    if (!canvas || !canvas.width || !canvas.height) {
      return null
    }

    const canvasWidth = canvas.width
    const canvasHeight = canvas.height

    if (!hasOverlayBox()) {
      return { startX: 0, startY: 0, cropWidth: canvasWidth, cropHeight: canvasHeight }
    }

    let startX = overlayX.value
    let startY = overlayY.value
    let cropWidth = overlayW.value
    let cropHeight = overlayH.value

    if (cropWidth <= 0 || cropHeight <= 0) {
      return { startX: 0, startY: 0, cropWidth: canvasWidth, cropHeight: canvasHeight }
    }

    // if the overlay starts outside the canvas, cut the crop area so it does not go below zero
    if (startX < 0) {
      cropWidth += startX
      startX = 0
    }
    if (startY < 0) {
      cropHeight += startY
      startY = 0
    }

    if (startX + cropWidth > canvasWidth) {
      cropWidth = canvasWidth - startX
    }
    if (startY + cropHeight > canvasHeight) {
      cropHeight = canvasHeight - startY
    }

    if (cropWidth < 1) { cropWidth = 1 }
    if (cropWidth > canvasWidth) { cropWidth = canvasWidth }
    if (cropHeight < 1) { cropHeight = 1 }
    if (cropHeight > canvasHeight) { cropHeight = canvasHeight }

    return {
      startX: Math.round(startX),
      startY: Math.round(startY),
      cropWidth: Math.round(cropWidth),
      cropHeight: Math.round(cropHeight),
    }
  }
  
  async function getPdfCropData() {
    const bytes = pdfBytes()
    const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = sourcePdf.getPages()
    let index = (currentPage?.value || 1) - 1
    if (index < 0) {
      index = 0
    }
    if (index > pages.length - 1) {
      index = pages.length - 1
    }
    const srcPage = pages[index]
    const pageSize = srcPage.getSize()
    const pageW = pageSize.width
    const pageH = pageSize.height

    if (!hasOverlayBox() || !pdfCanvas.value?.width) {
      return { sourcePdf: sourcePdf, srcPage: srcPage, pageW: pageW, pageH: pageH, crop: { x: 0, y: 0, width: pageW, height: pageH }}
    }

    const canvas = pdfCanvas.value
    const scale = pdfRenderScale.value || canvas.width / pageW || 1

    const cropBox = getCropBox(canvas)
    const boxW = cropBox.cropWidth / scale
    const boxH = cropBox.cropHeight / scale
    const x = cropBox.startX / scale
    const cropTop = cropBox.startY / scale
    
    // PDF starts from the bottom-left, so we convert canvas position to PDF position
    const y = pageH - (cropTop + boxH)

    let left = x
    if (left < 0) { left = 0 }
    if (left > pageW) { left = pageW }

    let bottom = y
    if (bottom < 0) { bottom = 0 }
    if (bottom > pageH) { bottom = pageH }

    let right = left + boxW
    if (right < left) { right = left }
    if (right > pageW) { right = pageW }

    let top = bottom + boxH
    if (top < bottom) { top = bottom }
    if (top > pageH) { top = pageH }

    const width = Math.max(1, right - left)
    const height = Math.max(1, top - bottom)

    return { sourcePdf: sourcePdf, srcPage: srcPage, pageW: pageW, pageH: pageH, crop: { x: left, y: bottom, width: width, height: height }}
  }

  // return a blob without downloading it, so we can show the file size first
  async function prepareExport({ format = 'png' } = {}) {
    format = String(format || 'png').toLowerCase()

    if (isPdf.value) {
      if (format === 'pdf') {
        const { srcPage, crop } = await getPdfCropData()
        const croppedPdf = await PDFDocument.create()
        const croppedPage = await croppedPdf.embedPage(srcPage, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height })
        croppedPdf.addPage([crop.width, crop.height]).drawPage(croppedPage, { x: 0, y: 0 })

        const bytes = await croppedPdf.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return { blob: blob, sizeBytes: blob.size, fileExtension: 'pdf', mime: 'application/pdf' }
      }

      const src = getSourceCanvas()
      if (!src) {
        return { blob: null, sizeBytes: 0, fileExtension: format }
      }

      const cropBox = getCropBox(src)
      const { startX, startY, cropWidth, cropHeight } = cropBox
      const canvas = document.createElement('canvas')
      canvas.width = cropWidth
      canvas.height = cropHeight
      canvas.getContext('2d').drawImage(src, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
      const blob = await canvasToBlob(canvas, mime)
      const size = blob ? blob.size : 0
      return { blob: blob, sizeBytes: size, fileExtension: format, mime: mime }
    }

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return { blob: null, sizeBytes: 0, fileExtension: format }
    }

    const hasOverlay = overlayW.value > 0 && overlayH.value > 0
    const startX = hasOverlay ? overlayX.value : 0
    const startY = hasOverlay ? overlayY.value : 0
    const cropWidth = hasOverlay ? overlayW.value : img.naturalWidth
    const cropHeight = hasOverlay ? overlayH.value : img.naturalHeight
    const canvas = document.createElement('canvas')
    canvas.width = cropWidth
    canvas.height = cropHeight
    canvas.getContext('2d').drawImage(img, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

    if (format === 'pdf') {
      try {
        const croppedPdf = await PDFDocument.create()

        const pngBlob = await canvasToBlob(canvas, 'image/png')
        const pngArrayBuffer = await pngBlob.arrayBuffer()
        const pngBytes = new Uint8Array(pngArrayBuffer)
        const imgPng = await croppedPdf.embedPng(pngBytes)
        const imageSize = imgPng.scale(1)

        const page = croppedPdf.addPage([imageSize.width, imageSize.height])
        page.drawImage(imgPng, { x: 0, y: 0, width: imageSize.width, height: imageSize.height })

        const bytes = await croppedPdf.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return { blob: blob, sizeBytes: blob.size, fileExtension: 'pdf', mime: 'application/pdf' }
      } catch (error) {
        console.error('PDF creation error:', error)
        return { blob: null, sizeBytes: 0, fileExtension: format }
      }
    }

    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const blob = await canvasToBlob(canvas, mime)
    const size = blob ? blob.size : 0
    return { blob: blob, sizeBytes: size, fileExtension: format, mime: mime }
  }

  async function exportFile({ name = 'export', format = 'png' } = {}) {
    const JPG_QUALITY = 1
    const fileExtension = extOf(format)
    const cleanName = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'export'
    const filename = `${cleanName}.${fileExtension}`

    if (isPdf.value) {
      if (format === 'pdf') {
        const { srcPage, crop } = await getPdfCropData()
        const croppedPdf = await PDFDocument.create()
        const croppedPage = await croppedPdf.embedPage(srcPage, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height })
        croppedPdf.addPage([crop.width, crop.height]).drawPage(croppedPage, { x: 0, y: 0 })

        const bytes = await croppedPdf.save()
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        triggerDownload(url, filename)
        return
      }

      const pdf = await pdfjsLib.getDocument({ data: pdfBytes() }).promise
      const page = await pdf.getPage(currentPage.value)
      const defaultViewport = page.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_EXPORT_DPI / 72)
      const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (defaultViewport.width * defaultViewport.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const exportViewport = page.getViewport({ scale })

      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = Math.round(exportViewport.width)
      tempCanvas.height = Math.round(exportViewport.height)

      await page.render({
        canvasContext: tempCanvas.getContext('2d', { willReadFrequently: true, alpha: true }),
        viewport: exportViewport,
        background: 'rgba(0, 0, 0, 0)',
      }).promise

      // export uses higher DPI than the preview, so overlay positions must be scaled up
      const zoomFactor = scale / (pdfRenderScale.value || 1)
      const prevCanvas = pdfCanvas.value || tempCanvas
      const previousCropBox = getCropBox(prevCanvas)

      let exportX, exportY, exportWidth, exportHeight
      if (!previousCropBox) {
        exportX = 0
        exportY = 0
        exportWidth = tempCanvas.width
        exportHeight = tempCanvas.height
      } else {
        exportX = Math.round(previousCropBox.startX * zoomFactor)
        exportY = Math.round(previousCropBox.startY * zoomFactor)
        exportWidth = Math.round(previousCropBox.cropWidth * zoomFactor)
        exportHeight = Math.round(previousCropBox.cropHeight * zoomFactor)

        if (exportX < 0) {
          exportWidth += exportX
          exportX = 0
        }
        if (exportY < 0) {
          exportHeight += exportY
          exportY = 0
        }

        if (exportX + exportWidth > tempCanvas.width) {
          exportWidth = tempCanvas.width - exportX
        }
        if (exportY + exportHeight > tempCanvas.height) {
          exportHeight = tempCanvas.height - exportY
        }

        if (exportWidth < 1) { exportWidth = 1 }
        if (exportWidth > tempCanvas.width) { exportWidth = tempCanvas.width }
        if (exportHeight < 1) { exportHeight = 1 }
        if (exportHeight > tempCanvas.height) { exportHeight = tempCanvas.height }
      }

      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = exportWidth
      exportCanvas.height = exportHeight
      const exportContext = exportCanvas.getContext('2d')
      exportContext.drawImage(tempCanvas, exportX, exportY, exportWidth, exportHeight, 0, 0, exportWidth, exportHeight)

      let url
      if (format === 'png') {
        url = exportCanvas.toDataURL('image/png')
      } else {
        const white = document.createElement('canvas')
        white.width = exportWidth
        white.height = exportHeight
        const jpegContext = white.getContext('2d')
        jpegContext.fillStyle = '#ffffff'
        jpegContext.fillRect(0, 0, exportWidth, exportHeight)
        jpegContext.drawImage(exportCanvas, 0, 0)
        url = white.toDataURL('image/jpeg', JPG_QUALITY)
      }

      triggerDownload(url, filename)
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return
    }

    const hasOverlay = overlayW.value > 0 && overlayH.value > 0
    const x = hasOverlay ? overlayX.value : 0
    const y = hasOverlay ? overlayY.value : 0
    const width = hasOverlay ? overlayW.value : maxW.value
    const height = hasOverlay ? overlayH.value : maxH.value

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    // JPEG has no transparency, so fill white to avoid black transparent areas
    if (format === 'jpg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(img, x, y, width, height, 0, 0, width, height)

    if (format === 'pdf') {
      try {
        const croppedPdf = await PDFDocument.create()

        const pngBlob = await canvasToBlob(canvas, 'image/png')
        const pngArrayBuffer = await pngBlob.arrayBuffer()
        const pngBytes = new Uint8Array(pngArrayBuffer)
        const imgPng = await croppedPdf.embedPng(pngBytes)
        const imageSize = imgPng.scale(1)

        const page = croppedPdf.addPage([imageSize.width, imageSize.height])
        page.drawImage(imgPng, { x: 0, y: 0, width: imageSize.width, height: imageSize.height })

        const bytes = await croppedPdf.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()

        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 100)
      } catch (error) {
        console.error('PDF export error:', error)
        alert('Failed to create PDF: ' + error.message)
      }
      return
    }

    const url = format === 'png' ? canvas.toDataURL('image/png'): canvas.toDataURL('image/jpeg', JPG_QUALITY)
    triggerDownload(url, filename)
  }

  async function download() {
    if (isPdf.value) {
      const { srcPage, crop } = await getPdfCropData()
      const croppedPdf = await PDFDocument.create()

      const croppedPage = await croppedPdf.embedPage(srcPage, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      })

      croppedPdf.addPage([crop.width, crop.height]).drawPage(croppedPage, { x: 0, y: 0 })

      const bytes = await croppedPdf.save()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))

      const a = document.createElement('a')
      a.href = url
      a.download = `page-${currentPage.value}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    const link = document.createElement('a')
    link.href = preview.value
    link.download = 'edited.png'
    link.click()
  }

  // add the download link to the page, so Firefox starts the download correctly
  function triggerDownload(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename

    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function getSourceCanvas() {
    if (isPdf.value && pdfCanvas.value?.width) {
      return pdfCanvas.value
    }
    return null
  }

  return {
    prepareExport,
    exportFile,
    download,
  }
}
