<template>
  <div
    class="dropField"
    :style="{ paddingRight: rightGap, marginTop: topGap, height: `calc(100vh - ${topGap})`}"
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
        ref="canvasWrapper"
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
          @load="imageLoaded"
          v-show="!liveToolActive"
        />

        <canvas
          v-if="!isPdf || liveToolActive"
          ref="editCanvas"
          class="preview-canvas preview-edit-canvas"
          v-show="liveToolActive"
        ></canvas>

        <canvas
          v-if="!isPdf || liveToolActive"
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
            v-for="handle in resizeHandles"
            :key="handle"
            class="handle"
            :class="handle"
            @mousedown.stop="startResize(handle, $event)"
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

    <div v-if="calibrationOpen" class="calib-backdrop" @click.self="closeCalibration">
      <div class="calib-modal bg-neutral100">
        <h3 class="ty-title-medium">Screen Calibration</h3>

        <div class="calib-method">
          <h4 class="ty-body-medium">Ruler Method</h4>
          <p class="ty-body-small">Measure the line below with a ruler and enter its length in millimeters.</p>

          <div class="calib-line-wrap">
            <div ref="calibrationLineEl" class="calib-line"></div>
          </div>

          <div class="calib-controls">
            <label class="ty-body-small">
              Measured length (mm):
              <input
                type="number"
                v-model.number="calibrationMeasured"
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

        <p v-if="calibrationError" class="calib-error">{{ calibrationError }}</p>
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
  import {canvasHasAlpha, hasAlphaImage} from '../composables/imageProcessing'

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
  const canvasWrapper = ref(null)
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
  const originalBackground = ref({ r: 255, g: 255, b: 255 })
  const emit = defineEmits(['update:preview','update:meta','update:overlay', 'update:bgcolor', 'update:scale', 'update:has-alpha', 'editing', 'blur-stroke', 'mark-shape'])

  const PDF_PREVIEW_DPI = 600;
  const MAX_CANVAS_PIXELS = 25e6;
  const pdfRenderScale = ref(1);
  const previewWrap = ref(null)

  const imgTransparent = ref(false)
  const madeTransparentPdf = ref(false)
  const checkerOn = ref(false)
  const hasAlpha = ref(false)

  const originalFileType = ref('')
  const minScalePercent = ref(0)
  const maxScalePercent = ref(0)
  const highlightOn = ref(false)

  let clearBackgroundPreview = () => {}

  const panzoomComposable = usePanzoom({
    isPdf,
    pdfCanvas,
    imgEl,
    previewWrap,
    canvasWrapper,
    markCanvas,
    emit,
    displayScale,
    referenceWidthMm,
    screenDPI,
    basePixelWidth,
    minScalePercent,
    maxScalePercent,
    highlightOn,
    endPreviewBackgroundColor: () => clearBackgroundPreview(),
  })

  const {
    initialScale: initialScaleFromComposable,
    updateDisplayScale,
    setDisplayScale,
    setReferenceWidth,
    updateScaleLimits,
    handleWrapperResize,
    disposePanzoom,
    getPanzoom,
    initPanzoom: initPanzoomFromComposable,
    centerImage
  } = panzoomComposable

  const initPanzoom = initPanzoomFromComposable
  const initialScale = initialScaleFromComposable

  const calibrationComposable = useCalibration({
    screenDPI,
    updateScaleLimits,
    updateDisplayScale,
    referenceWidthMm
  })

  const {
    calibrationOpen,
    calibrationMeasured,
    calibrationCssPx,
    calibrationLineEl,
    cardSliderValue,
    cardImageEl,
    CARD_WIDTH_MM,
    calibrationError,
    calibrationDpi,
    openCalibration,
    closeCalibration,
    applyCalibration,
    clearCalibration,
    initCalibration,
    detachCalibrationListeners,
    measureCalibrationLine
  } = calibrationComposable

  const overlayComposable = useOverlay({
    emit,
    maxW,
    maxH,
    canvasWrapper,
    initialScale,
    panzoom: getPanzoom,
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
    resizeHandles,
    setupOverlay,
    showOverlay,
    hideOverlay,
    setOverlayVisible,
    startResize,
  } = overlayComposable

  const overlayX = overlayXComp
  const overlayY = overlayYComp
  const overlayW = overlayWComp
  const overlayH = overlayHComp
  const overlayVisible = overlayVisibleComp

  let backgroundCheck = () => {}

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
    detectBackground: () => backgroundCheck(),
    initPanzoom,
    imgTransparent
  })

  const {
    pushHistory,
    undo,
    redo,
    resetToOriginal,
    saveOriginalSnapshot,
    clearHistory,
  } = historyComposable

  let isSyncing = false

  async function imageLoaded() {
    const panzoom = getPanzoom()
    const savedScale = panzoom ? displayScale.value : null
    const savedTransform = panzoom ? panzoom.getTransform() : null

    await initPanzoom()
    updateScaleLimits()

    if (savedScale !== null && savedTransform !== null) {
      await nextTick()
      setDisplayScale(savedScale)
      await nextTick()
      const newPanzoom = getPanzoom()
      if (newPanzoom) {
        newPanzoom.moveTo(savedTransform.x, savedTransform.y)
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
    if (isSyncing) {
      return
    }

    measureCalibrationLine()
    const mm = Number(calibrationMeasured.value)
    if (!calibrationCssPx.value || calibrationCssPx.value <= 0 || !mm || mm <= 0) {
      return
    }

    isSyncing = true
    const measuredDpi = (calibrationCssPx.value * 25.4) / mm
    const cardWidth = (CARD_WIDTH_MM * measuredDpi) / 25.4

    if (cardImageEl.value && cardImageEl.value.parentElement) {
      const parent = cardImageEl.value.parentElement
      const computedStyle = window.getComputedStyle(parent)
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0
      const containerWidth = parent.getBoundingClientRect().width - paddingLeft - paddingRight

      if (containerWidth > 0) {
        const newSliderValue = (cardWidth / containerWidth) * 100
        cardSliderValue.value = Math.max(30, Math.min(120, Math.round(newSliderValue)))
      }
    }

    nextTick(() => {
      isSyncing = false
    })
  }

  function syncLineFromCard() {
    if (isSyncing){
      return
    }

    measureCalibrationLine()
    if (!calibrationCssPx.value || calibrationCssPx.value <= 0 || !cardImageEl.value) {
      return
    }

    isSyncing = true
    const cardRect = cardImageEl.value.getBoundingClientRect()
    const displayedCardWidth = cardRect.width

    if (displayedCardWidth > 0) {
      const measuredDpi = (displayedCardWidth * 25.4) / CARD_WIDTH_MM
      const newMeasuredMm = (calibrationCssPx.value * 25.4) / measuredDpi

      calibrationMeasured.value = Math.round(newMeasuredMm * 10) / 10
    }

    nextTick(() => {
      isSyncing = false
    })
  }

  function handleApplyCalibration() {
    applyCalibration(getPanzoom(), basePixelWidth, initialScale, canvasWrapper, displayScale)

    if (calibrationDpi.value) {
      localStorage.setItem('imageDrop.calConfirmedV2', '1')
    }
  }

  const backgroundComposable = useBackground({
    isPdf,
    pdfCanvas,
    imgEl,
    originalBackground,
    emit,
    hasAlpha,
    checkerOn,
    canvasWrapper,
    madeTransparentPdf,
    imgTransparent,
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

  clearBackgroundPreview = endPreviewBackgroundColor
  backgroundCheck = detectBackground

  const cropComposable = useCrop({
    isPdf,
    pdfCanvas,
    imgEl,
    overlayX,
    overlayY,
    overlayW,
    overlayH,
    originalBackground,
    emit,
    pdfBytes,
    originalPdf,
    originalFileSize,
    originalLastModified,
    preview,
    makeFileSignature,
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
    pdfCanvas,
    imgEl,
    editCanvas,
    toolCanvas,
    preview,
    originalFileName,
    originalFileType,
    blurActive,
    blurRadius,
    blurIntensity,
    emit,
    setHasAlpha,
    canvasHasAlpha,
    pushHistory
  })

  const {
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
    pdfCanvas,
    imgEl,
    editCanvas,
    toolCanvas,
    preview,
    originalFileName,
    originalFileType,
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
    markCursor,
    onMarkPointerDown,
    onMarkPointerMove,
    onMarkPointerUp,
    onMarkPointerLeave,
    setupMarkWatchers,
    handleImageLoadedMark
  } = markComposable

  setupMarkWatchers()

  function onLiveToolPointerDown(e) {
    if (blurActive.value) {
      onBlurPointerDown(e)
    }

    else if (markActive.value) {
      onMarkPointerDown(e)
    }
  }

  function onLiveToolPointerMove(e) {
    if (blurActive.value) {
      onBlurPointerMove(e)
    }

    else if (markActive.value) {
      onMarkPointerMove(e)
    }
  }

  function onLiveToolPointerUp(e) {
    if (blurActive.value) {
      onBlurPointerUp(e)
    }

    else if (markActive.value) {
      onMarkPointerUp(e)
    }
  }

  function onLiveToolPointerLeave() {
    if (blurActive.value) {
      onBlurPointerLeave()
    }

    else if (markActive.value) {
      onMarkPointerLeave()
    }
  }

  function getSourceCanvas() {
    if (isPdf.value && pdfCanvas.value?.width) {
      return pdfCanvas.value
    }

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return null
    }
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = img.naturalWidth
    tempCanvas.height = img.naturalHeight
    tempCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0)
    return tempCanvas
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
    pdfBytes,
    currentPage,
    pdfRenderScale,
    preview,
    maxW,
    maxH
  })

  const {
    prepareExport,
    exportFile,
    download
  } = exportComposable

  let resizeObserver = null

  onUnmounted(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    detachCalibrationListeners()
    disposePanzoom()

    document.removeEventListener('paste', handlePaste)
  })

  function pdfBytes () {
    return originalPdf.value instanceof Uint8Array ? originalPdf.value.slice() : new Uint8Array(originalPdf.value)
  }

  function makeFileSignature() {
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
    if (!items) {
      return
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.startsWith('image/')) {
        e.preventDefault()
        if (!shouldReplace()) {
          return
        }

        const blob = item.getAsFile()
        if (!blob) {
          continue
        }

        const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type })
        isPdf.value = false
        loadImage(file)
        break
      }
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) {
      return
    }

    if (!shouldReplace()) {
      e.target.value = ''
      return
    }

    if (file.type === 'application/pdf') {
      isPdf.value = true
      loadPdf(file)
    } else {
      isPdf.value = false
      loadImage(file)
    }
  }

  function handleDrop(e) {
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/') || f.type === 'application/pdf')

    if (!file) {
      return
    }

    if (!shouldReplace()) {
      return
    }

    if (file.type === 'application/pdf') {
      isPdf.value = true
      loadPdf(file)
    } else {
      isPdf.value = false
      loadImage(file)
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

    reader.onload = event => {
      preview.value = event.target.result
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

        imgTransparent.value = false
        const isAlpha = hasAlphaImage(img)
        checkerOn.value = isAlpha
        setHasAlpha(isAlpha)

        if (!isAlpha) {
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

    const panzoom = getPanzoom()
    const savedScale = panzoom ? displayScale.value : null
    const savedTransform = panzoom ? panzoom.getTransform() : null

    const pdf = await getDocument({ data: pdfBytes() }).promise
    totalPages.value  = pdf.numPages
    currentPage.value = Math.min(Math.max(1, pageNo), totalPages.value)

    const page = await pdf.getPage(currentPage.value)
    const defaultViewport = page.getViewport({ scale: 1 })
    const dpiScale = Math.max(1, dpi / 72)
    const maxScaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (defaultViewport.width * defaultViewport.height)) || 1
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
      name: originalFileName.value,
      type: 'application/pdf',
      size: originalFileSize.value,
      width: viewport.width.toFixed(),
      height: viewport.height.toFixed(),
      pages: totalPages.value,
      page: currentPage.value,
      lastModified: originalLastModified.value,
      docSig: makeFileSignature(),
      noGallery: suppressGalleryOnce.value
    })

    suppressGalleryOnce.value = false
    const isAlpha = madeTransparentPdf.value || canvasHasAlpha(canvas)
    setHasAlpha(isAlpha)
    checkerOn.value = !!isAlpha

    if (!isAlpha) {
      detectBackground()
    } else {
      emit('update:bgcolor', null)
    }

    await initPanzoom()
    updateScaleLimits()

    if (savedScale !== null && savedTransform !== null) {
      await nextTick()
      setDisplayScale(savedScale)
      await nextTick()
      const newPanzoom = getPanzoom()

      if (newPanzoom) {
        newPanzoom.moveTo(savedTransform.x, savedTransform.y)
      }
    }
  }

  async function setPdfPage(n) {
    await renderPdfPage(n)
  }

  function clearAllPreviews () {
    const previewElement = isPdf.value ? pdfCanvas.value : imgEl.value

    if (previewElement) {
      previewElement.style.filter = ''
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

    imgTransparent.value = false
    madeTransparentPdf.value = false
    hasAlpha.value = false
    checkerOn.value = false
    originalBackground.value = { r: 255, g: 255, b: 255 }
    disposePanzoom()

    canvasWrapper.value && Object.assign(canvasWrapper.value.style, { width:'', height:'', transform:'', backgroundColor:'' })
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

    if (canvasWrapper.value) {
      canvasWrapper.value.style.backgroundColor = ''
    }
  }

  onMounted(() => {
    initCalibration()

    resizeObserver = new ResizeObserver(() => handleWrapperResize())

    watch(() => previewWrap.value, (el, oldEl) => {
        if (!resizeObserver) {
          return
        }
        if (oldEl) {
          resizeObserver.unobserve(oldEl)
        }
        if (el) {
          resizeObserver.observe(el)
        }
      },{ immediate: true }
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
    setOverlayVisible,

    // Display scale
    setDisplayScale,
    setReferenceWidth,
    centerImage,
    resetZoomTo100,

    // Others
    clear,
    download,
    exportFile,
    prepareExport,
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