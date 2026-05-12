// Author: Peter Huňady (xhunadp00)
// File: useGrayscale.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { dataURLtoU8 } from './imageProcessing'

const PDF_EXPORT_DPI = 600
const MAX_CANVAS_PIXELS = 25000000

export function useGrayscale({
  isPdf,
  pdfCanvas,
  imgEl,
  emit,
  preview,
  originalPdf,
  originalFileSize,
  originalLastModified,
  suppressGalleryOnce,
  pdfBytes,
  renderPdfPage,
  pushHistory,
  currentPage
}) {
  const previewOn = ref(false)
  const previewType = ref(null)

  // use a CSS filter for fast preview, without changing pixels before apply
  function previewGrayscale({ strength = 1 } = {}) {
    const previewElement = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!previewElement) {
      return
    }

    let strengthValue = strength
    if (strengthValue < 0) { 
      strengthValue = 0
    }
    if (strengthValue > 1) {
      strengthValue = 1
    }

    previewElement.style.filter = `grayscale(${strengthValue})`
    previewType.value = 'grayscale'
    previewOn.value = true
  }

  function endPreviewGrayscale() {
    const previewElement = isPdf.value ? pdfCanvas.value : imgEl.value
    if (previewElement) {
      previewElement.style.filter = ''
    }

    if (previewType.value === 'grayscale') {
      previewOn.value = false
      previewType.value = null
    }
  }

  // move each color channel closer to brightness value, strength 0 keeps colors, strength 1 makes full grayscale
  function grayscaleCanvas(canvas, strength = 1) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = canvas.width
    const height = canvas.height
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    // standard ITU-R BT.601 weights
    const redWeight = 0.299
    const greenWeight = 0.587
    const blueWeight = 0.114
    let strengthValue = strength

    if (strengthValue < 0) {
      strengthValue = 0
    }
    if (strengthValue > 1) {
      strengthValue = 1
    }

    for (let i = 0; i < data.length; i += 4) {
      const luminance = data[i] * redWeight + data[i + 1] * greenWeight + data[i + 2] * blueWeight
      data[i] = Math.round(data[i] + (luminance - data[i]) * strengthValue)
      data[i + 1] = Math.round(data[i + 1] + (luminance - data[i + 1]) * strengthValue)
      data[i + 2] = Math.round(data[i + 2] + (luminance - data[i + 2]) * strengthValue)
    }
    context.putImageData(imageData, 0, 0)
  }

  async function applyGrayscale({ strength = 1 } = {}) {
    pushHistory()
    endPreviewGrayscale()

    if (isPdf.value) {
      // stop the gallery from refreshing while the PDF is being changed
      suppressGalleryOnce.value = true

      const sourcePdf = await PDFDocument.load(pdfBytes(), { ignoreEncryption: true })
      const croppedPdf = await PDFDocument.create()
      const pages = sourcePdf.getPages()
      const totalPages = pages.length
      let activeIndex = (currentPage.value || 1) - 1

      if (activeIndex < 0) {
        activeIndex = 0
      }
      
      if (activeIndex > totalPages - 1) {
        activeIndex = totalPages - 1
      }

      const pdfJs = await pdfjsLib.getDocument({ data: pdfBytes() }).promise
      const rasterPage = await pdfJs.getPage(activeIndex + 1)
      const defaultViewport = rasterPage.getViewport({ scale: 1 })
      
      // render in high DPI to keep detail, but limit it to avoid memory problems
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
        background: 'rgba(0,0,0,0)'
      }).promise

      grayscaleCanvas(tempCanvas, strength)

      const pngBytes = dataURLtoU8(tempCanvas.toDataURL('image/png'))
      const pngImg = await croppedPdf.embedPng(pngBytes)

      // replace only the current page with grayscale and keep other pages unchanged
      for (let i = 0; i < totalPages; i++) {
        if (i === activeIndex) {
          const pageSize = pages[i].getSize()
          const pageW = pageSize.width
          const pageH = pageSize.height
          const newPage = croppedPdf.addPage([pageW, pageH])

          newPage.drawImage(pngImg, { x: 0, y: 0, width: pageW, height: pageH })
        } else {
          const copiedPages = await croppedPdf.copyPages(sourcePdf, [i])
          croppedPdf.addPage(copiedPages[0])
        }
      }

      const newBytes = await croppedPdf.save()
      originalPdf.value = newBytes
      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }))
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      await renderPdfPage(currentPage.value)
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)

    grayscaleCanvas(canvas, strength)

    const newSrc = canvas.toDataURL('image/png')
    preview.value = newSrc
    emit('update:preview', newSrc)
    emit('update:meta', {
      name: 'grayscale.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: canvas.width,
      height: canvas.height,
      lastModified: Date.now()
    })
  }

  return {
    previewOn,
    previewType,
    previewGrayscale,
    endPreviewGrayscale,
    applyGrayscale,
  }
}