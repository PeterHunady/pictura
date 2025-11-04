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
          @mousedown="startDrag"
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
        <h3>Screen Calibration</h3>

        <!-- Mode Selector -->
        <div class="calib-mode-selector">
          <button
            :class="{ active: calibrationMode === 'line' }"
            @click="calibrationMode = 'line'"
          >
            Ruler Method
          </button>
          <button
            :class="{ active: calibrationMode === 'card' }"
            @click="calibrationMode = 'card'"
          >
            Credit Card Method
          </button>
        </div>

        <!-- Line Calibration -->
        <div v-if="calibrationMode === 'line'" class="calib-method">
          <p>Measure the line below with a ruler and enter its length in millimeters.</p>

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
        </div>

        <!-- Card Calibration -->
        <div v-if="calibrationMode === 'card'" class="calib-method">
          <p>Adjust the slider until the card below matches your real credit card size.</p>
          <p class="card-info">Standard card size: 85.6 × 53.98 mm</p>

          <div class="calib-card-wrap">
            <img
              ref="cardImageEl"
              src="/src/assets/creditCard.png"
              alt="Credit Card"
              class="calib-card"
              :style="{ width: cardSliderValue + '%' }"
            />
          </div>

          <div class="calib-slider-wrap">
            <label>
              Card Size:
              <input
                type="range"
                v-model.number="cardSliderValue"
                min="30"
                max="200"
                step="1"
                class="card-slider"
              />
              <input
                type="number"
                v-model.number="cardSliderValue"
                min="30"
                max="200"
                step="1"
                class="slider-value-input"
              />
              <span class="percent-sign">%</span>
            </label>
          </div>

          <div class="calib-controls">
            <button class="primary" @click="applyCardCalibration">Apply</button>
            <button @click="closeCalibration">Cancel</button>
          </div>
        </div>

        <p v-if="calError" class="calib-error">{{ calError }}</p>
      </div>
    </div>

  </div>
</template>

