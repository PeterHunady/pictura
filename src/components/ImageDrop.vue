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
    <p v-if="!preview" class="ty-body-medium">
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
          @load="handleImageLoaded"
          v-show="!liveToolActive"
        />

        <canvas
          v-if="!isPdf"
          ref="editCanvas"
          class="preview-canvas preview-edit-canvas"
          v-show="liveToolActive"
        ></canvas>

        <canvas
          v-if="!isPdf"
          ref="toolCanvas"
          class="tool-canvas"
          :class="{ active: liveToolActive, 'cursor-crosshair': markActive && !markCursor, 'cursor-none': blurActive, [markCursor]: markCursor }"
          v-show="liveToolActive"
          @pointerdown.stop.prevent="onLiveToolPointerDown"
          @pointermove.stop.prevent="onLiveToolPointerMove"
          @pointerup.stop.prevent="onLiveToolPointerUp"
          @pointercancel.stop.prevent="onLiveToolPointerUp"
          @pointerleave.stop.prevent="onLiveToolPointerLeave"
        ></canvas>

        <img
          ref="previewImg"
          class="preview-layer"
          v-show="previewType==='bgcolor' && previewOn"
          alt="Preview"
        />

        <canvas ref="markCanvas" class="mark-canvas"></canvas>

        <div
          v-if="overlayW && overlayH && overlayVisible && !liveToolActive"
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
      <div class="calib-modal bg-neutral100">
        <h3 class="ty-title-medium">Screen Calibration</h3>

        <div class="calib-method">
          <h4 class="ty-body-medium">Ruler Method</h4>
          <p class="ty-body-small">Measure the line below with a ruler and enter its length in millimeters.</p>

          <div class="calib-line-wrap">
            <div ref="calLineEl" class="calib-line"></div>
          </div>

          <div class="calib-controls">
            <label class="ty-body-small">
              Measured length (mm):
              <input
                type="number"
                v-model.number="calMeasuredMm"
                @change="syncCardFromLine"
                min="10"
                max="1000"
                step="0.1">
            </label>
          </div>
        </div>

        <div class="calib-separator"></div>

          <div class="calib-method">
            <h4 class="ty-body-medium">Credit Card Method</h4>
            <p class="ty-body-small">Adjust the slider until the card below matches your real credit card size.</p>
            <p class="card-info ty-body-small">Standard card size: 85.6 × 53.98 mm</p>

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
              <label class="ty-body-small">
                Card Size:
                <input
                  type="range"
                  v-model.number="cardSliderValue"
                  @input="syncLineFromCard"
                  min="30"
                  max="120"
                  step="1"
                  class="card-slider"
                />
                <input
                  type="number"
                  v-model.number="cardSliderValue"
                  @change="syncLineFromCard"
                  min="30"
                  max="120"
                  step="1"
                  class="slider-value-input ty-body-small"
                />
                <span class="percent-sign ty-body-small">%</span>
              </label>
            </div>
          </div>

        <div class="calib-controls-footer">
          <button class="cancel-btn bg-red600 bg-hover-red500" @click="closeCalibration">Cancel</button>
          <button class="primary bg-lime600 bg-hover-lime500" @click="handleApplyCalibration">Apply</button>
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
  import { useBlur } from '../composables/useBlur'
  import { useMark } from '../composables/useMark'

  import {
    canvasHasAlpha,
    hasAlphaImage
  } from '../utils/imageProcessing'

  const props = defineProps({
    rightGap: { type: String, default: 'min(30vw, 300px)' },
    topGap: { type: String, default: '0px' },
    activeTool: { type: String, default: null },
    blurRadius: { type: Number, default: 28 },
    blurIntensity: { type: Number, default: 10 },
    markThickness: { type: Number, default: 4 },
    markColor: { type: String, default: '#ff0000' },
    markShape: { type: String, default: 'rect' },
  })

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
  const editCanvas = ref(null)
  const toolCanvas = ref(null)

  const blurActive = computed(() => props.activeTool === 'blur')
  const markActive = computed(() => props.activeTool === 'mark')
  const liveToolActive = computed(() => blurActive.value || markActive.value)

  const blurRadius = computed(() => props.blurRadius)
  const blurIntensity = computed(() => props.blurIntensity)
  const markThickness = computed(() => props.markThickness)
  const markColor = computed(() => props.markColor)
  const markShape = computed(() => props.markShape)

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
  const emit = defineEmits(['update:preview','update:meta','update:overlay', 'update:bgcolor', 'update:scale', 'update:has-alpha', 'editing', 'blur-stroke', 'mark-shape'])

  const PDF_PREVIEW_DPI = 600;
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
    endPreviewBackgroundColor: endPreviewBackgroundColorWrapper,
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
    initPanzoom: initPanzoomFromComposable,
    centerImage
  } = panzoomComposable

  const initPanzoom = initPanzoomFromComposable
  const initialScale = initialScaleFromComposable

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
    calCssPx,
    cardSliderValue,
    cardImageEl,
    CARD_WIDTH_MM,
    calError,
    calibrationBaseCssDpi,
    openCalibration,
    closeCalibration,
    applyCalibration,
    applyCardCalibration,
    clearCalibration,
    initCalibration,
    detachCalibrationListeners,
    getPageZoomSafe,
    measureCalLinePx
  } = calibrationComposable

  const isCalibrated = computed(() => !!calibrationBaseCssDpi.value)

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

  let detectBackgroundImpl = () => {}

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
    detectBackground: () => detectBackgroundImpl(),
    initPanzoom,
    madeTransparentImg
  })

  const {
    pushHistory,
    undo,
    redo,
    resetToOriginal,
    saveOriginalSnapshot,
    makeSnapshot,
    clearHistory,
  } = historyComposable

  let isSyncing = false

  async function handleImageLoaded() {
    const pz = getPanzoom()
    const savedScale = pz ? displayScale.value : null
    const savedTransform = pz ? pz.getTransform() : null

    await initPanzoom()
    recomputeScaleBounds()

    if (savedScale !== null && savedTransform !== null) {
      await nextTick()
      setDisplayScale(savedScale)
      await nextTick()
      const newPz = getPanzoom()
      if (newPz) {
        newPz.moveTo(savedTransform.x, savedTransform.y)
      }
    } else {
      await resetZoomTo100()
    }

    if (blurActive.value) {
      await nextTick()
      handleImageLoadedBlur()
    }
    if (markActive.value) {
      await nextTick()
      handleImageLoadedMark()
    }
  }

  async function resetZoomTo100() {
    setDisplayScale(100)
    await nextTick()
    centerImage()
  }

  function syncCardFromLine() {
    if (isSyncing) return

    measureCalLinePx()
    const mm = Number(calMeasuredMm.value)

    if (!calCssPx.value || calCssPx.value <= 0 || !mm || mm <= 0) return

    isSyncing = true

    const effectiveCssDpi = (calCssPx.value * 25.4) / mm
    const targetCardWidthPx = (CARD_WIDTH_MM * effectiveCssDpi) / 25.4

    if (cardImageEl.value && cardImageEl.value.parentElement) {
      const parent = cardImageEl.value.parentElement
      const computedStyle = window.getComputedStyle(parent)
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0
      const containerWidth = parent.getBoundingClientRect().width - paddingLeft - paddingRight

      if (containerWidth > 0) {
        const newSliderValue = (targetCardWidthPx / containerWidth) * 100
        cardSliderValue.value = Math.max(30, Math.min(120, Math.round(newSliderValue)))
      }
    }

    nextTick(() => {
      isSyncing = false
    })
  }

  function syncLineFromCard() {
    if (isSyncing) return

    measureCalLinePx()

    if (!calCssPx.value || calCssPx.value <= 0 || !cardImageEl.value) return

    isSyncing = true

    const cardRect = cardImageEl.value.getBoundingClientRect()
    const displayedCardWidthPx = cardRect.width

    if (displayedCardWidthPx > 0) {
      const effectiveCssDpi = (displayedCardWidthPx * 25.4) / CARD_WIDTH_MM
      const newMeasuredMm = (calCssPx.value * 25.4) / effectiveCssDpi

      calMeasuredMm.value = Math.round(newMeasuredMm * 10) / 10
    }

    nextTick(() => {
      isSyncing = false
    })
  }

  function handleApplyCalibration() {
    applyCalibration(getPanzoom(), basePixelWidth, initialScale, panCont, displayScale)

    if (calibrationBaseCssDpi.value) {
      localStorage.setItem(CAL_KEY, String(calibrationBaseCssDpi.value))
      localStorage.setItem(CARD_SLIDER_KEY, String(cardSliderValue.value))
      localStorage.setItem(REF_WIDTH_KEY, String(referenceWidthMm.value))
      localStorage.setItem('imageDrop.calConfirmedV2', '1')
    }
  }

  function handleApplyCardCalibration() {
    applyCardCalibration(getPanzoom(), basePixelWidth, initialScale, panCont, displayScale)

    if (calibrationBaseCssDpi.value) {
      localStorage.setItem(CAL_KEY, String(calibrationBaseCssDpi.value))
      localStorage.setItem(CARD_SLIDER_KEY, String(cardSliderValue.value))
      localStorage.setItem(REF_WIDTH_KEY, String(referenceWidthMm.value))
      localStorage.setItem('imageDrop.calConfirmedV2', '1')
    }
  }

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
    pushHistory,
    currentPage,
  })

  const {
    previewImg,
    previewOn,
    previewType,
    detectBackground,
    removeBackground,
    previewBackgroundColor,
    endPreviewBackgroundColor,
    setBackgroundColor,
    clearBackgroundState
  } = backgroundComposable

  endPreviewBackgroundColorFn = endPreviewBackgroundColor
  detectBackgroundImpl = detectBackground

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
    showOverlay,
    currentPage,
    detectBackground,
  })

  const {
    previewCropToContent,
    cropToOverlay
  } = cropComposable

  const blurComposable = useBlur({
    isPdf,
    imgEl,
    editCanvas,
    toolCanvas,
    preview,
    originalFileName,
    blurActive,
    blurRadius,
    blurIntensity,
    emit,
    setHasAlpha,
    canvasHasAlpha,
    pushHistory
  })

  const {
    blurSuppressNextImgLoadResync,
    prepareBlurCanvases,
    onBlurPointerDown,
    onBlurPointerMove,
    onBlurPointerUp,
    onBlurPointerLeave,
    setupBlurWatchers,
    handleImageLoadedBlur
  } = blurComposable

  setupBlurWatchers()

  const markComposable = useMark({
    isPdf,
    imgEl,
    editCanvas,
    toolCanvas,
    preview,
    originalFileName,
    markActive,
    markThickness,
    markColor,
    markShape,
    emit,
    setHasAlpha,
    canvasHasAlpha,
    pushHistory
  })

  const {
    markSuppressNextImgLoadResync,
    markCursor,
    prepareMarkCanvases,
    onMarkPointerDown,
    onMarkPointerMove,
    onMarkPointerUp,
    onMarkPointerLeave,
    setupMarkWatchers,
    handleImageLoadedMark
  } = markComposable

  setupMarkWatchers()

  function onLiveToolPointerDown(e) {
    if (blurActive.value) onBlurPointerDown(e)
    else if (markActive.value) onMarkPointerDown(e)
  }

  function onLiveToolPointerMove(e) {
    if (blurActive.value) onBlurPointerMove(e)
    else if (markActive.value) onMarkPointerMove(e)
  }

  function onLiveToolPointerUp(e) {
    if (blurActive.value) onBlurPointerUp(e)
    else if (markActive.value) onMarkPointerUp(e)
  }

  function onLiveToolPointerLeave() {
    if (blurActive.value) onBlurPointerLeave()
    else if (markActive.value) onMarkPointerLeave()
  }

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
    pushHistory,
    currentPage,
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

  let ro = null

  onUnmounted(() => {
    ro?.disconnect()
    ro = null
    detachCalibrationListeners()
    disposePanzoom()

    document.removeEventListener('paste', handlePaste)
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

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.startsWith('image/')) {
        e.preventDefault()

        if (!shouldReplace()) {
          return
        }

        const blob = item.getAsFile()
        if (!blob) continue

        const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type })

        isPdf.value = false
        loadImage(file)
        break
      }
    }
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
    await resetZoomTo100()
    saveOriginalSnapshot()
  }

  async function renderPdfPage(pageNo = currentPage.value || 1, dpi = PDF_PREVIEW_DPI) {
    await nextTick()

    const pz = getPanzoom()
    const savedScale = pz ? displayScale.value : null
    const savedTransform = pz ? pz.getTransform() : null

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

    if (savedScale !== null && savedTransform !== null) {
      await nextTick()
      setDisplayScale(savedScale)
      await nextTick()
      const newPz = getPanzoom()
      if (newPz) {
        newPz.moveTo(savedTransform.x, savedTransform.y)
      }
    }
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
    clearHistory()
    clearBackgroundState()

    preview.value = null
    isPdf.value = false
    originalPdf.value = null
    originalFileName.value = ''
    originalFileType.value = ''
    originalFileSize.value = 0
    originalLastModified.value = 0

    overlayX.value = 0
    overlayY.value = 0
    overlayW.value = 0
    overlayH.value = 0
    currentPage.value = 1
    totalPages.value = 1
    suppressGalleryOnce.value = false

    madeTransparentImg.value = false
    madeTransparentPdf.value = false
    hasAlpha.value = false
    checkerOn.value = false
    origBg.value = { r: 255, g: 255, b: 255 }

    disposePanzoom()

    panCont.value && Object.assign(panCont.value.style, { width:'', height:'', transform:'', backgroundColor:'' })
    initialScale.value = 1
    fileInput.value && (fileInput.value.value = '')

    emit('update:preview', null)
    emit('update:meta', null)
    emit('update:overlay', { width:0, height:0, x:0, y:0 })
    emit('update:bgcolor', null)
    emit('update:has-alpha', false)
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

    watch(
      () => previewWrap.value,
      (el, oldEl) => {
        if (!ro) return
        if (oldEl) ro.unobserve(oldEl)
        if (el) ro.observe(el)
      },
      { immediate: true }
    )

    document.addEventListener('paste', handlePaste)
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
    redo,
    resetToOriginal,

    // Overlay
    showOverlay,
    hideOverlay,
    toggleOverlayVisibility,

    // Display scale
    setDisplayScale,
    setReferenceWidth,
    centerImage,
    resetZoomTo100,

    // Others
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
    box-sizing: border-box;
    transition: padding-right 0.28s cubic-bezier(0.22, 0.61, 0.36, 1), margin-top 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .dropField:hover {
    border-color: #888;
  }

  .preview-container {
    position: relative;
    width:100%;
    height:100%;
    background: transparent;
    overflow: hidden;
  }

  .panzoom-container {
    position: absolute;
    top: 0;
    left: 0;
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
    pointer-events: auto;
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

  .tool-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 6;
    pointer-events: none;
    touch-action: none;
    user-select: none;
  }

  .tool-canvas.cursor-none {
    cursor: none;
  }

  .tool-canvas.cursor-crosshair {
    cursor: crosshair;
  }

  .tool-canvas.active {
    pointer-events: all;
  }

  .tool-canvas.cursor-nw-resize { cursor: nw-resize; }
  .tool-canvas.cursor-ne-resize { cursor: ne-resize; }
  .tool-canvas.cursor-sw-resize { cursor: sw-resize; }
  .tool-canvas.cursor-se-resize { cursor: se-resize; }
  .tool-canvas.cursor-move { cursor: move; }

  .crop-overlay {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed #ff3b30;
    pointer-events: none;
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
    pointer-events: all;
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
    border-radius: 10px;
    padding: 16px 18px;
    width: min(620px, 90vw);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    color: #000;
  }

  .calib-modal h3 {
    color: #000;
    margin: 0 0 16px;
  }

  .calib-modal p, .calib-modal small {
    color: #000;
  }

  .calib-method {
    margin-bottom: 20px;
  }

  .calib-method h4 {
    color: #000;
    margin: 0 0 8px;
    font-weight: 500;
  }

  .calib-method p {
    margin: 0 0 12px;
  }

  .calib-separator {
    height: 1px;
    background: #ddd;
    margin: 24px 0;
  }

  .calib-controls-footer {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #eee;
  }

  .calib-controls-footer .primary {
    padding: .4rem .7rem;
    border: 0;
    border-radius: 6px;
    color: white;
    cursor: pointer;
  }

  .cancel-btn {
    padding: .4rem .8rem;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    color: white;
  }

  .card-info {
    color: #666 !important;
    margin: 4px 0 12px !important;
  }

  .calib-card-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 20px 0;
    padding: 20px;
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
    color: #333;
  }

  .card-slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    outline: none;
    background: linear-gradient(to right, #ddd 0%, #28a745 50%, #ddd 100%);
  }

  .card-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .card-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
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
    color: white; 
    cursor: pointer;
  }

  .calib-controls button:not(.primary){
    padding: .35rem .6rem;
    border-radius: 6px; 
    cursor: pointer;
    border: none;
    color: white;
  }

  .calib-error{
    color:#c00;
    margin: 4px 0 0;
  }
</style>