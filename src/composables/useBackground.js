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
    if (!img?.naturalWidth) return null

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

    const W = src.width
    const H = src.height
    if (!W || !H) return

    const ctx = src.getContext('2d', { willReadFrequently: true })
    const inset = Math.max(1, Math.round(Math.min(W, H) * 0.01))
    const step = Math.max(1, Math.floor(Math.min(W, H) / 80))
    const A_MIN = 8

    const q = (v) => v >> 4
    const keyOf = (r, g, b) => (q(r) << 8) | (q(g) << 4) | q(b)
    const sums = new Map()

    const sampleRow = (y) => {
      const row = ctx.getImageData(0, y, W, 1).data
      for (let x = 0; x < W; x += step) {
        const i = x * 4
        const a = row[i + 3]
        if (a <= A_MIN) continue
        const r = row[i]
        const g = row[i + 1]
        const b = row[i + 2]
        const k = keyOf(r, g, b)
        let s = sums.get(k)
        if (!s) {
          s = { count: 0, R: 0, G: 0, B: 0 }
          sums.set(k, s)
        }
        s.count++
        s.R += r
        s.G += g
        s.B += b
      }
    }

    const sampleCol = (x) => {
      const col = ctx.getImageData(x, 0, 1, H).data
      for (let y = 0; y < H; y += step) {
        const i = y * 4
        const a = col[i + 3]
        if (a <= A_MIN) continue
        const r = col[i]
        const g = col[i + 1]
        const b = col[i + 2]
        const k = keyOf(r, g, b)
        let s = sums.get(k)
        if (!s) {
          s = { count: 0, R: 0, G: 0, B: 0 }
          sums.set(k, s)
        }
        s.count++
        s.R += r
        s.G += g
        s.B += b
      }
    }

    sampleRow(inset)
    sampleRow(Math.max(inset, H - 1 - inset))
    sampleCol(inset)
    sampleCol(Math.max(inset, W - 1 - inset))

    if (sums.size === 0) return

    let bestKey = null
    let bestCount = -1
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

    // Use flood-fill to find background pixels connected to edges
    const bgMask = new Uint8Array(width * height)
    const TOLERANCE_SQ = 2500 // Color distance threshold squared (about 50 per channel)

    const distSqToBg = (r, g, b) => {
      const dr = r - bgRGB.r
      const dg = g - bgRGB.g
      const db = b - bgRGB.b
      return dr * dr + dg * dg + db * db
    }

    const isBgColor = (idx) => {
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      if (a < 10) return true // Already transparent
      return distSqToBg(r, g, b) <= TOLERANCE_SQ
    }

    // Flood fill from edges
    const queue = []

    // Add edge pixels to queue
    for (let x = 0; x < width; x++) {
      const topIdx = x * 4
      const bottomIdx = ((height - 1) * width + x) * 4
      if (isBgColor(topIdx) && !bgMask[x]) {
        bgMask[x] = 1
        queue.push(x)
      }
      const bottomPix = (height - 1) * width + x
      if (isBgColor(bottomIdx) && !bgMask[bottomPix]) {
        bgMask[bottomPix] = 1
        queue.push(bottomPix)
      }
    }
    for (let y = 0; y < height; y++) {
      const leftIdx = (y * width) * 4
      const rightIdx = (y * width + width - 1) * 4
      const leftPix = y * width
      const rightPix = y * width + width - 1
      if (isBgColor(leftIdx) && !bgMask[leftPix]) {
        bgMask[leftPix] = 1
        queue.push(leftPix)
      }
      if (isBgColor(rightIdx) && !bgMask[rightPix]) {
        bgMask[rightPix] = 1
        queue.push(rightPix)
      }
    }

    // BFS flood fill
    while (queue.length > 0) {
      const pix = queue.shift()
      const x = pix % width
      const y = Math.floor(pix / width)

      const neighbors = [
        { nx: x - 1, ny: y },
        { nx: x + 1, ny: y },
        { nx: x, ny: y - 1 },
        { nx: x, ny: y + 1 }
      ]

      for (const { nx, ny } of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const nPix = ny * width + nx
        if (bgMask[nPix]) continue
        const nIdx = nPix * 4
        if (isBgColor(nIdx)) {
          bgMask[nPix] = 1
          queue.push(nPix)
        }
      }
    }

    // Apply transparency only to background pixels (connected to edges)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pix = y * width + x
        const idx = pix * 4

        if (bgMask[pix]) {
          // This pixel is part of connected background - make transparent
          data[idx + 3] = 0
        }
        // Non-background pixels keep their original color and alpha
      }
    }

    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function recolorFlatBackground(canvas, bgRGB, newHexColor) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const { width, height } = canvas
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    const bg = bgRGB || { r: data[0], g: data[1], b: data[2] }
    const newBg = hexToRgb(newHexColor)
    if (!newBg) return canvas.toDataURL('image/png')

    const SEED_DIST_SQ = 140
    const HALO_DIST_SQ = 100000
    const NEAR_RADIUS = 2

    const seedMask = new Uint8Array(width * height)

    const distSqToBg = (r, g, b) => {
      const dr = r - bg.r
      const dg = g - bg.g
      const db = b - bg.b
      return dr * dr + dg * dg + db * db
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const a = data[idx + 3]
        if (a === 0) continue
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        if (distSqToBg(r, g, b) <= SEED_DIST_SQ) {
          seedMask[y * width + x] = 1
        }
      }
    }

    const mix = (c, target, t) => Math.round(c + (target - c) * t)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pix = y * width + x
        const idx = pix * 4

        const a = data[idx + 3]
        if (a === 0) continue

        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]

        const d2 = distSqToBg(r, g, b)

        if (d2 <= SEED_DIST_SQ) {
          data[idx] = newBg.r
          data[idx + 1] = newBg.g
          data[idx + 2] = newBg.b
          data[idx + 3] = 255
          continue
        }

        if (d2 > HALO_DIST_SQ) {
          continue
        }

        let nearSeed = false
        for (let dy = -NEAR_RADIUS; dy <= NEAR_RADIUS && !nearSeed; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -NEAR_RADIUS; dx <= NEAR_RADIUS; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            if (dx === 0 && dy === 0) continue
            if (seedMask[ny * width + nx]) {
              nearSeed = true
              break
            }
          }
        }

        if (!nearSeed) continue

        const t = (HALO_DIST_SQ - d2) / (HALO_DIST_SQ - SEED_DIST_SQ)
        const strength = 0.85
        data[idx] = mix(r, newBg.r, t * strength)
        data[idx + 1] = mix(g, newBg.g, t * strength)
        data[idx + 2] = mix(b, newBg.b, t * strength)
      }
    }

    ctx.putImageData(imageData, 0, 0)
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
        const maxScaleByPixels =
          Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
        const scale = Math.min(dpiScale, maxScaleByPixels)
        const vp = page.getViewport({ scale })

        const off = document.createElement('canvas')
        off.width = Math.round(vp.width)
        off.height = Math.round(vp.height)

        await page.render({
          canvasContext: off.getContext('2d', { willReadFrequently: true }),
          viewport: vp,
          background: 'rgba(0,0,0,0)',
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
      preview.value = URL.createObjectURL(
        new Blob([newBytes], { type: 'application/pdf' }),
      )
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

    const w = img.naturalWidth
    const h = img.naturalHeight
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    off
      .getContext('2d', { willReadFrequently: true })
      .drawImage(img, 0, 0, w, h)

    const dataUrl = deblendToTransparent(off, origBg.value)
    preview.value = dataUrl

    transparentBase.value = dataUrl

    emit('update:preview', dataUrl)
    emit('update:meta', {
      name: originalFileName.value,
      type: originalFileType.value,
      size: atob(dataUrl.split(',')[1]).length,
      width: w,
      height: h,
      lastModified: Date.now(),
    })

    emit('update:bgcolor', null)

    madeTransparentImg.value = true
    checkerOn.value = true
    setHasAlpha(true)
  }

  async function canvasFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || img.width
        c.height = img.naturalHeight || img.height
        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
        resolve(c)
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

    if (!src || !previewImg.value) return

    const srcHasAlpha = canvasHasAlpha(src) || hasAlpha.value || madeTransparentImg.value

    let dataUrl

    if (!srcHasAlpha) {
      const MAX_PREV_PX = 2e6
      const scale =
        Math.min(1, Math.sqrt(MAX_PREV_PX / (src.width * src.height)) || 1)
      const w = Math.max(1, Math.round(src.width * scale))
      const h = Math.max(1, Math.round(src.height * scale))

      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      off
        .getContext('2d', { willReadFrequently: true })
        .drawImage(src, 0, 0, w, h)

      dataUrl = recolorFlatBackground(off, origBg.value, hexColor)
      previewImg.value.style.backgroundColor = ''
    } else {
      const MAX_PREV_PX = 2e6
      const scale =
        Math.min(1, Math.sqrt(MAX_PREV_PX / (src.width * src.height)) || 1)
      const w = Math.max(1, Math.round(src.width * scale))
      const h = Math.max(1, Math.round(src.height * scale))

      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      off
        .getContext('2d', { willReadFrequently: true })
        .drawImage(src, 0, 0, w, h)

      dataUrl = off.toDataURL('image/png')
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
      let srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      try {
        srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      } catch (e) {
        console.error('Failed to load PDF in setBackgroundColor:', e)
        return
      }

      const pageCount = srcDoc.getPageCount()
      const pdfJsDoc = await getDocument({ data: bytes }).promise
      const outDoc = await PDFDocument.create()

      const activeIndex = Math.min(
        Math.max((currentPage.value || 1) - 1, 0),
        pageCount - 1,
      )

      const bgForDeblend = origBg.value || { r: 255, g: 255, b: 255 }
      const jsPage = await pdfJsDoc.getPage(activeIndex + 1)

      const vp1 = jsPage.getViewport({ scale: 1 })
      const dpiScale = Math.max(1, PDF_RASTER_OPS_DPI / 72)
      const maxScaleByPixels =
        Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
      const scale = Math.min(dpiScale, maxScaleByPixels)
      const vp = jsPage.getViewport({ scale })

      const off = document.createElement('canvas')
      off.width = Math.round(vp.width)
      off.height = Math.round(vp.height)

      await jsPage.render({
        canvasContext: off.getContext('2d', {
          willReadFrequently: true,
          alpha: true,
        }),
        viewport: vp,
        background: 'rgba(0,0,0,0)',
      }).promise

      const rasterHasAlpha = canvasHasAlpha(off)

      let pngImg
      if (!rasterHasAlpha) {
        const dataUrl = recolorFlatBackground(off, bgForDeblend, hexColor)
        const pngBytes = dataURLtoU8(dataUrl)
        pngImg = await outDoc.embedPng(pngBytes)
      } else {
        const matte = document.createElement('canvas')
        matte.width = off.width
        matte.height = off.height
        const mctx = matte.getContext('2d', { willReadFrequently: true })

        mctx.fillStyle = hexColor
        mctx.fillRect(0, 0, matte.width, matte.height)
        mctx.drawImage(off, 0, 0)

        const pngBytes = dataURLtoU8(matte.toDataURL('image/png'))
        pngImg = await outDoc.embedPng(pngBytes)
      }

      const pageIndices = srcDoc.getPageIndices()
      const copiedPages = await outDoc.copyPages(srcDoc, pageIndices)

      for (let i = 0; i < copiedPages.length; i++) {
        const page = copiedPages[i]

        if (i === activeIndex) {
          const { width: pw, height: ph } = page.getSize()
          page.drawImage(pngImg, {
            x: 0,
            y: 0,
            width: pw,
            height: ph,
          })
        }

        outDoc.addPage(page)
      }

      const newBytes = await outDoc.save()
      originalPdf.value = newBytes

      if (preview.value && preview.value.startsWith('blob:')) {
        URL.revokeObjectURL(preview.value)
      }

      preview.value = URL.createObjectURL(
        new Blob([newBytes], { type: 'application/pdf' }),
      )

      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      emit('update:bgcolor', hexColor)

      origBg.value = hexToRgb(hexColor)

      madeTransparentPdf.value = false
      checkerOn.value = false
      setHasAlpha(false)

      if (panCont.value) {
        panCont.value.style.backgroundColor = hexColor
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
      if (!img?.naturalWidth) return

      src = document.createElement('canvas')
      src.width = img.naturalWidth
      src.height = img.naturalHeight
      src.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    }

    const w = src.width
    const h = src.height

    const srcHasAlpha =
      canvasHasAlpha(src) || hasAlpha.value || madeTransparentImg.value

    if (srcHasAlpha && !transparentBase.value) {
      try {
        transparentBase.value = src.toDataURL('image/png')
      } catch (e) {
        console.error('setBackgroundColor: cannot snapshot base', e)
      }
    }

    let newSrc
    if (!srcHasAlpha) {
      newSrc = recolorFlatBackground(src, origBg.value, hexColor)
      setHasAlpha(false)
      madeTransparentImg.value = false
    } else {
      const matte = document.createElement('canvas')
      matte.width = w
      matte.height = h
      const mctx = matte.getContext('2d', { willReadFrequently: true })

      mctx.fillStyle = hexColor
      mctx.fillRect(0, 0, w, h)
      mctx.drawImage(src, 0, 0)

      newSrc = matte.toDataURL('image/png')
      setHasAlpha(true)
      madeTransparentImg.value = false
    }

    preview.value = newSrc
    emit('update:preview', newSrc)
    emit('update:bgcolor', hexColor)
    emit('update:meta', {
      name:
        (originalFileName.value || 'image').replace(/\.[^.]+$/, '') +
        '-matte.png',
      type: 'image/png',
      size: atob(newSrc.split(',')[1]).length,
      width: w,
      height: h,
      lastModified: Date.now(),
    })

    origBg.value = hexToRgb(hexColor)
    checkerOn.value = false
    if (panCont.value) panCont.value.style.backgroundColor = hexColor
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