<script setup>
  import { ref, nextTick, computed, onMounted, onUnmounted, watch } from 'vue'
  import * as pdfjsLib from 'pdfjs-dist'
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

  import { useCalibration } from '../composables/useCalibration'
  import { useBackground } from '../composables/useBackground'
  import { useCrop } from '../composables/useCrop'
  import { useJpegArtifacts } from '../composables/useJpegArtifacts'
  import { useGrayscale } from '../composables/useGrayscale'
  import { useOverlay } from '../composables/useOverlay'
  import { useHistory } from '../composables/useHistory'
  import { usePanzoom } from '../composables/usePanzoom'
  import { useExport } from '../composables/useExport'

  import {
    canvasHasAlpha,
    hasAlphaImage
  } from '../utils/imageProcessing'

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

  const currentPage = ref(1)
  const totalPages = ref(1)
  const suppressGalleryOnce = ref(false)

  const displayScale = ref(100)
  const referenceWidthMm = ref(210)
  const basePixelWidth = ref(0)
  const screenDPI = ref(96)

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

  const originalFileType = ref('')

  const minScalePct = ref(0)
  const maxScalePct = ref(0)

  const highlightOn = ref(false)

  let endPreviewBackgroundColorFn = () => {}
  const endPreviewBackgroundColorWrapper = () => {
    if (endPreviewBackgroundColorFn) {
      endPreviewBackgroundColorFn()
    }
  }

  const panzoomComposable = usePanzoom({
    isPdf,
    pdfCanvas,
    imgEl,
    previewWrap,
    panCont,
    markCanvas,
    emit,
    displayScale,
    referenceWidthMm,
    screenDPI,
    basePixelWidth,
    minScalePct,
    maxScalePct,
    highlightOn,
    endPreviewBackgroundColor: endPreviewBackgroundColorWrapper
  })

  const {
    initialScale: initialScaleFromComposable,
    updateDisplayScale,
    setDisplayScale,
    setReferenceWidth,
    recomputeScaleBounds,
    adjustForContainerResize,
    disposePanzoom,
    getPanzoom,
    initPanzoom: initPanzoomFromComposable
  } = panzoomComposable

  const initPanzoom = initPanzoomFromComposable
  const initialScale = initialScaleFromComposable

  const overlayComposable = useOverlay({
    emit,
    maxW,
    maxH,
    panCont,
    initialScale,
    pz: getPanzoom,
    pdfCanvas,
    pdfRenderScale
  })

  const {
    overlayX: overlayXComp,
    overlayY: overlayYComp,
    overlayW: overlayWComp,
    overlayH: overlayHComp,
    overlayVisible: overlayVisibleComp,
    overlayStyle,
    dirs,
    setupOverlay,
    showOverlay,
    hideOverlay,
    toggleOverlayVisibility,
    overlayBoxPdfCoords,
    startResize,
    startDrag
  } = overlayComposable

  const overlayX = overlayXComp
  const overlayY = overlayYComp
  const overlayW = overlayWComp
  const overlayH = overlayHComp
  const overlayVisible = overlayVisibleComp

  const historyComposable = useHistory({
    isPdf,
    preview,
    originalFileName,
    originalFileType,
    originalFileSize,
    originalLastModified,
    originalPdf,
    currentPage,
    emit,
    renderPdfPage,
    setupOverlay,
    setHasAlpha,
    detectBackground: () => {},
    initPanzoom,
    madeTransparentImg
  })

  const {
    pushHistory,
    undo,
    resetToOriginal,
    saveOriginalSnapshot,
    makeSnapshot
  } = historyComposable

  const calibrationComposable = useCalibration({
    screenDPI,
    recomputeScaleBounds,
    updateDisplayScale,
    referenceWidthMm
  })

  const {
    calOpen,
    calibrationMode,
    calMeasuredMm,
    calLineEl,
    cardSliderValue,
    cardImageEl,
    calError,
    openCalibration,
    closeCalibration,
    applyCalibration,
    applyCardCalibration,
    clearCalibration,
    initCalibration,
    detachCalibrationListeners
  } = calibrationComposable

  const backgroundComposable = useBackground({
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
  })

  const {
    previewImg,
    previewOn,
    previewType,
    detectBackground,
    removeBackground,
    previewBackgroundColor,
    endPreviewBackgroundColor,
    setBackgroundColor
  } = backgroundComposable

  endPreviewBackgroundColorFn = endPreviewBackgroundColor

  const cropComposable = useCrop({
    isPdf,
    pdfCanvas,
    imgEl,
    overlayX,
    overlayY,
    overlayW,
    overlayH,
    origBg,
    emit,
    overlayBoxPdfCoords,
    pdfBytes,
    originalPdf,
    originalFileSize,
    originalLastModified,
    preview,
    makeDocSig,
    renderPdfPage,
    setupOverlay,
    setHasAlpha,
    canvasHasAlpha,
    pushHistory,
    showOverlay
  })

  const {
    previewCropToContent,
    cropToOverlay
  } = cropComposable

  function getSourceCanvas() {
    if (isPdf.value && pdfCanvas.value?.width) return pdfCanvas.value
    const img = imgEl.value
    if (!img?.naturalWidth) return null
    const off = document.createElement('canvas')
    off.width = img.naturalWidth
    off.height = img.naturalHeight
    off.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    return off
  }

  const jpegArtifactsComposable = useJpegArtifacts({
    markCanvas,
    getSourceCanvas,
    pushHistory,
    preview,
    emit,
    imgEl
  })

  const {
    highlightOn: _highlightOnFromComposable,
    highlightJpegArtifacts,
    fixJpegArtifacts,
    clearHighlights
  } = jpegArtifactsComposable

  const grayscaleComposable = useGrayscale({
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
  })

  const {
    previewGrayscale,
    endPreviewGrayscale,
    applyGrayscale
  } = grayscaleComposable

  const exportComposable = useExport({
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
  })

  const {
    estimateExport,
    exportFile,
    download
  } = exportComposable

  const props = defineProps({
    rightGap: { type: String, default: 'min(30vw, 300px)' },
    topGap: { type: String, default: '0px' }
  })

  let ro = null

  onUnmounted(() => {
    ro?.disconnect()
    ro = null
    detachCalibrationListeners()
    disposePanzoom()
  })

  watch(() => props.rightGap, async () => {
    await nextTick()
    adjustForContainerResize()
  })

  watch(() => props.topGap, async () => {
    await nextTick()
    adjustForContainerResize()
  })

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

        saveOriginalSnapshot()
      }
    }
    reader.readAsDataURL(file)
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
    saveOriginalSnapshot()
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
      width: viewport.width.toFixed(),
      height: viewport.height.toFixed(),
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

    disposePanzoom()

    panCont.value && Object.assign(panCont.value.style, { width:'', height:'', transform:'' })
    initialScale.value = 1
    fileInput.value && (fileInput.value.value = '')

    emit('update:preview', null)
    emit('update:meta', null)
    emit('update:overlay', { width:0, height:0, x:0, y:0 })
  }

  function setHasAlpha(val) {
    hasAlpha.value = !!val
    checkerOn.value = !!val
    emit('update:has-alpha', hasAlpha.value)
    if (panCont.value) panCont.value.style.backgroundColor = ''
  }

  onMounted(() => {
    initCalibration()

    ro = new ResizeObserver(() => adjustForContainerResize())
    if (previewWrap.value) ro.observe(previewWrap.value)
  })

  defineExpose({
    // Background operations
    setBackgroundColor,
    removeBackground,
    previewBackgroundColor,
    endPreviewBackgroundColor,

    // Crop operations
    previewCropToContent,
    cropToOverlay,

    // JPEG operations
    fixJpegArtifacts,
    highlightJpegArtifacts,

    // Grayscale operations
    applyGrayscale,
    previewGrayscale,
    endPreviewGrayscale,

    // Calibration
    openCalibration,
    clearCalibration,

    // History
    undo,
    resetToOriginal,

    // Overlay
    showOverlay,
    hideOverlay,
    toggleOverlayVisibility,

    // Display scale
    setDisplayScale,
    setReferenceWidth,

    // Ostatné (ostávajú v hlavnom komponente)
    clear,
    download,
    exportFile,
    estimateExport,
    loadExternalFile,
    setPdfPage,
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
    margin: 0 0 16px;
    font-size: 1.25rem;
  }

  .calib-modal p, .calib-modal small {
    color: #000;
  }

  .calib-mode-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .calib-mode-selector button {
    flex: 1;
    padding: 8px 16px;
    border: 2px solid #ddd;
    border-radius: 6px;
    background: #fff;
    color: #333;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .calib-mode-selector button:hover {
    border-color: #28a745;
    background: #f0f0f0;
  }

  .calib-mode-selector button.active {
    border-color: #28a745;
    background: #28a745;
    color: #fff;
    font-weight: 600;
  }

  .calib-method {
    margin-top: 16px;
  }

  .calib-method p {
    margin: 0 0 12px;
    font-size: 14px;
  }

  .card-info {
    font-size: 12px !important;
    color: #666 !important;
    margin: 4px 0 12px !important;
  }

  .calib-card-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 20px 0;
    padding: 20px;
    background: #f5f5f5;
    border-radius: 8px;
    min-height: 150px;
  }

  .calib-card {
    max-width: 100%;
    height: auto;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    border-radius: 8px;
    transition: width 0.1s;
  }

  .calib-slider-wrap {
    margin: 16px 0;
  }

  .calib-slider-wrap label {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: #333;
  }

  .card-slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
    background: linear-gradient(to right, #ddd 0%, #28a745 50%, #ddd 100%);
  }

  .card-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #28a745;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .card-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #28a745;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .slider-value {
    min-width: 45px;
    text-align: right;
    font-weight: 600;
    color: #28a745;
  }

  .slider-value-input {
    width: 60px;
    padding: 4px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: #28a745;
  }

  .slider-value-input:focus {
    outline: none;
    border-color: #28a745;
  }

  .percent-sign {
    font-weight: 600;
    color: #28a745;
    margin-left: 2px;
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
    background: #e53935;
    cursor: pointer;
    border: none;
    color: white;
  }

  .calib-error{
    color:#c00;
    margin: 4px 0 0;
  }
</style>