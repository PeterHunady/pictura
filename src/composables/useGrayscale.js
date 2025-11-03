import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { dataURLtoU8 } from '../utils/imageProcessing'

const { getDocument } = pdfjsLib

const PDF_RASTER_OPS_DPI = 600
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
  pushHistory
}) {
  const previewOn = ref(false)
  const previewType = ref(null)

  function previewGrayscale({ strength = 1 } = {}) {
    const node = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!node) {
      return
    }

    const s = Math.max(0, Math.min(1, strength))
    node.style.filter = `grayscale(${s})`
    previewType.value = 'grayscale'
    previewOn.value = true
  }

  /**
   * End grayscale preview
   */
  function endPreviewGrayscale() {
    const node = isPdf.value ? pdfCanvas.value : imgEl.value
    if (node) {
      node.style.filter = ''
    }

    if (previewType.value === 'grayscale') {
      previewOn.value = false
      previewType.value = null
    }
  }

  function grayscaleCanvas(canvas, strength = 1, mode = 'bt601') {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const w = canvas.width, h = canvas.height
    const im = ctx.getImageData(0, 0, w, h)
    const d = im.data

    let wr = 0.299, wg = 0.587, wb = 0.114
    if (mode === 'bt709') {
      wr = 0.2126; wg = 0.7152; wb = 0.0722
    }

    const s = Math.max(0, Math.min(1, strength))
    for (let i = 0; i < d.length; i += 4) {
      const Y = d[i] * wr + d[i + 1] * wg + d[i + 2] * wb
      d[i] = Math.round(d[i] + (Y - d[i]) * s)
      d[i + 1] = Math.round(d[i + 1] + (Y - d[i + 1]) * s)
      d[i + 2] = Math.round(d[i + 2] + (Y - d[i + 2]) * s)
    }
    ctx.putImageData(im, 0, 0)
  }

  async function applyGrayscale({ mode = 'bt601', strength = 1 } = {}) {
    pushHistory()
    endPreviewGrayscale()

    if (isPdf.value) {
      suppressGalleryOnce.value = true
      const pdf = await getDocument({ data: pdfBytes() }).promise
      const outDoc = await PDFDocument.create()

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)

        const vp1 = page.getViewport({ scale: 1 })
        const dpiScale = Math.max(1, PDF_RASTER_OPS_DPI / 72)
        const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
        const scale = Math.min(dpiScale, maxScaleByPixels)
        const vp = page.getViewport({ scale })

        const off = document.createElement('canvas')
        off.width = Math.round(vp.width)
        off.height = Math.round(vp.height)

        await page.render({
          canvasContext: off.getContext('2d', { willReadFrequently: true }),
          viewport: vp,
          background: 'rgba(0,0,0,0)'
        }).promise

        grayscaleCanvas(off, strength, mode)

        const pngBytes = dataURLtoU8(off.toDataURL('image/png'))
        const pngImg = await outDoc.embedPng(pngBytes)
        const wPt = vp1.width
        const hPt = vp1.height
        const outPage = outDoc.addPage([wPt, hPt])
        outPage.drawImage(pngImg, { x: 0, y: 0, width: wPt, height: hPt })
      }

      const newBytes = await outDoc.save()
      originalPdf.value = newBytes
      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }))
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      await renderPdfPage()
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return
    }

    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)

    grayscaleCanvas(c, strength, mode)

    const newSrc = c.toDataURL('image/png')
    preview.value = newSrc
    emit('update:preview', newSrc)
    emit('update:meta', {
      name: 'grayscale.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: c.width,
      height: c.height,
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