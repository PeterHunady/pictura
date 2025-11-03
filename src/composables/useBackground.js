import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { hexToRgb, rgbToHex, dataURLtoU8, canvasHasAlpha } from '../utils/imageProcessing'

const { getDocument } = pdfjsLib

const PDF_RASTER_OPS_DPI = 600
const MAX_CANVAS_PIXELS = 25e6

export function useBackground({
  isPdf,
  pdfCanvas,
  imgEl,
  origBg,
  emit,
  hasAlpha,
  checkerOn,
  panCont,
  madeTransparentPdf,
  madeTransparentImg,
  originalFileName,
  originalFileType,
  preview,
  originalPdf,
  originalFileSize,
  originalLastModified,
  pdfBytes,
  renderPdfPage,
  setHasAlpha,
  pushHistory
}) {
  const previewImg = ref(null)
  const previewOn = ref(false)
  const previewType = ref(null)
  let matteKey = null
  let matteDataURL = null

  function getSourceCanvas() {
    if (isPdf.value && pdfCanvas.value?.width) {
      return pdfCanvas.value
    }
    const img = imgEl.value

    if (!img?.naturalWidth) {
      return null
    }
    const off = document.createElement('canvas')

    off.width = img.naturalWidth
    off.height = img.naturalHeight
    off.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    return off
  }

  function detectBackground() {
    let src

    if (isPdf.value && pdfCanvas.value) {
      src = pdfCanvas.value
    } else if (imgEl.value?.naturalWidth) {
      const img = imgEl.value
      const off = document.createElement('canvas')
      off.width = img.naturalWidth
      off.height = img.naturalHeight
      off.getContext('2d').drawImage(img, 0, 0)
      src = off
    } else {
      return
    }

    const W = src.width, H = src.height
    if (!W || !H) return

    const ctx = src.getContext('2d', { willReadFrequently: true })
    const inset = Math.max(1, Math.round(Math.min(W, H) * 0.01))
    const step = Math.max(1, Math.floor(Math.min(W, H) / 80))
    const A_MIN = 8

    const q = v => (v >> 4)
    const keyOf = (r, g, b) => (q(r) << 8) | (q(g) << 4) | q(b)
    const sums = new Map()

    const sampleRow = (y) => {
      const row = ctx.getImageData(0, y, W, 1).data

      for (let x = 0; x < W; x += step) {
        const i = x * 4
        const a = row[i + 3]; if (a <= A_MIN) continue
        const r = row[i], g = row[i + 1], b = row[i + 2]
        const k = keyOf(r, g, b)
        let s = sums.get(k)
        if (!s) { s = { count: 0, R: 0, G: 0, B: 0 }; sums.set(k, s) }
        s.count++; s.R += r; s.G += g; s.B += b
      }
    }

    const sampleCol = (x) => {
      const col = ctx.getImageData(x, 0, 1, H).data

      for (let y = 0; y < H; y += step) {
        const i = y * 4
        const a = col[i + 3]; if (a <= A_MIN) continue
        const r = col[i], g = col[i + 1], b = col[i + 2]
        const k = keyOf(r, g, b)
        let s = sums.get(k)
        if (!s) { s = { count: 0, R: 0, G: 0, B: 0 }; sums.set(k, s) }
        s.count++; s.R += r; s.G += g; s.B += b
      }
    }

    sampleRow(inset)
    sampleRow(Math.max(inset, H - 1 - inset))
    sampleCol(inset)
    sampleCol(Math.max(inset, W - 1 - inset))

    if (sums.size === 0) {
      return
    }

    let bestKey = null, bestCount = -1

    for (const [k, s] of sums.entries()) {
      if (s.count > bestCount) {
        bestCount = s.count
        bestKey = k
      }
    }

    const s = sums.get(bestKey)
    const r = Math.round(s.R / s.count)
    const g = Math.round(s.G / s.count)
    const b = Math.round(s.B / s.count)

    origBg.value = { r, g, b }
    emit('update:bgcolor', rgbToHex(origBg.value))
  }

  function deblendToTransparent(canvas, bgRGB) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const { width, height } = canvas
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const srgbToLinear = v => {
      v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const linearToSrgb = v => {
      v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
      return Math.max(0, Math.min(255, Math.round(v * 255)))
    }

    const br = srgbToLinear(bgRGB.r)
    const bg = srgbToLinear(bgRGB.g)
    const bb = srgbToLinear(bgRGB.b)
    const tol = 0.08

    for (let i = 0; i < data.length; i += 4) {
      const rL = srgbToLinear(data[i])
      const gL = srgbToLinear(data[i + 1])
      const bL = srgbToLinear(data[i + 2])

      const aR = br < 1e-6 ? (rL > br ? 1 : 0) : (rL >= br ? (rL - br) / (1 - br) : (br - rL) / br)
      const aG = bg < 1e-6 ? (gL > bg ? 1 : 0) : (gL >= bg ? (gL - bg) / (1 - bg) : (bg - gL) / bg)
      const aB = bb < 1e-6 ? (bL > bb ? 1 : 0) : (bL >= bb ? (bL - bb) / (1 - bb) : (bb - bL) / bb)
      let a = Math.max(aR, aG, aB)
      if (tol > 0) a = Math.max(0, Math.min(1, (a - tol) / (1 - tol)))

      let fr = 0, fg = 0, fb = 0
      if (a > 1e-5) {
        fr = (rL - (1 - a) * br) / a
        fg = (gL - (1 - a) * bg) / a
        fb = (bL - (1 - a) * bb) / a
      }

      data[i] = linearToSrgb(fr)
      data[i + 1] = linearToSrgb(fg)
      data[i + 2] = linearToSrgb(fb)
      data[i + 3] = Math.round(a * 255)
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
      const pdf = await getDocument({ data: pdfBytes() }).promise
      const outDoc = await PDFDocument.create()
      const bg = origBg.value

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

        const dataUrl = deblendToTransparent(off, bg)
        const pngBytes = dataURLtoU8(dataUrl)
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
      madeTransparentPdf.value = true
      checkerOn.value = true
      setHasAlpha(true)

      await renderPdfPage()
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return

    const w = img.naturalWidth, h = img.naturalHeight
    const off = document.createElement('canvas')
    off.width = w; off.height = h
    off.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h)

    const dataUrl = deblendToTransparent(off, origBg.value)
    preview.value = dataUrl

    emit('update:preview', dataUrl)
    emit('update:meta', {
      name: originalFileName.value,
      type: originalFileType.value,
      size: atob(dataUrl.split(',')[1]).length,
      width: w, height: h,
      lastModified: Date.now()
    })

    madeTransparentImg.value = true
    checkerOn.value = true
    setHasAlpha(true)
  }

  function previewBackgroundColor(hexColor) {
    const src = getSourceCanvas()
    if (!src || !previewImg.value) return

    const hasA = canvasHasAlpha(src)
    const key = `${isPdf.value ? 'pdf' : 'img'}|${src.width}x${src.height}|${hasA ? 'alpha' : `bg:${origBg.value.r},${origBg.value.g},${origBg.value.b}`
      }`

    if (matteKey !== key || !matteDataURL) {
      const MAX_PREV_PX = 2e6
      const scale = Math.min(1, Math.sqrt(MAX_PREV_PX / (src.width * src.height)) || 1)
      const w = Math.max(1, Math.round(src.width * scale))
      const h = Math.max(1, Math.round(src.height * scale))

      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      off.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, w, h)

      matteDataURL = hasA ? off.toDataURL('image/png') : deblendToTransparent(off, origBg.value)
      matteKey = key
    }

    previewImg.value.src = matteDataURL
    previewImg.value.style.backgroundColor = hexColor
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
      const needsMatte = madeTransparentPdf.value || (pdfCanvas.value && canvasHasAlpha(pdfCanvas.value))

      if (!needsMatte) {
        emit('update:preview', preview.value)
        emit('update:bgcolor', hexColor)
        origBg.value = hexToRgb(hexColor)
        checkerOn.value = false
        await renderPdfPage()
        return
      }

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
          canvasContext: off.getContext('2d', { willReadFrequently: true, alpha: true }),
          viewport: vp,
          background: 'rgba(0,0,0,0)'
        }).promise

        const matte = document.createElement('canvas')
        matte.width = off.width
        matte.height = off.height
        const mctx = matte.getContext('2d', { willReadFrequently: true })
        mctx.fillStyle = hexColor
        mctx.fillRect(0, 0, matte.width, matte.height)
        mctx.drawImage(off, 0, 0)

        const pngBytes = dataURLtoU8(matte.toDataURL('image/png'))
        const pngImg = await outDoc.embedPng(pngBytes)
        const wPt = vp1.width
        const hPt = vp1.height
        const outPage = outDoc.addPage([wPt, hPt])
        outPage.drawImage(pngImg, { x: 0, y: 0, width: wPt, height: hPt })
      }

      const newBytes = await outDoc.save()
      originalPdf.value = newBytes

      preview.value = URL.createObjectURL(
        new Blob([newBytes], { type: 'application/pdf' })
      )

      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      emit('update:bgcolor', hexColor)
      origBg.value = hexToRgb(hexColor)

      madeTransparentPdf.value = false
      checkerOn.value = false
      setHasAlpha(false)
      await renderPdfPage()
      return
    }

    const img = imgEl.value
    if (!img?.naturalWidth) return
    const w = img.naturalWidth, h = img.naturalHeight

    const src = document.createElement('canvas')
    src.width = w
    src.height = h
    src.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)

    let newSrc
    if (!hasAlpha.value && !canvasHasAlpha(src)) {
      newSrc = colorToAlphaAndFillCanvas(src, hexColor, origBg.value)
    } else {
      const matte = document.createElement('canvas')
      matte.width = w
      matte.height = h
      const mctx = matte.getContext('2d', { willReadFrequently: true })
      mctx.fillStyle = hexColor
      mctx.fillRect(0, 0, w, h)
      mctx.drawImage(src, 0, 0)
      newSrc = matte.toDataURL('image/png')
    }

    preview.value = newSrc
    emit('update:preview', newSrc)
    emit('update:bgcolor', hexColor)
    emit('update:meta', {
      name: (originalFileName.value || 'image').replace(/\.[^.]+$/, '') + '-matte.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: w,
      height: h,
      lastModified: Date.now(),
    })

    origBg.value = hexToRgb(hexColor)
    madeTransparentImg.value = false
    setHasAlpha(false)
    checkerOn.value = false
    if (panCont.value) panCont.value.style.backgroundColor = hexColor
  }

  function colorToAlphaAndFillCanvas(canvas, hexColor, bgRGB) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = canvas.width
    const height = canvas.height
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const srgbToLinear = (value) => {
      value /= 255
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    }

    const linearToSrgb = (value) => {
      value = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
      return Math.max(0, Math.min(255, Math.round(value * 255)))
    }

    const background = bgRGB || { r: data[0], g: data[1], b: data[2] }
    const baseRedLinear = srgbToLinear(background.r)
    const baseGreenLinear = srgbToLinear(background.g)
    const baseBlueLinear = srgbToLinear(background.b)

    const tolerance = 0.08

    for (let index = 0; index < data.length; index += 4) {
      const srcRedLinear = srgbToLinear(data[index])
      const srcGreenLinear = srgbToLinear(data[index + 1])
      const srcBlueLinear = srgbToLinear(data[index + 2])

      const alphaFromRed = baseRedLinear < 1e-6
        ? (srcRedLinear > baseRedLinear ? 1 : 0)
        : (srcRedLinear >= baseRedLinear ? (srcRedLinear - baseRedLinear) / (1 - baseRedLinear) : (baseRedLinear - srcRedLinear) / baseRedLinear)

      const alphaFromGreen = baseGreenLinear < 1e-6
        ? (srcGreenLinear > baseGreenLinear ? 1 : 0)
        : (srcGreenLinear >= baseGreenLinear
          ? (srcGreenLinear - baseGreenLinear) / (1 - baseGreenLinear)
          : (baseGreenLinear - srcGreenLinear) / baseGreenLinear)

      const alphaFromBlue = baseBlueLinear < 1e-6
        ? (srcBlueLinear > baseBlueLinear ? 1 : 0)
        : (srcBlueLinear >= baseBlueLinear
          ? (srcBlueLinear - baseBlueLinear) / (1 - baseBlueLinear)
          : (baseBlueLinear - srcBlueLinear) / baseBlueLinear)

      let alpha = Math.max(alphaFromRed, alphaFromGreen, alphaFromBlue)
      if (tolerance > 0) {
        alpha = Math.max(0, Math.min(1, (alpha - tolerance) / (1 - tolerance)))
      }

      let foreRedLinear = 0, foreGreenLinear = 0, foreBlueLinear = 0
      if (alpha > 1e-5) {
        foreRedLinear = (srcRedLinear - (1 - alpha) * baseRedLinear) / alpha
        foreGreenLinear = (srcGreenLinear - (1 - alpha) * baseGreenLinear) / alpha
        foreBlueLinear = (srcBlueLinear - (1 - alpha) * baseBlueLinear) / alpha
      }

      data[index] = linearToSrgb(foreRedLinear)
      data[index + 1] = linearToSrgb(foreGreenLinear)
      data[index + 2] = linearToSrgb(foreBlueLinear)
      data[index + 3] = Math.round(alpha * 255)
    }

    context.putImageData(imageData, 0, 0)
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = hexColor
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'

    return canvas.toDataURL('image/png')
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
  }
}