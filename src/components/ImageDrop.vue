<template>
  <div
    class="dropField"
    :style="{ paddingRight: rightGap,
              marginTop: topGap,
              height: `calc(100vh - ${topGap})`
            }"
    @dragover.prevent
    @dragenter.prevent
    @drop.prevent="handleDrop"
    @click="openFilePicker"
  >
    <p v-if="!preview">
      Click or drag and drop an image or PDF here
    </p>

    <div v-else class="preview-container" ref="previewWrap">
      <div
        ref="panCont"
        :class="['panzoom-container', { checkerboard: checkerOn }]"
      >
        <canvas
          v-if="isPdf"
          ref="pdfCanvas"
          class="preview-canvas" 
        ></canvas>

        <img
          v-else
          :key="preview"
          ref="imgEl"
          :src="preview"
          class="preview-img"
          alt="Preview"
          draggable="false"
          @load="initPanzoom"
        />

        <img
          ref="previewImg"
          class="preview-layer"
          v-show="previewType==='bgcolor' && previewOn"
          alt="Preview"
        />

        <canvas ref="markCanvas" class="mark-canvas"></canvas>

        <div
          v-if="overlayW && overlayH && overlayVisible"
          class="crop-overlay"
          :style="overlayStyle"
        >
          <div
            v-for="dir in dirs"
            :key="dir"
            class="handle"
            :class="dir"
            @mousedown.stop="startResize(dir, $event)"
          >
          </div>
        </div>
      </div>
    </div>

    <input
      type="file"
      ref="fileInput"
      accept="image/*,application/pdf"
      hidden
      @change="handleFileChange"
    />

    <div v-if="calOpen" class="calib-backdrop" @click.self="closeCalibration">
      <div class="calib-modal">
        <p>Enter the measured length in millimeters.</p>

        <div class="calib-line-wrap">
          <div ref="calLineEl" class="calib-line"></div>
        </div>

        <div class="calib-controls">
          <label>
            Measured length (mm):
            <input type="number" v-model.number="calMeasuredMm" min="10" max="1000" step="0.1">
          </label>
          <button class="primary" @click="applyCalibration">Apply</button>
          <button @click="closeCalibration">Cancel</button>
        </div>

        <p v-if="calError" class="calib-error">{{ calError }}</p>
      </div>
    </div>

  </div>
</template>

