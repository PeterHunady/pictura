import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, extOf } from '../utils/imageProcessing'

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
  maxH,
}) {
  function hasOverlayBox() {
    return overlayW.value > 0 && overlayH.value > 0
  }

  function getOverlayOnCanvas(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return null

    const W = canvas.width
    const H = canvas.height

    if (!hasOverlayBox()) {
      return { sx: 0, sy: 0, sw: W, sh: H }
    }

    let sx = overlayX.value
    let sy = overlayY.value
    let sw = overlayW.value
    let sh = overlayH.value

    if (sw <= 0 || sh <= 0) {
      return { sx: 0, sy: 0, sw: W, sh: H }
    }

    if (sx < 0) {
      sw += sx
      sx = 0
    }
    if (sy < 0) {
      sh += sy
      sy = 0
    }

    if (sx + sw > W) {
      sw = W - sx
    }
    if (sy + sh > H) {
      sh = H - sy
    }

    sw = Math.max(1, Math.min(sw, W))
    sh = Math.max(1, Math.min(sh, H))

    return {
      sx: Math.round(sx),
      sy: Math.round(sy),
      sw: Math.round(sw),
      sh: Math.round(sh),
    }
  }
  
  async function getPdfPageAndCrop() {
    const bytes = pdfBytes()
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = srcDoc.getPages()

    const idx = Math.max(
      0,
      Math.min(pages.length - 1, (currentPage?.value || 1) - 1),
    )

    const srcPage = pages[idx]
    const { width: pageW, height: pageH } = srcPage.getSize()

    if (!hasOverlayBox() || !pdfCanvas.value?.width) {
      return {
        srcDoc,
        srcPage,
        pageW,
        pageH,
        crop: { x: 0, y: 0, width: pageW, height: pageH },
      }
    }

    const canvas = pdfCanvas.value
    const scale =
      pdfRenderScale.value || canvas.width / pageW || 1

    const ov = getOverlayOnCanvas(canvas)
    const boxW = ov.sw / scale
    const boxH = ov.sh / scale
    const x = ov.sx / scale
    const yTop = ov.sy / scale

    const y = pageH - (yTop + boxH)

    let left = Math.max(0, Math.min(pageW, x))
    let bottom = Math.max(0, Math.min(pageH, y))
    let right = Math.max(left, Math.min(pageW, left + boxW))
    let top = Math.max(bottom, Math.min(pageH, bottom + boxH))

    const width = Math.max(1, right - left)
    const height = Math.max(1, top - bottom)

    return {
      srcDoc,
      srcPage,
      pageW,
      pageH,
      crop: { x: left, y: bottom, width, height },
    }
  }

  async function estimateExport({ format = 'png' } = {}) {
    format = String(format || 'png').toLowerCase()

    if (isPdf.value) {
      if (format === 'pdf') {
        const { srcPage, crop } = await getPdfPageAndCrop()
        const outDoc = await PDFDocument.create()

        const emb = await outDoc.embedPage(srcPage, {
          left: crop.x,
          bottom: crop.y,
          right: crop.x + crop.width,
          top: crop.y + crop.height,
        })

        outDoc.addPage([crop.width, crop.height]).drawPage(emb, { x: 0, y: 0 })

        const bytes = await outDoc.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return { blob, sizeBytes: blob.size, ext: 'pdf', mime: 'application/pdf' }
      }

      const src = getSourceCanvas()
      if (!src) return { blob: null, sizeBytes: 0, ext: format }

      const ov = getOverlayOnCanvas(src)
      const { sx, sy, sw, sh } = ov

      const c = document.createElement('canvas')
      c.width = sw
      c.height = sh
      c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)

      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
      const blob = await canvasToBlob(c, mime)
      const size = blob ? blob.size : 0
      return { blob, sizeBytes: size, ext: format, mime }
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return { blob: null, sizeBytes: 0, ext: format }

    const hasOv = overlayW.value > 0 && overlayH.value > 0
    const sx = hasOv ? overlayX.value : 0
    const sy = hasOv ? overlayY.value : 0
    const sw = hasOv ? overlayW.value : img.naturalWidth
    const sh = hasOv ? overlayH.value : img.naturalHeight

    const c = document.createElement('canvas')
    c.width = sw
    c.height = sh
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    if (format === 'pdf') {
      try {
        const outDoc = await PDFDocument.create()

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = sw
        tempCanvas.height = sh
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.fillStyle = '#ffffff'
        tempCtx.fillRect(0, 0, sw, sh)
        tempCtx.drawImage(c, 0, 0)

        const jpegBlob = await canvasToBlob(tempCanvas, 'image/jpeg')
        const jpegArrayBuffer = await jpegBlob.arrayBuffer()
        const jpegBytes = new Uint8Array(jpegArrayBuffer)

        const imgJpeg = await outDoc.embedJpg(jpegBytes)
        const imgDims = imgJpeg.scale(1)

        const page = outDoc.addPage([imgDims.width, imgDims.height])
        page.drawImage(imgJpeg, {
          x: 0,
          y: 0,
          width: imgDims.width,
          height: imgDims.height,
        })

        const bytes = await outDoc.save()
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return { blob, sizeBytes: blob.size, ext: 'pdf', mime: 'application/pdf' }
      } catch (error) {
        console.error('PDF creation error:', error)
        return { blob: null, sizeBytes: 0, ext: format }
      }
    }

    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const blob = await canvasToBlob(c, mime)
    const size = blob ? blob.size : 0
    return { blob, sizeBytes: size, ext: format, mime }
  }

  async function exportFile({ name = 'export', format = 'png' } = {}) {
    const JPG_QUALITY = 1
    const ext = extOf(format)
    const cleanName = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'export'
    const filename = `${cleanName}.${ext}`

    if (isPdf.value) {
      if (format === 'pdf') {
        const { srcPage, crop } = await getPdfPageAndCrop()
        const outDoc = await PDFDocument.create()

        const embedded = await outDoc.embedPage(srcPage, {
          left: crop.x,
          bottom: crop.y,
          right: crop.x + crop.width,
          top: crop.y + crop.height,
        })
        outDoc.addPage([crop.width, crop.height]).drawPage(embedded, { x: 0, y: 0 })

        const bytes = await outDoc.save()
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        triggerDownload(url, filename)
        return
      }

      const pdf = await getDocument({ data: pdfBytes() }).promise
      const page = await pdf.getPage(currentPage.value)

      const vp1 = page.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_RASTER_OPS_DPI / 72)
      const maxScaleByPixels =
        Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const vp = page.getViewport({ scale })

      const off = document.createElement('canvas')
      off.width = Math.round(vp.width)
      off.height = Math.round(vp.height)

      await page.render({
        canvasContext: off.getContext('2d', {
          willReadFrequently: true,
          alpha: true,
        }),
        viewport: vp,
        background: 'rgba(0, 0, 0, 0)',
      }).promise

      const factor = scale / (pdfRenderScale.value || 1)

      const prevCanvas = pdfCanvas.value || off
      const ovPrev = getOverlayOnCanvas(prevCanvas)

      let ox, oy, ow, oh
      if (!ovPrev) {
        ox = 0
        oy = 0
        ow = off.width
        oh = off.height
      } else {
        ox = Math.round(ovPrev.sx * factor)
        oy = Math.round(ovPrev.sy * factor)
        ow = Math.round(ovPrev.sw * factor)
        oh = Math.round(ovPrev.sh * factor)

        if (ox < 0) {
          ow += ox
          ox = 0
        }
        if (oy < 0) {
          oh += oy
          oy = 0
        }
        if (ox + ow > off.width) ow = off.width - ox
        if (oy + oh > off.height) oh = off.height - oy

        ow = Math.max(1, Math.min(ow, off.width))
        oh = Math.max(1, Math.min(oh, off.height))
      }

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
        white.width = ow
        white.height = oh
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
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')

    if (format === 'jpg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

    if (format === 'pdf') {
      try {
        const outDoc = await PDFDocument.create()

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = w
        tempCanvas.height = h
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.fillStyle = '#ffffff'
        tempCtx.fillRect(0, 0, w, h)
        tempCtx.drawImage(c, 0, 0)

        const jpegBlob = await canvasToBlob(tempCanvas, 'image/jpeg')
        const jpegArrayBuffer = await jpegBlob.arrayBuffer()
        const jpegBytes = new Uint8Array(jpegArrayBuffer)

        const imgJpeg = await outDoc.embedJpg(jpegBytes)
        const imgDims = imgJpeg.scale(1)

        const page = outDoc.addPage([imgDims.width, imgDims.height])
        page.drawImage(imgJpeg, {
          x: 0,
          y: 0,
          width: imgDims.width,
          height: imgDims.height,
        })

        const bytes = await outDoc.save()
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

    const url =
      format === 'png'
        ? c.toDataURL('image/png')
        : c.toDataURL('image/jpeg', JPG_QUALITY)

    triggerDownload(url, filename)
  }

  async function download() {
    if (isPdf.value) {
      const { srcPage, crop } = await getPdfPageAndCrop()
      const outDoc = await PDFDocument.create()

      const embedded = await outDoc.embedPage(srcPage, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      })

      outDoc.addPage([crop.width, crop.height]).drawPage(embedded, { x: 0, y: 0 })

      const bytes = await outDoc.save()
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/pdf' }),
      )

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
    download,
  }
}
