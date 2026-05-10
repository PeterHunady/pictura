import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { dataURLtoU8 } from './imageProcessing'

const { getDocument } = pdfjsLib

const PDF_EXPORT_DPI = 600
const MAX_CANVAS_PIXELS = 25e6

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

  function previewGrayscale({ strength = 1 } = {}) {
    const previewElement = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!previewElement) {
      return
    }

    const strengthValue = Math.max(0, Math.min(1, strength))
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

  function grayscaleCanvas(canvas, strength = 1) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = canvas.width, height = canvas.height
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const redWeight = 0.299, greenWeight = 0.587, blueWeight = 0.114
    const strengthValue = Math.max(0, Math.min(1, strength))

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
      suppressGalleryOnce.value = true

      const sourcePdf = await PDFDocument.load(pdfBytes(), { ignoreEncryption: true })
      const croppedPdf = await PDFDocument.create()
      const pages = sourcePdf.getPages()
      const totalPages = pages.length
      const activeIndex = Math.max(0, Math.min(totalPages - 1, (currentPage.value || 1) - 1))
      const pdfJs = await getDocument({ data: pdfBytes() }).promise
      const rasterPage = await pdfJs.getPage(activeIndex + 1)

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
        background: 'rgba(0,0,0,0)'
      }).promise

      grayscaleCanvas(tempCanvas, strength)

      const pngBytes = dataURLtoU8(tempCanvas.toDataURL('image/png'))
      const pngImg = await croppedPdf.embedPng(pngBytes)

      for (let i = 0; i < totalPages; i++) {
        if (i === activeIndex) {
          const { width: pageW, height: pageH } = pages[i].getSize()
          const newPage = croppedPdf.addPage([pageW, pageH])

          newPage.drawImage(pngImg, { x: 0, y: 0, width: pageW, height: pageH })
        } else {
          const [copied] = await croppedPdf.copyPages(sourcePdf, [i])
          croppedPdf.addPage(copied)
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