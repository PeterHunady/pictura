import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, dataURLtoU8, extOf } from '../utils/imageProcessing'

const { getDocument } = pdfjsLib

const PDF_RASTER_OPS_DPI = 600
const MAX_CANVAS_PIXELS = 25e6

export function useExport({
  isPdf,
  pdfCanvas,
  imgEl,
  overlayX,
  overlayY,
  overlayW,
  overlayH,
  overlayBoxPdfCoords,
  pdfBytes,
  originalPdf,
  currentPage,
  pdfRenderScale,
  preview,
  originalFileName,
  maxW,
  maxH
}) {

  async function estimateExport({ format = 'png' } = {}) {
    format = String(format || 'png').toLowerCase()

    if (isPdf.value) {
      if (format === 'pdf') {
        const srcDoc = await PDFDocument.load(pdfBytes())
        const outDoc = await PDFDocument.create()

        const srcPage = srcDoc.getPages()[currentPage.value - 1]
        const { width: pageW, height: pageH } = srcPage.getSize()

        const hasOverlay = overlayW.value > 0 && overlayH.value > 0
        const { x, y, width, height } = hasOverlay ? overlayBoxPdfCoords() : { x: 0, y: 0, width: pageW, height: pageH }

        const emb = await outDoc.embedPage(srcPage, {
          left: x, bottom: y, right: x + width, top: y + height
        })
        outDoc.addPage([width, height]).drawPage(emb, { x: 0, y: 0 })

        const bytes = await outDoc.save()
        const blob  = new Blob([bytes], { type: 'application/pdf' })
        return { blob, sizeBytes: blob.size, ext: 'pdf', mime: 'application/pdf' }
      }

      const src = getSourceCanvas()
      if (!src) return { blob: null, sizeBytes: 0, ext: format }

      const sx = overlayW.value > 0 ? overlayX.value : 0
      const sy = overlayH.value > 0 ? overlayY.value : 0
      const sw = overlayW.value > 0 ? overlayW.value : src.width
      const sh = overlayH.value > 0 ? overlayH.value : src.height

      const c = document.createElement('canvas')
      c.width = sw; c.height = sh
      c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)

      const mime  = format === 'jpg' ? 'image/jpeg' : 'image/png'
      const blob  = await canvasToBlob(c, mime)
      const size  = blob ? blob.size : 0
      return { blob, sizeBytes: size, ext: format, mime }
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return { blob: null, sizeBytes: 0, ext: format }

    const sx = overlayW.value > 0 ? overlayX.value : 0
    const sy = overlayH.value > 0 ? overlayY.value : 0
    const sw = overlayW.value > 0 ? overlayW.value : img.naturalWidth
    const sh = overlayH.value > 0 ? overlayH.value : img.naturalHeight

    const c = document.createElement('canvas')
    c.width = sw; c.height = sh
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const mime  = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const blob  = await canvasToBlob(c, mime)
    const size  = blob ? blob.size : 0
    return { blob, sizeBytes: size, ext: format, mime }
  }

  async function exportFile({ name = 'export', format = 'png' } = {}) {
    const JPG_QUALITY = 1
    const ext = extOf(format)
    const cleanName = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'export'
    const filename = `${cleanName}.${ext}`

    if (isPdf.value) {
      if (format === 'pdf') {
        const srcDoc = await PDFDocument.load(pdfBytes())
        const outDoc = await PDFDocument.create()
        const page = (await srcDoc.getPages())[currentPage.value - 1]
        const { width: pageW, height: pageH } = page.getSize()
        const hasOverlay = overlayW.value > 0 && overlayH.value > 0

        let box
        if (hasOverlay) {
          const { x, y, width, height } = overlayBoxPdfCoords()
          box = { x, y, w: width, h: height }
        } else {
          box = { x: 0, y: 0, w: pageW, h: pageH }
        }

        const embedded = await outDoc.embedPage(page, {
          left: box.x, bottom: box.y, right: box.x + box.w, top: box.y + box.h,
        })
        outDoc.addPage([box.w, box.h]).drawPage(embedded, { x: 0, y: 0 })

        const bytes = await outDoc.save()
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        triggerDownload(url, filename)
        return
      }

      const pdf = await getDocument({ data: pdfBytes() }).promise
      const page = await pdf.getPage(currentPage.value)

      const vp1 = page.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_RASTER_OPS_DPI / 72)
      const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const vp = page.getViewport({ scale })

      const off = document.createElement('canvas')
      off.width = Math.round(vp.width)
      off.height = Math.round(vp.height)

      await page.render({
        canvasContext: off.getContext('2d', { willReadFrequently: true, alpha: true }),
        viewport: vp,
        background: 'rgba(0,0,0,0)'
      }).promise

      const factor = (scale / (pdfRenderScale.value || 1))
      const hasOverlay = overlayW.value > 0 && overlayH.value > 0
      const ox = hasOverlay ? Math.round(overlayX.value * factor) : 0
      const oy = hasOverlay ? Math.round(overlayY.value * factor) : 0
      const ow = hasOverlay ? Math.round(overlayW.value * factor) : off.width
      const oh = hasOverlay ? Math.round(overlayH.value * factor) : off.height

      const out = document.createElement('canvas')
      out.width = ow
      out.height = oh
      const octx = out.getContext('2d')
      octx.drawImage(off, ox, oy, ow, oh, 0, 0, ow, oh)

      let url
      if (format === 'png') {
        url = out.toDataURL('image/png')

      } else {
        const white = document.createElement('canvas')
        white.width = ow; white.height = oh
        const wctx = white.getContext('2d')
        wctx.fillStyle = '#ffffff'
        wctx.fillRect(0, 0, ow, oh)
        wctx.drawImage(out, 0, 0)
        url = white.toDataURL('image/jpeg', JPG_QUALITY)
      }

      triggerDownload(url, filename)
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return

    const hasOverlay = overlayW.value > 0 && overlayH.value > 0
    const x = hasOverlay ? overlayX.value : 0
    const y = hasOverlay ? overlayY.value : 0
    const w = hasOverlay ? overlayW.value : maxW.value
    const h = hasOverlay ? overlayH.value : maxH.value

    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')

    if (format === 'jpg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

    if (format === 'pdf') {
      const pngBytes = dataURLtoU8(c.toDataURL('image/png'))
      const outDoc = await PDFDocument.create()
      const imgPng = await outDoc.embedPng(pngBytes)
      const page = outDoc.addPage([w, h])
      page.drawImage(imgPng, { x: 0, y: 0, width: w, height: h })

      const bytes = await outDoc.save()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      triggerDownload(url, filename)
      return
    }

    const url = (format === 'png')
      ? c.toDataURL('image/png')
      : c.toDataURL('image/jpeg', JPG_QUALITY)

    triggerDownload(url, filename)
  }

  async function download() {
    if (isPdf.value) {
      const srcDoc = await PDFDocument.load(pdfBytes())
      const outDoc = await PDFDocument.create()

      const pages = srcDoc.getPages()
      const srcPage = pages[currentPage.value - 1]
      const { width: pageW, height: pageH } = srcPage.getSize()

      const hasOverlay = overlayW.value > 0 && overlayH.value > 0
      const { x, y, width, height } = hasOverlay ? overlayBoxPdfCoords() : { x: 0, y: 0, width: pageW, height: pageH }

      const embedded = await outDoc.embedPage(srcPage, {
        left: x,
        bottom: y,
        right: x + width,
        top: y + height,
      })

      outDoc.addPage([width, height]).drawPage(embedded, { x: 0, y: 0 })

      const bytes = await outDoc.save()
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
    estimateExport,
    exportFile,
    download
  }
}