<script setup>
  import { ref, nextTick, computed, onMounted, onUnmounted, watch } from 'vue'
  import panzoom from 'panzoom'
  import * as pdfjsLib from 'pdfjs-dist'
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
  import { PDFDocument } from 'pdf-lib'

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
  const { getDocument } = pdfjsLib
  const preview = ref(null)
  const originalPdf  = ref(null)
  const originalFileName = ref('')
  const originalFileSize = ref(0)
  const originalLastModified = ref(0)
  const isPdf = ref(false)
  const imgEl = ref(null)
  const pdfCanvas = ref(null)
  const panCont = ref(null)
  const fileInput = ref(null)
  const markCanvas = ref(null)
  let pz = null

  const overlayX = ref(0)
  const overlayY = ref(0)
  const overlayW = ref(0)
  const overlayH = ref(0)
  const initialScale = ref(1)
  const dirs = ['nw','n','ne','e','se','s','sw','w']
  let resizing = false
  let resizeDir = null
  const resizeStart = {}
  const currentPage = ref(1)
  const totalPages = ref(1)
  const suppressGalleryOnce = ref(false)
  const highlightOn = ref(false)
  const overlayVisible = ref(true)

  const displayScale = ref(100)
  const referenceWidthMm = ref(210)
  const basePixelWidth = ref(0)
  const screenDPI = ref(96)
  const updatingScaleProgrammatically = ref(false)

  const maxW = computed(() => isPdf.value ? (pdfCanvas.value?.width  || 1) : (imgEl.value?.naturalWidth  || 1))
  const maxH = computed(() => isPdf.value ? (pdfCanvas.value?.height || 1) : (imgEl.value?.naturalHeight || 1))
  const origBg = ref({ r: 255, g: 255, b: 255 })
  const emit = defineEmits(['update:preview','update:meta','update:overlay', 'update:bgcolor', 'update:scale', 'update:has-alpha'])

  const PDF_PREVIEW_DPI = 600;
  const PDF_RASTER_OPS_DPI = 600;
  const MAX_CANVAS_PIXELS = 25e6;
  const pdfRenderScale = ref(1);
  const previewWrap = ref(null)

  const madeTransparentImg = ref(false)
  const madeTransparentPdf = ref(false)
  const checkerOn = ref(false)
  const hasAlpha = ref(false)

  const previewImg = ref(null)
  const previewOn = ref(false)
  const previewType = ref(null)
  let matteKey = null
  let matteDataURL = null

  const originalFileType = ref('')
  const history = []
  const origSnapshot = ref(null)
  const MAX_HISTORY = 30
  const PZ_MIN_ZOOM = 0.2
  const PZ_MAX_ZOOM = 20

  const minScalePct = ref(0)
  const maxScalePct = ref(0)

  const absMinScale = ref(null)
  const absMaxScale = ref(null) 

  function recomputeScaleBounds () {
    const { minPct, maxPct } = getDisplayScaleBounds()
    minScalePct.value = minPct
    maxScalePct.value = maxPct
  }

  const props = defineProps({
    rightGap: { type: String, default: 'min(30vw, 300px)' },
    topGap: { type: String, default: '0px' }
  })

  let ro = null

  onUnmounted(() => {
    ro?.disconnect(); ro = null
    detachCalibrationListeners()
  })

  watch(() => props.rightGap, async () => {
    await nextTick()
    adjustForContainerResize()
  })

  watch(() => props.topGap, async () => {
    await nextTick()
    adjustForContainerResize()
  })


  function makeSnapshot() {
    if (isPdf.value) {
      return {
        kind: 'pdf',
        bytes: pdfBytes(),
        name: originalFileName.value,
        type: 'application/pdf',
        size: originalFileSize.value,
        lastModified: originalLastModified.value,
        page: currentPage.value,
      }

    } else {
      return {
        kind: 'image',
        dataUrl: preview.value,
        name: originalFileName.value,
        type: originalFileType.value || 'image/png',
        size: preview.value ? atob((preview.value.split(',')[1]||'')).length : 0,
        lastModified: originalLastModified.value || Date.now(),
      }

    }
  }

  function restoreSnapshot(snap) {
    if (!snap) {
      return
    }

    if (snap.kind === 'pdf') {
      originalPdf.value = snap.bytes
      originalFileName.value = snap.name
      originalFileSize.value = snap.size
      originalLastModified.value = snap.lastModified
      isPdf.value = true

      preview.value = URL.createObjectURL(new Blob([snap.bytes], { type: 'application/pdf' }))
      emit('update:preview', preview.value)
      renderPdfPage(snap.page || 1)
    } else {
      isPdf.value = false
      originalFileName.value = snap.name
      originalFileType.value = snap.type
      originalFileSize.value = snap.size
      originalLastModified.value = snap.lastModified

      preview.value = snap.dataUrl
      emit('update:preview', preview.value)

      const img = new Image()
      img.onload = () => {
        emit('update:meta', {
          name: snap.name,
          type: snap.type,
          size: snap.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
          lastModified: snap.lastModified,
        })
        setupOverlay(img.naturalWidth, img.naturalHeight)
        madeTransparentImg.value = false
        const alphaNow = hasAlphaImage(img)
        setHasAlpha(alphaNow)
        if (!alphaNow) {
          detectBackground()
        } else {
          emit('update:bgcolor', null)
        }
        initPanzoom()
      }
      img.src = snap.dataUrl
    }
  }

  function pushHistory() {
    if (!preview.value && !isPdf.value) {
      return
    }

    const snap = makeSnapshot()
    history.push(snap)

    if (history.length > MAX_HISTORY) {
      history.shift()
    }
  }

  function pdfBytes () {
    return originalPdf.value instanceof Uint8Array ? originalPdf.value.slice() : new Uint8Array(originalPdf.value)
  }

  function makeDocSig() {
    return `${originalFileName.value}|${originalFileSize.value}|${originalLastModified.value}`
  }

  function openFilePicker() {
    if (!preview.value) {
      fileInput.value.click()
    }
  }

  function shouldReplace() {
    if (!preview.value) {
      return true
    }

    return window.confirm('Replace the current file? Unsaved edits will be lost.')
  }

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return

    if (!shouldReplace()) { 
      e.target.value = ''
      return
    }

    if (f.type === 'application/pdf') {
      isPdf.value = true
      loadPdf(f)
    } else {
      isPdf.value = false
      loadImage(f)
    }
  }

  function handleDrop(e) {
    const f = [...e.dataTransfer.files].find(
      f => f.type.startsWith('image/') || f.type === 'application/pdf'
    )

    if (!f) {
      return
    }


    if (!shouldReplace()) {
      return
    }

    if (f.type === 'application/pdf') {
      isPdf.value = true
      loadPdf(f)

    } else {
      isPdf.value = false
      loadImage(f)
    }
  }

  async function loadExternalFile(file) {
    if (!file) {
      return
    }

    if (file.type === 'application/pdf') {
      isPdf.value = true
      await loadPdf(file)

    } else {
      isPdf.value = false
      loadImage(file)
    }
  }

  function loadImage(file) {
    originalFileName.value = file.name
    originalFileType.value = file.type
    originalFileSize.value = file.size
    originalLastModified.value = file.lastModified || Date.now()
    const reader = new FileReader()

    reader.onload = ev => {
      preview.value = ev.target.result
      emit('update:preview', preview.value)
      const img = new Image()
      img.src = preview.value

      img.onload = () => {
        emit('update:meta', {
          name: file.name, type: file.type, size: file.size,
          width: img.naturalWidth, height: img.naturalHeight,
          lastModified: file.lastModified
        })
        setupOverlay(img.naturalWidth, img.naturalHeight)

        madeTransparentImg.value = false
        const alphaNow = hasAlphaImage(img)
        checkerOn.value = alphaNow
        setHasAlpha(alphaNow)

        if (!alphaNow) {
          detectBackground()
        } else {
          emit('update:bgcolor', null)
        }

        origSnapshot.value = makeSnapshot()
        history.length = 0
      }
    }
    reader.readAsDataURL(file)
  }

  function hasAlphaImage(imageEl) {
    const w = imageEl.naturalWidth, h = imageEl.naturalHeight
    if (!w || !h) return false
    
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(imageEl, 0, 0)
    const step = Math.max(1, Math.floor(Math.min(w, h) / 200))

    for (let y = 0; y < h; y += step) {
      const row = ctx.getImageData(0, y, w, 1).data
      for (let x = 0; x < w; x += step) {
        const a = row[x * 4 + 3]
        if (a < 255) return true
      }
    }
    return false
  }

  async function loadPdf (file) {
    currentPage.value = 1
    totalPages.value  = 1
    suppressGalleryOnce.value = false

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    originalFileName.value = file.name
    originalFileSize.value = file.size
    originalLastModified.value = file.lastModified || Date.now()

    originalPdf.value = bytes
    preview.value = URL.createObjectURL(new Blob([bytes], { type: file.type }))
    emit('update:preview', preview.value)

    await nextTick()
    await renderPdfPage(1)
    origSnapshot.value = makeSnapshot()
    history.length = 0
  }

  function getDisplayScaleBounds () {
    const natW = basePixelWidth.value || 1
    const referenceWidthCssPx = (referenceWidthMm.value / 25.4) * screenDPI.value
    const minAbs = (absMinScale.value ?? ((initialScale.value || 1) * PZ_MIN_ZOOM))
    const maxAbs = (absMaxScale.value ?? ((initialScale.value || 1) * PZ_MAX_ZOOM))
    const minPct = (natW * minAbs / referenceWidthCssPx) * 100
    const maxPct = (natW * maxAbs / referenceWidthCssPx) * 100
    return { minPct, maxPct }
  }

  async function renderPdfPage(pageNo = currentPage.value || 1, dpi = PDF_PREVIEW_DPI) {
    await nextTick()

    const pdf = await getDocument({ data: pdfBytes() }).promise
    totalPages.value  = pdf.numPages
    currentPage.value = Math.min(Math.max(1, pageNo), totalPages.value)

    const page = await pdf.getPage(currentPage.value)
    const vp1 = page.getViewport({ scale: 1 })
    const dpiScale = Math.max(1, dpi / 72)
    const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
    const targetScale = Math.min(dpiScale, maxScaleByPixels)

    const viewport = page.getViewport({ scale: targetScale })
    pdfRenderScale.value = targetScale

    const canvas = pdfCanvas.value
    canvas.width  = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    await page.render({
      canvasContext: canvas.getContext('2d', { alpha: true }),
      viewport,
      background: 'rgba(0,0,0,0)'
    }).promise

    setupOverlay(viewport.width, viewport.height)

    emit('update:meta', {
      name:  originalFileName.value,
      type:  'application/pdf',
      size:  originalFileSize.value,
      width: viewport.width,
      height: viewport.height,
      pages: totalPages.value,
      page:  currentPage.value,
      lastModified: originalLastModified.value,
      docSig: makeDocSig(),
      noGallery: suppressGalleryOnce.value
    })

    suppressGalleryOnce.value = false
    const alphaNow = madeTransparentPdf.value || canvasHasAlpha(canvas)
    setHasAlpha(alphaNow)
    checkerOn.value = !!alphaNow

    if (!alphaNow) {
      detectBackground()
    } else {
      emit('update:bgcolor', null)
    }

    await initPanzoom()
    recomputeScaleBounds()
    updateDisplayScale()
  }

  async function setPdfPage(n) {
    await renderPdfPage(n)
  }

  function setupOverlay(w, h) {
    overlayX.value = 0
    overlayY.value = 0
    overlayW.value = w
    overlayH.value = h
    emit('update:overlay', { width: w, height: h, x: 0, y: 0 })
  }

  async function initPanzoom() {
    await nextTick()
    const elem = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!elem) {
      return
    }

    const natW = isPdf.value ? elem.width : elem.naturalWidth
    const natH = isPdf.value ? elem.height : elem.naturalHeight

    const wrap = previewWrap.value
    const scaleW = Math.floor(wrap.clientWidth) / natW
    const scaleH = Math.floor(wrap.clientHeight) / natH
    initialScale.value = Math.min(scaleW, scaleH)

    if (pz) {
      pz.dispose(); pz = null
    }

    panCont.value.style.transform = 'translate(0px, 0px) scale(1)'

    panCont.value.style.width = `${natW * initialScale.value}px`
    panCont.value.style.height = `${natH * initialScale.value}px`

    absMinScale.value = initialScale.value * PZ_MIN_ZOOM
    absMaxScale.value = initialScale.value * PZ_MAX_ZOOM
    pz = panzoom(panCont.value, {
      minZoom: absMinScale.value / initialScale.value,
      maxZoom: absMaxScale.value / initialScale.value,
      bounds: false,
      boundsPadding: 0.1
    })

    pz.on('zoom', updateDisplayScale)
    pz.on('pan', updateDisplayScale)

    markCanvas.value.width = natW
    markCanvas.value.height = natH
    const mctx = markCanvas.value.getContext('2d')
    mctx.clearRect(0, 0, natW, natH)
    highlightOn.value = false

    basePixelWidth.value = natW
    recomputeScaleBounds()
    updateDisplayScale()
    endPreviewBackgroundColor()
  }

  function updateDisplayScale() {
    if (!pz || !basePixelWidth.value) return

    const currentTransform = pz.getTransform()
    const absoluteScale = initialScale.value * currentTransform.scale
    const currentWidthCssPx = basePixelWidth.value * absoluteScale
    const referenceWidthCssPx = (referenceWidthMm.value / 25.4) * screenDPI.value

    const pct = (currentWidthCssPx / referenceWidthCssPx) * 100
    displayScale.value = pct

    emit('update:scale', {
      displayScale: displayScale.value,
      referenceWidthMm: referenceWidthMm.value,
      basePixelWidth: basePixelWidth.value,
      minDisplayScale: minScalePct.value,
      maxDisplayScale: maxScalePct.value,
    })
  }

  function setDisplayScale(newScale) {
    if (!pz || !basePixelWidth.value) return

    const targetPct = Math.max(minScalePct.value, Math.min(maxScalePct.value, Number(newScale) || 0))

    const referenceWidthPx = (referenceWidthMm.value / 25.4) * screenDPI.value
    const targetScreenWidthPx = (targetPct / 100) * referenceWidthPx

    const targetAbsoluteScale = targetScreenWidthPx / basePixelWidth.value
    let targetUserScale = targetAbsoluteScale / (initialScale.value || 1)

    targetUserScale = Math.max(PZ_MIN_ZOOM, Math.min(PZ_MAX_ZOOM, targetUserScale))

    const wrap = previewWrap.value
    const wrapRect = wrap.getBoundingClientRect()
    const cx = wrapRect.left + wrapRect.width / 2
    const cy = wrapRect.top  + wrapRect.height / 2

    pz.zoomAbs(cx, cy, targetUserScale)

    nextTick(() => updateDisplayScale())
  }

  function setReferenceWidth(newWidthMm) {
    referenceWidthMm.value = newWidthMm
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function adjustForContainerResize () {
    const elem = isPdf.value ? pdfCanvas.value : imgEl.value
    const wrap = previewWrap.value
    if (!elem || !wrap || !panCont.value) {
      return
    }

    const natW = isPdf.value ? elem.width : elem.naturalWidth
    const natH = isPdf.value ? elem.height : elem.naturalHeight

    const oldInit = initialScale.value || 1
    const oldT = pz ? pz.getTransform() : { x: 0, y: 0, scale: 1 }

    const newInit = Math.min(wrap.clientWidth / natW, wrap.clientHeight / natH) || 1

    if (Math.abs(newInit - oldInit) < 0.0001) {
      return
    }

    const oldCx = wrap.clientWidth  / 2
    const oldCy = wrap.clientHeight / 2

    const oldAbsoluteScale = oldInit * oldT.scale
    const contentX = (oldCx - oldT.x) / oldAbsoluteScale
    const contentY = (oldCy - oldT.y) / oldAbsoluteScale

    initialScale.value = newInit

    if (pz) {
      pz.dispose(); pz = null
    }

    panCont.value.style.transform = 'translate(0px, 0px) scale(1)'
    panCont.value.style.width  = `${natW * newInit}px`
    panCont.value.style.height = `${natH * newInit}px`

    absMinScale.value = newInit * PZ_MIN_ZOOM
    absMaxScale.value = newInit * PZ_MAX_ZOOM

    pz = panzoom(panCont.value, {
      minZoom: PZ_MIN_ZOOM,
      maxZoom: PZ_MAX_ZOOM,
      bounds: false,
      boundsPadding: 0.1,
    })

    pz.on('zoom', updateDisplayScale)
    pz.on('pan', updateDisplayScale)

    const newUserScale = oldAbsoluteScale / newInit
    const newCx = wrap.clientWidth  / 2
    const newCy = wrap.clientHeight / 2
    const tx = newCx - contentX * newInit * newUserScale
    const ty = newCy - contentY * newInit * newUserScale

    pz.zoomAbs(0, 0, newUserScale)
    pz.moveTo(tx, ty)
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function startResize(dir) {
    resizing = true
    resizeDir = dir
    resizeStart.rect = panCont.value.getBoundingClientRect()

    if (pz) {
      pz.pause()
    }

    const currentZoom = pz ? pz.getTransform().scale : 1
    resizeStart.scale = initialScale.value * currentZoom

    resizeStart.origX = overlayX.value
    resizeStart.origY = overlayY.value
    resizeStart.origW = overlayW.value
    resizeStart.origH = overlayH.value

    window.addEventListener('mousemove', onResize)
    window.addEventListener('mouseup',   stopResize)
  }

  function onResize(e) {
    if (!resizing) {
      return
    }

    const { left, top } = resizeStart.rect
    const scale = resizeStart.scale

    const natX = (e.clientX - left) / scale
    const natY = (e.clientY - top ) / scale

    const MAXW = (pdfCanvas.value?.width  || imgEl.value?.naturalWidth  || 1)
    const MAXH = (pdfCanvas.value?.height || imgEl.value?.naturalHeight || 1)
    const MINW = 10, MINH = 10

    let NX = resizeStart.origX
    let NY = resizeStart.origY
    let NW = resizeStart.origW
    let NH = resizeStart.origH

    if (resizeDir.includes('e')) {
      NW = Math.max(MINW, Math.min(natX - resizeStart.origX, MAXW - resizeStart.origX))
    }

    if (resizeDir.includes('s')) {
      NH = Math.max(MINH, Math.min(natY - resizeStart.origY, MAXH - resizeStart.origY))
    }

    if (resizeDir.includes('w')) {
      NX = Math.max(0, Math.min(natX, resizeStart.origX + resizeStart.origW - MINW))
      NW = (resizeStart.origX + resizeStart.origW) - NX
    }

    if (resizeDir.includes('n')) {
      NY = Math.max(0, Math.min(natY, resizeStart.origY + resizeStart.origH - MINH))
      NH = (resizeStart.origY + resizeStart.origH) - NY
    }

    NX = Math.max(0, Math.min(NX, MAXW - MINW))
    NY = Math.max(0, Math.min(NY, MAXH - MINH))
    NW = Math.max(MINW, Math.min(NW, MAXW - NX))
    NH = Math.max(MINH, Math.min(NH, MAXH - NY))

    overlayX.value = Math.round(NX)
    overlayY.value = Math.round(NY)
    overlayW.value = Math.round(NW)
    overlayH.value = Math.round(NH)

    emit('update:overlay', { width: overlayW.value, height: overlayH.value, x: overlayX.value, y: overlayY.value })
  }

  function stopResize() {
    resizing = false
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)
    if (pz) pz.resume()
  }

  function showOverlay(w, h, x = overlayX.value, y = overlayY.value) {
    const MW = maxW.value || 0
    const MH = maxH.value || 0

    const cw = Math.max(1, Math.min(w  ?? MW, MW || w  || 1))
    const ch = Math.max(1, Math.min(h  ?? MH, MH || h  || 1))
    const cx = MW ? Math.max(0, Math.min(x, MW - cw)) : (x ?? 0)
    const cy = MH ? Math.max(0, Math.min(y, MH - ch)) : (y ?? 0)

    overlayW.value = Math.round(cw)
    overlayH.value = Math.round(ch)
    overlayX.value = Math.round(cx)
    overlayY.value = Math.round(cy)

    emit('update:overlay', {
      width: overlayW.value,
      height: overlayH.value,
      x: overlayX.value,
      y: overlayY.value,
    })
  }

  function hideOverlay() {
    overlayW.value = 0
    overlayH.value = 0
    emit('update:overlay', { width:0, height:0, x:0, y:0 })
  }

  function overlayBoxPdfCoords() {
    const Hpx = pdfCanvas.value.height
    const s = pdfRenderScale.value || 1

    return {
      x: overlayX.value / s,
      y: (Hpx - overlayY.value - overlayH.value) / s,
      width:  overlayW.value / s,
      height: overlayH.value / s,
    }
  }

  function getSourceCanvas () {
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

  function detectBackground () {
    let src

    if (isPdf.value && pdfCanvas.value) {
      src = pdfCanvas.value
    }else if (imgEl.value?.naturalWidth) {
      const img = imgEl.value
      const off = document.createElement('canvas')
      off.width = img.naturalWidth
      off.height = img.naturalHeight
      off.getContext('2d').drawImage(img, 0, 0)
      src = off
    }else {
      return
    }

    const W = src.width, H = src.height
    if (!W || !H) return

    const ctx = src.getContext('2d', { willReadFrequently: true })
    const inset = Math.max(1, Math.round(Math.min(W, H) * 0.01))
    const step = Math.max(1, Math.floor(Math.min(W, H) / 80))
    const A_MIN = 8

    const q = v => (v >> 4)
    const keyOf = (r,g,b) => (q(r) << 8) | (q(g) << 4) | q(b)
    const sums = new Map()

    const sampleRow = (y) => {
      const row = ctx.getImageData(0, y, W, 1).data

      for (let x = 0; x < W; x += step) {
        const i = x * 4
        const a = row[i+3]; if (a <= A_MIN) continue
        const r = row[i], g = row[i+1], b = row[i+2]
        const k = keyOf(r,g,b)
        let s = sums.get(k)
        if (!s) { s = { count:0, R:0, G:0, B:0 }; sums.set(k, s) }
        s.count++; s.R += r; s.G += g; s.B += b
      }
    }

    const sampleCol = (x) => {
      const col = ctx.getImageData(x, 0, 1, H).data

      for (let y = 0; y < H; y += step) {
        const i = y * 4
        const a = col[i+3]; if (a <= A_MIN) continue
        const r = col[i], g = col[i+1], b = col[i+2]
        const k = keyOf(r,g,b)
        let s = sums.get(k)
        if (!s) { s = { count:0, R:0, G:0, B:0 }; sums.set(k, s) }
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

  function clearAllPreviews () {
    const node = isPdf.value ? pdfCanvas.value : imgEl.value

    if (node) {
      node.style.filter = ''
    }
    if (previewImg.value) {
      previewImg.value.src = ''
    }
    previewOn.value = false
    previewType.value = null
  }

  function undo() {
    const snap = history.pop()
    if (!snap) {
      return
    }

    restoreSnapshot(snap)
  }

  function resetToOriginal() {
    if (!origSnapshot.value) {
      return
    }

    history.length = 0
    restoreSnapshot(origSnapshot.value)
  }

  function clear() {
    clearAllPreviews()
    preview.value = null
    isPdf.value = false
    overlayX.value = 0
    overlayY.value = 0
    overlayW.value = 0
    overlayH.value = 0
    currentPage.value = 1
    totalPages.value = 1
    suppressGalleryOnce.value = false

    if (pz) {
      pz.dispose()
      pz = null
    }

    panCont.value && Object.assign(panCont.value.style, { width:'', height:'', transform:'' })
    initialScale.value = 1
    fileInput.value && (fileInput.value.value = '')

    emit('update:preview', null)
    emit('update:meta', null)
    emit('update:overlay', { width:0, height:0, x:0, y:0 })
  }

  function highlightJpegArtifacts(color = '#00E5FF', opts = {}) {
    if (highlightOn.value) {
      clearHighlights(); return
    }

    const { diffThresh = 12, lowEdge = 40, highEdge = 150, dilate = 1} = opts

    const src = getSourceCanvas(), mc = markCanvas.value
    if (!src || !mc) {
      return
    }

    const W = src.width, H = src.height
    if (mc.width !== W || mc.height !== H) {
      mc.width = W; mc.height = H
    }

    const sctx = src.getContext('2d', { willReadFrequently: true })
    const srcIm = sctx.getImageData(0,0,W,H)
    const S = srcIm.data
    const B = bilateralOnceRGB(S, W, H, 2, 2, 25)

    const Y = new Float32Array(W*H)
    for (let i=0,j=0;i<S.length;i+=4,j++) Y[j] = 0.299*S[i] + 0.587*S[i+1] + 0.114*S[i+2]
    const G = sobelMag(Y, W, H)

    const near = new Uint8Array(W*H)
    const core = new Uint8Array(W*H)
    for (let i=0;i<near.length;i++) {
      if (G[i] > lowEdge) {
        near[i]=1
      } 
      if (G[i] > highEdge) {
        core[i]=1 
      }
    }

    let nearDil = near
    for (let k=0;k<dilate;k++) {
      nearDil = dilate1px(nearDil, W, H)
    }

    const mask = new Uint8Array(W*H)
    for (let i=0,j=0;i<S.length;i+=4,j++){
      const d = (Math.abs(S[i]-B[i]) + Math.abs(S[i+1]-B[i+1]) + Math.abs(S[i+2]-B[i+2])) / 3
      if (d > diffThresh && nearDil[j] && !core[j]) {
        mask[j] = 1
      }
    }

    const cr = parseInt(color.slice(1,3),16)
    const cg = parseInt(color.slice(3,5),16)
    const cb = parseInt(color.slice(5,7),16)
    const A = 255

    const octx = mc.getContext('2d')
    const oIm = octx.createImageData(W,H)
    const O = oIm.data

    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const id = y*W + x
        if (!mask[id]) {
          continue
        }

        const k = id*4
        O[k]=cr; O[k+1]=cg; O[k+2]=cb; O[k+3]=A
      }
    }
    octx.putImageData(oIm,0,0)
    highlightOn.value = true
  }

  function fixJpegArtifacts() {
    pushHistory()
    const img = imgEl.value;
    if (!img?.naturalWidth) {
      return;
    }

    const W = img.naturalWidth, H = img.naturalHeight;

    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const ctxOff = off.getContext('2d', { willReadFrequently: true });
    ctxOff.drawImage(img, 0, 0, W, H);

    const src0 = ctxOff.getImageData(0, 0, W, H);
    const s0 = src0.data;
    const dst0 = ctxOff.createImageData(W, H);
    const d0 = dst0.data;

    const r = 2;
    const twoσs2 = 2*2*2, twoσr2 = 2*25*25;

    const sp = new Array(2*r+1).fill(0).map((_,i)=>{
      const x = i-r; return Math.exp(- (x*x)/twoσs2 );
    });

    for (let y=r; y<H-r; y++) {
      for (let x=r; x<W-r; x++) {
        const i0 = (y*W + x)*4;
        const r0 = s0[i0], g0 = s0[i0+1], b0 = s0[i0+2];
        let wsum=0, sr=0, sg=0, sb=0;

        for (let dy=-r; dy<=r; dy++){
          const wy = sp[dy+r];
          for (let dx=-r; dx<=r; dx++){
            const wx = sp[dx+r];
            const wS = wy*wx;
            const ii = ((y+dy)*W + (x+dx))*4;
            const dr = s0[ii]   - r0;
            const dg = s0[ii+1] - g0;
            const db = s0[ii+2] - b0;
            const wR = Math.exp(-(dr*dr+dg*dg+db*db)/twoσr2);
            const w  = wS * wR;

            wsum += w;
            sr += s0[ii] * w;
            sg += s0[ii+1] * w;
            sb += s0[ii+2] * w;
          }
        }

        d0[i0] = sr/wsum;
        d0[i0+1] = sg/wsum;
        d0[i0+2] = sb/wsum;
        d0[i0+3] = s0[i0+3];
      }
    }

    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        if (y<r||y>=H-r||x<r||x>=W-r){
          const i = (y*W + x)*4;
          d0[i]=s0[i]; d0[i+1]=s0[i+1]; d0[i+2]=s0[i+2]; d0[i+3]=s0[i+3];
        }
      }
    }
    ctxOff.putImageData(dst0, 0, 0);

    const ctx = off.getContext('2d');
    const blurred = ctx.getImageData(0, 0, W, H);
    const gauss = gaussianBlur(blurred, W, H, 5, 1.0);
    const G = gauss.data;

    const finalImg = ctx.createImageData(W, H);
    const F = finalImg.data;
    const M = dst0.data;    
    const amount = 1.2;

    for (let i=0; i<M.length; i+=4){
      for (let c=0;c<3;c++){
        const detail = M[i+c] - G[i+c];
        F[i+c] = Math.min(255, Math.max(0, M[i+c] + amount*detail));
      }
      F[i+3] = M[i+3];
    }

    ctx.putImageData(finalImg, 0, 0);

    const newSrc = off.toDataURL('image/png');
    preview.value = newSrc;
    emit('update:preview', newSrc);
  }

  function clearHighlights () {
    const mc = markCanvas.value; if (!mc) return
    mc.getContext('2d').clearRect(0, 0, mc.width, mc.height)
    highlightOn.value = false
  }

  function bilateralOnceRGB(S, W, H, r = 2, sigmaS = 2, sigmaR = 25) {
    const twoσs2 = 2 * sigmaS * sigmaS
    const twoσr2 = 2 * sigmaR * sigmaR
    const sp = new Float32Array(2*r+1)
    for (let i=0;i<sp.length;i++) { const x = i-r; sp[i] = Math.exp(-(x*x)/twoσs2) }

    const out = new Uint8ClampedArray(W*H*4)
    for (let y=r; y < H-r; y++) {
      for (let x=r; x < W-r; x++) {
        const i0 = (y*W + x)*4
        const r0 = S[i0], g0 = S[i0+1], b0 = S[i0+2]
        let wsum=0, sr=0, sg=0, sb=0

        for (let dy=-r; dy<=r; dy++){
          const wy = sp[dy+r]
          for (let dx=-r; dx<=r; dx++){
            const wx = sp[dx+r]
            const ii = ((y+dy)*W + (x+dx))*4
            const dr = S[ii]   - r0
            const dg = S[ii+1] - g0
            const db = S[ii+2] - b0
            const w  = wy*wx * Math.exp(-(dr*dr+dg*dg+db*db)/twoσr2)
            wsum += w; sr += S[ii]*w; sg += S[ii+1]*w; sb += S[ii+2]*w
          }
        }

        out[i0] = sr/wsum
        out[i0+1] = sg/wsum
        out[i0+2] = sb/wsum
        out[i0+3] = S[i0+3]
      }
    }

    for (let y = 0; y < H; y++){
      for (let x = 0 ; x < W ; x++){
        if (y>=r && y<H-r && x>=r && x<W-r) {
          continue
        }

        const i = (y*W + x)*4
        out[i]=S[i]; out[i+1]=S[i+1]; out[i+2]=S[i+2]; out[i+3]=S[i+3]
      }
    }
    return out
  }

  function sobelMag(Y, W, H){
    const M = new Float32Array(W*H)
    
    for (let y = 1 ; y < H-1 ; y++){
      for (let x = 1; x < W-1; x++){
        const i = y*W+x
        const ym = W*(y-1), y0=W*y, yp=W*(y+1)
        const gx = -Y[ym+x-1]-2*Y[y0+x-1]-Y[yp+x-1] + Y[ym+x+1]+2*Y[y0+x+1]+Y[yp+x+1]
        const gy = Y[ym+x-1]+2*Y[ym+x]+Y[ym+x+1] - Y[yp+x-1]-2*Y[yp+x]-Y[yp+x+1]
        M[i] = Math.abs(gx)+Math.abs(gy)
      }
    }
    return M
  }

  function dilate1px(mask, W, H){
    const out = new Uint8Array(W*H)

    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        let on = 0

        for (let dy=-1;dy<=1;dy++){
          const yy = Math.min(H-1, Math.max(0, y+dy))

          for (let dx=-1;dx<=1;dx++){
            const xx = Math.min(W-1, Math.max(0, x+dx))
            if (mask[yy*W+xx]) { 
              on=1;
              break 
            }
          }
          if (on) {
            break
          }
        }
        out[y*W+x]=on
      }
    }
    return out
  }

  function gaussianBlur(imageData, W, H, kSize, sigma){
    const data = imageData.data;
    const half = Math.floor(kSize/2);
    const ga = new Array(kSize).fill(0).map((_,i)=>{
      const x = i-half; return Math.exp(- (x*x)/(2*sigma*sigma));
    });

    const s = ga.reduce((a,b)=>a+b,0);
    for (let i=0;i<ga.length;i++) ga[i]/=s;

    const tmp = new Uint8ClampedArray(data.length);
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        for (let c=0; c<4; c++){
          let acc=0;
          for (let k=-half;k<=half;k++){
            const xx = Math.min(W-1, Math.max(0, x+k));
            acc += data[(y*W+xx)*4 + c] * ga[k+half];
          }
          tmp[(y*W+x)*4 + c] = acc;
        }
      }
    }

    const out = new Uint8ClampedArray(data.length);

    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        for (let c=0; c<4; c++){
          let acc=0;
          for (let k=-half;k<=half;k++){
            const yy = Math.min(H-1, Math.max(0, y+k));
            acc += tmp[(yy*W+x)*4 + c] * ga[k+half];
          }
          out[(y*W+x)*4 + c] = acc;
        }
      }
    }
    return new ImageData(out, W, H);
  }

  function previewCropToContent () {
    const sourceCanvas = getSourceCanvas()
    if (!sourceCanvas) return

    const W = sourceCanvas.width
    const H = sourceCanvas.height

    let roiX = 0, roiY = 0, roiW = W, roiH = H
    if (overlayW.value > 0 && overlayH.value > 0) {
      const sx = Math.max(0, Math.floor(overlayX.value))
      const sy = Math.max(0, Math.floor(overlayY.value))
      const ex = Math.min(W, Math.floor(overlayX.value + overlayW.value))
      const ey = Math.min(H, Math.floor(overlayY.value + overlayH.value))

      roiX = Math.min(sx, W - 1)
      roiY = Math.min(sy, H - 1)
      roiW = Math.max(1, ex - sx)
      roiH = Math.max(1, ey - sy)
    }

    const roi = document.createElement('canvas')
    roi.width = roiW; roi.height = roiH
    roi.getContext('2d', { willReadFrequently: true })
      .drawImage(sourceCanvas, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH)

    const width = roiW, height = roiH
    const context = roi.getContext('2d', { willReadFrequently: true })
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const indexOf = (x, y) => (y * width + x) * 4
    const squaredDistance = (r1, g1, b1, r2, g2, b2) => {
      const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
      return dr * dr + dg * dg + db * db
    }
    const averagePatch = (cx, cy, r = 1) => {
      let R=0,G=0,B=0,c=0, lowAlpha=0
      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          const x = Math.min(width-1, Math.max(0, cx+dx))
          const y = Math.min(height-1, Math.max(0, cy+dy))
          const i = indexOf(x,y)
          R+=data[i]; G+=data[i+1]; B+=data[i+2]; c++
          if (data[i+3] <= 12) lowAlpha++
        }
      }
      return { rgb:[R/c, G/c, B/c], lowAlphaRatio: lowAlpha/Math.max(1,c) }
    }

    const p1 = averagePatch(0, 0)
    const p2 = averagePatch(width-1, 0)
    const p3 = averagePatch(0, height-1)
    const p4 = averagePatch(width-1, height-1)

    const avgAlpha = (p1.lowAlphaRatio + p2.lowAlphaRatio + p3.lowAlphaRatio + p4.lowAlphaRatio) / 4
    const alphaOnly = avgAlpha > 0.5

    let bg;
    if (!alphaOnly) {
      const cs = [p1.rgb, p2.rgb, p3.rgb, p4.rgb];
      const groups = cs.map(c => ({ c, n: 1 }));
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          if (squaredDistance(...cs[i], ...cs[j]) < 25) groups[i].n++;
        }
      }
      groups.sort((a, b) => b.n - a.n);
      const top = groups[0].c;
      bg = { r: Math.round(top[0]), g: Math.round(top[1]), b: Math.round(top[2]) };

    } else {
      bg = origBg.value;
      console.log('Using alpha-based detection, bg:', bg, 'avgAlpha:', avgAlpha);
    }

    const tolSq = 400
    const alphaMin = 12

    const visited = new Uint8Array(width * height)
    const q = []

    const tryPush = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const id = y * width + x;
      if (visited[id]) return;
      const i = indexOf(x, y);
      const a = data[i + 3];
      const isBg = alphaOnly
        ? (a <= alphaMin)
        : (a <= alphaMin) || (squaredDistance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) <= tolSq);
      if (isBg) { visited[id] = 1; q.push(id); }
    };

    tryPush(0,0); tryPush(width-1,0); tryPush(0,height-1); tryPush(width-1,height-1)
    while (q.length){
      const id = q.pop()
      const x = id % width, y = (id/width)|0
      tryPush(x+1,y); tryPush(x-1,y); tryPush(x,y+1); tryPush(x,y-1)
    }

    let left = width, top = height, right = -1, bottom = -1

    const colAllBg = (x, yMin, yMax) => {
      for (let y=yMin; y<=yMax; y++) {
        if (!visited[y*width+x]) return false
      }
      return true
    }
    const rowAllBg = (y, xMin, xMax) => {
      for (let x=xMin; x<=xMax; x++) {
        if (!visited[y*width+x]) return false
      }
      return true
    }

    for (let x=0; x<width; x++) if (!colAllBg(x, 0, height-1)) { left = x; break }
    for (let x=width-1; x>=0; x--) if (!colAllBg(x, 0, height-1)) { right = x; break }
    for (let y=0; y<height; y++) if (!rowAllBg(y, 0, width-1)) { top = y; break }
    for (let y=height-1; y>=0; y--) if (!rowAllBg(y, 0, width-1)) { bottom = y; break }

    console.log('Initial bounds:', { left, right, top, bottom, width, height });

    while (left < right && colAllBg(left, top, bottom))   left++
    while (left < right && colAllBg(right, top, bottom))  right--
    while (top < bottom && rowAllBg(top, left, right))    top++
    while (top < bottom && rowAllBg(bottom, left, right)) bottom--

    console.log('Final bounds:', { left, right, top, bottom });

    let newX = roiX + left
    let newY = roiY + top
    let newW = Math.max(1, right - left + 1)
    let newH = Math.max(1, bottom - top + 1)

    console.log('Result overlay:', { newX, newY, newW, newH, roiX, roiY, roiW, roiH });

    const globalRight  = Math.min(W, newX + newW)
    const globalBottom = Math.min(H, newY + newH)
    const paddedX = Math.max(0, newX - 1)
    const paddedY = Math.max(0, newY - 1)
    const paddedW = Math.max(1, globalRight - paddedX)
    const paddedH = Math.max(1, globalBottom - paddedY)

    showOverlay(paddedW, paddedH, paddedX, paddedY)
  }

  async function cropToOverlay() {
    pushHistory()
    if (isPdf.value) {
      if (overlayW.value < 1 || overlayH.value < 1) {
        return
      }

      const { x, y, width, height } = overlayBoxPdfCoords()

      const srcDoc = await PDFDocument.load(pdfBytes())
      const outDoc = await PDFDocument.create()

      const pages   = srcDoc.getPages()
      const srcPage = pages[currentPage.value - 1]
      const { width: pageW, height: pageH } = srcPage.getSize()

      let left   = Math.max(0, x)
      let bottom = Math.max(0, y)
      let right  = Math.min(pageW, x + width)
      let top    = Math.min(pageH, y + height)

      if (right <= left || top <= bottom) return

      const embedded = await outDoc.embedPage(srcPage, { left, bottom, right, top })

      const outW = Math.max(1, Math.round(right - left))
      const outH = Math.max(1, Math.round(top - bottom))

      outDoc.addPage([outW, outH]).drawPage(embedded, { x: 0, y: 0 })

      const newBytes = await outDoc.save()
      originalPdf.value = newBytes
      preview.value = URL.createObjectURL(new Blob([newBytes], { type: 'application/pdf' }))
      originalFileSize.value = newBytes.length
      originalLastModified.value = Date.now()

      emit('update:preview', preview.value)
      emit('update:meta', {
        name: 'cropped.pdf',
        type: 'application/pdf',
        size: newBytes.length,
        width: outW,
        height: outH,
        lastModified: Date.now(),
        docSig: makeDocSig(),
      })

      setupOverlay(outW, outH)
      await renderPdfPage()
      return

    } else {
      const img = imgEl.value
      if (!img) return

      const imgW = img.naturalWidth
      const imgH = img.naturalHeight

      const sx0 = overlayX.value
      const sy0 = overlayY.value
      const ex0 = overlayX.value + overlayW.value
      const ey0 = overlayY.value + overlayH.value

      const sx = Math.max(0, Math.floor(sx0))
      const sy = Math.max(0, Math.floor(sy0))
      const ex = Math.min(imgW, Math.floor(ex0))
      const ey = Math.min(imgH, Math.floor(ey0))

      const sw = Math.max(1, ex - sx)
      const sh = Math.max(1, ey - sy)

      const c = document.createElement('canvas')
      c.width = sw; c.height = sh
      const ctx = c.getContext('2d')

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      const newSrc = c.toDataURL('image/png')
      preview.value = newSrc
      const tmp = document.createElement('canvas')
      tmp.width = sw; tmp.height = sh
      tmp.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      setHasAlpha(canvasHasAlpha(tmp))

      emit('update:preview', newSrc)
      emit('update:meta', {
        name: 'cropped.png', type: 'image/png',
        size: atob(newSrc.split(',')[1]).length,
        width: sw, height: sh,
        lastModified: Date.now()
      })

      setupOverlay(sw, sh)
    }
  }

  function previewBackgroundColor(hexColor) {
    const src = getSourceCanvas()
    if (!src || !previewImg.value) return

    const hasA = canvasHasAlpha(src)
    const key = `${isPdf.value ? 'pdf' : 'img'}|${src.width}x${src.height}|${
      hasA ? 'alpha' : `bg:${origBg.value.r},${origBg.value.g},${origBg.value.b}`
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
    if (!hasAlpha.value && !hasAlphaImage(img)) {
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

  async function removeBackground() {
    if (!isPdf.value && hasAlphaImage(imgEl.value)) { return }

    pushHistory()

    if (isPdf.value) {
      suppressGalleryOnce.value = true

      const pdf  = await getDocument({ data: pdfBytes() }).promise
      const outDoc  = await PDFDocument.create()
      const bg   = origBg.value

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)

        const vp1 = page.getViewport({ scale: 1 })
        const dpiScale = Math.max(1, PDF_RASTER_OPS_DPI / 72)
        const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height)) || 1
        const scale = Math.min(dpiScale, maxScaleByPixels)
        const vp  = page.getViewport({ scale })

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
        const pngImg   = await outDoc.embedPng(pngBytes)

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

    setupOverlay(w, h)

    madeTransparentImg.value = true
    checkerOn.value = true
    setHasAlpha(true)
  }

  function canvasHasAlpha(src, stepHint = 200) {
    if (!src?.width || !src?.height) return false

    const w = src.width, h = src.height
    const ctx = src.getContext('2d', { willReadFrequently: true })
    const step = Math.max(1, Math.floor(Math.min(w, h) / stepHint))

    for (let y = 0; y < h; y += step) {
      const row = ctx.getImageData(0, y, w, 1).data

      for (let x = 0; x < w; x += step) {
        if (row[x * 4 + 3] < 255) return true
      }
    }
    return false
  }

  function setHasAlpha(val) {
    hasAlpha.value = !!val
    checkerOn.value = !!val
    emit('update:has-alpha', hasAlpha.value)
    if (panCont.value) panCont.value.style.backgroundColor = ''
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

  function deblendToTransparent(canvas, bgRGB) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const { width, height } = canvas
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    const srgbToLinear = v => {
      v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const linearToSrgb = v => {
      v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1/2.4) - 0.055
      return Math.max(0, Math.min(255, Math.round(v * 255)))
    }

    const br = srgbToLinear(bgRGB.r)
    const bg = srgbToLinear(bgRGB.g)
    const bb = srgbToLinear(bgRGB.b)
    const tol = 0.08

    for (let i = 0; i < data.length; i += 4) {
      const rL = srgbToLinear(data[i])
      const gL = srgbToLinear(data[i+1])
      const bL = srgbToLinear(data[i+2])

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
      data[i+1] = linearToSrgb(fg)
      data[i+2] = linearToSrgb(fb)
      data[i+3] = Math.round(a * 255)
    }

    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function hexToRgb(hex) {
    let c = (hex || '').replace('#','').trim()
    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('')

    return {
      r: parseInt(c.slice(0,2),16) || 0,
      g: parseInt(c.slice(2,4),16) || 0,
      b: parseInt(c.slice(4,6),16) || 0,
    }
  }

  function rgbToHex({ r, g, b }) {
    const to2 = v => v.toString(16).padStart(2,'0')
    return '#' + to2(r) + to2(g) + to2(b)
  }

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

  function canvasToBlob(canvas, type) {
    return new Promise(res => canvas.toBlob(b => res(b), type))
  }

  function extOf(fmt) {
    return fmt === 'jpg' ? 'jpg' : (fmt === 'png' ? 'png' : 'pdf')
  }

  function dataURLtoU8(dataURL) {
    const b64 = dataURL.split(',')[1]
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)

    for (let i=0;i<bin.length;i++) {
      u8[i] = bin.charCodeAt(i)
    }
    return u8
  }

  const overlayStyle = computed(() => {
    const s = initialScale.value || 1

    return {
      position: 'absolute',
      left: `${overlayX.value * s}px`,
      top: `${overlayY.value * s}px`,
      width: `${overlayW.value * s}px`,
      height: `${overlayH.value * s}px`,
      border: '2px dashed #ff3b30',
      boxSizing: 'border-box',
      pointerEvents: 'all',
      zIndex: 5,
    }
  })

  function toggleOverlayVisibility(visible) {
    overlayVisible.value = visible
  }

  const CAL_KEY = 'imageDrop.cssBaseDpi'
  const calibrationBaseCssDpi = ref(null)
  const calOpen = ref(false)
  const calMeasuredMm = ref(100)
  const calLineEl = ref(null)
  const calCssPx = ref(0)
  const calError = ref('')

  function measureCalLinePx() {
    if (calLineEl.value) {
      calCssPx.value = calLineEl.value.getBoundingClientRect().width
    }
  }

  function getPageZoomSafe() {
    return (window.visualViewport && typeof window.visualViewport.scale === 'number') ? (window.visualViewport.scale || 1) : 1
  }

  function applyCalibratedEffectiveDpiFromBase() {
    if (!calibrationBaseCssDpi.value) return
    const zoom = getPageZoomSafe()
    screenDPI.value = calibrationBaseCssDpi.value / zoom

    recomputeScaleBounds()
    updateDisplayScale()
  }

  function attachCalibrationListeners() {
    window.visualViewport?.addEventListener('resize', applyCalibratedEffectiveDpiFromBase)
    window.addEventListener('resize', applyCalibratedEffectiveDpiFromBase)
  }

  function detachCalibrationListeners() {
    window.visualViewport?.removeEventListener('resize', applyCalibratedEffectiveDpiFromBase)
    window.removeEventListener('resize', applyCalibratedEffectiveDpiFromBase)
  }

  function openCalibration() {
    calOpen.value = true
    nextTick(() => {
      measureCalLinePx()

      if (calibrationBaseCssDpi.value && calCssPx.value > 0) {
        const effectiveCssDpi = calibrationBaseCssDpi.value / getPageZoomSafe()
        const savedMm = (calCssPx.value * 25.4) / effectiveCssDpi
        calMeasuredMm.value = Math.round(savedMm * 10) / 10

      } else {
        calMeasuredMm.value = 100
      }

      window.addEventListener('resize', measureCalLinePx)
    })
  }

  function closeCalibration() {
    calOpen.value = false
    calError.value = ''
    window.removeEventListener('resize', measureCalLinePx)
  }

  function applyCalibration() {
    measureCalLinePx()
    const mm = Number(calMeasuredMm.value)
    if (!Number.isFinite(mm) || mm <= 0) {
      calError.value = 'Please enter a positive value in mm.'
      return
    }

    const effectiveCssDpi = (calCssPx.value * 25.4) / mm
    const baseCssDpi = effectiveCssDpi * getPageZoomSafe()

    const oldDpi = screenDPI.value
    calibrationBaseCssDpi.value = baseCssDpi
    localStorage.setItem(CAL_KEY, String(baseCssDpi))

    detachCalibrationListeners()
    attachCalibrationListeners()

    const newDpi = baseCssDpi / getPageZoomSafe()
    screenDPI.value = newDpi

    if (pz && basePixelWidth.value > 0) {
      const referenceWidthPx = (referenceWidthMm.value / 25.4) * screenDPI.value;
      const targetScreenWidthPx = referenceWidthPx;
      const targetAbsoluteScale = targetScreenWidthPx / basePixelWidth.value
      const targetUserScale = targetAbsoluteScale / initialScale.value

      const r = panCont.value.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top  + r.height / 2
      pz.zoomAbs(cx, cy, targetUserScale)
    }

    displayScale.value = 100
    recomputeScaleBounds()
    updateDisplayScale()
    closeCalibration()
  }

  function clearCalibration() {
    localStorage.removeItem(CAL_KEY)
    calibrationBaseCssDpi.value = null
    detachCalibrationListeners()
    measureCssDpi1in()
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function measureCssDpi1in () {
    const el = document.createElement('div')
    el.style.width = '1in'
    el.style.position = 'absolute'
    el.style.visibility = 'hidden'
    document.body.appendChild(el)
    const cssDpi = el.offsetWidth || 96
    document.body.removeChild(el)
    screenDPI.value = cssDpi
    recomputeScaleBounds()
    updateDisplayScale()
  }

  onMounted(() => {
    const savedBase = parseFloat(localStorage.getItem(CAL_KEY))
    if (Number.isFinite(savedBase) && savedBase > 20 && savedBase < 2000) {
      calibrationBaseCssDpi.value = savedBase
      attachCalibrationListeners()
      applyCalibratedEffectiveDpiFromBase()
    } else {
      measureCssDpi1in()
    }

    ro = new ResizeObserver(() => adjustForContainerResize())
    if (previewWrap.value) ro.observe(previewWrap.value)
  })

  defineExpose({
    setBackgroundColor,
    previewCropToContent,
    cropToOverlay,
    clear,
    showOverlay,
    hideOverlay,
    download,
    fixJpegArtifacts,
    highlightJpegArtifacts,
    applyGrayscale,
    setPdfPage,
    previewGrayscale,
    endPreviewGrayscale,
    previewBackgroundColor,
    endPreviewBackgroundColor,
    exportFile,
    estimateExport,
    undo,
    resetToOriginal,
    loadExternalFile,
    toggleOverlayVisibility,
    setDisplayScale,
    setReferenceWidth,
    removeBackground,
    openCalibration,
    clearCalibration 
  })
</script>

<style scoped>
  .dropField {
    width: 100%;
    height: 100vh;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dropField:hover {
    border-color: #888;
  }

  .preview-container {
    position: relative;
    width:100%;
    height:100%;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panzoom-container {
    position: relative;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    transform-origin: top left;
  }
    
  .preview-img, .preview-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
  }

  .preview-canvas{
    background: transparent;
  }

  .checkerboard {
    background: conic-gradient(#e9e9e9 25%, #ffffff 0 50%, #e9e9e9 0 75%, #ffffff 0) 0 0 / 16px 16px;
  }

  .preview-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    z-index: 3;
  }

  .mark-canvas { 
    position: absolute; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%; 
    pointer-events: none; 
    z-index: 4;
  }

  .crop-overlay {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed #ff3b30;
    pointer-events: all;
    will-change: transform, width, height, left, top;
    z-index: 5;
    user-select: none;
    touch-action: none;
  }

  .crop-overlay .handle {
    position: absolute;
    width: 10px;
    height: 10px;       
    background: #fff;
    border: 1px solid #ff3b30;
    box-sizing: border-box;
    z-index: 10;
    touch-action: none;
  }

  .crop-overlay .nw {
    top: -5px;
    left: -5px;
    cursor: nw-resize
  }

  .crop-overlay .n {
    top: -5px;
    left:50%;
    transform: translateX(-50%);
    cursor: n-resize
  }

  .crop-overlay .ne {
    top: -5px;
    right: -5px;
    cursor: ne-resize
  }

  .crop-overlay .e {
    top: 50%;
    right: -5px;
    transform: translateY(-50%);
    cursor: e-resize
  }

  .crop-overlay .se {
    bottom: -5px;
    right: -5px;
    cursor: se-resize
  }

  .crop-overlay .s {
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    cursor: s-resize
  }

  .crop-overlay .sw {
    bottom: -5px;
    left: -5px;
    cursor: sw-resize
  }

  .crop-overlay .w {
    top: 50%;
    left: -5px;
    transform: translateY(-50%);
    cursor: w-resize
  }

  .calib-backdrop{
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    display: grid;
    place-items: center;
    z-index: 1000;
  }

  .calib-modal{
    background: #fff; 
    border-radius: 10px;
    padding: 16px 18px;
    width: min(620px, 90vw);
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    color: #000;
  }

  .calib-modal h3 {
    color: #000;
  }

  .calib-modal p, .calib-modal small {
    color: #000;
  }

  .calib-line-wrap{
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 16px 0;
  }

  .calib-line{
    width: clamp(180px, 40vw, 400px);
    height: 2px; 
    background: #111;
    position: relative;
  }

  .cap{
    font-weight: 700;
    user-select: none;
  }

  .calib-controls{
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }

  .calib-controls input{
    width: 120px; margin-left: 6px;
  }

  .calib-controls .primary{
    padding: .4rem .7rem;
    border: 0;
    border-radius: 6px;
    background: #28a745;
    color: white; 
    cursor: pointer;
  }

  .calib-controls button:not(.primary){
    padding: .35rem .6rem;
    border-radius: 6px; 
    background: #e53935; cursor: pointer;
    border: none;
    color: white;
  }

  .calib-error{
    color:#c00;
    margin: 4px 0 0;
  }
</style>