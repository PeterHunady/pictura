<!--
  Author: Peter Huňady (xhunadp00)
  File: Editor.vue
  Bachelor's Thesis, VUT Brno, 2026
-->

<template>
    <div class="app-container">
        <TopBar
            :isCalibrated="isCalibrated"
            :show-scale="showScale"
            :display-scale="displayScale"
            :reference-width-mm="referenceWidthMm"
            :min-scale="minScale"
            :max-scale="maxScale"
            @update:scale="scaleUpdate"
            @update:reference-width="referenceWidthUpdate"
            @visible="setCropVisible"
            @undo="onUndo"
            @redo="onRedo"
            @reset="onReset"
            @clear="onClear"
            @calibrate="openCalibration"
            @clear-calibration="clearCalibration"
            @reset-to-100="onResetTo100"
        />

        <ImageArea
            :right-gap="rightGap"
            :top-gap="topGap"
            :active-tool="activeTool"
            :blur-radius="blurRadius"
            :blur-intensity="blurIntensity"
            :mark-thickness="markThickness"
            :mark-color="markColor"
            :mark-shape="markShape"
            ref="imageArea"
            @update:preview="imagePreview = $event"
            @update:meta="metaUpdate"
            @update:overlay="overlayUpdate"
            @update:bgcolor="backgroundColorUpdate"
            @update:scale="updateScaleInfo"
            @update:has-alpha="isTransparent = $event"
            @editing="isEditing = true"
            @blur-stroke="blurStroke"
            @mark-shape="markShapeDraw"
        />

        <Sidebar
            v-model="sidebarClosed"
            :meta="imageMeta"
            :initial-size="{ width: cropWidth, height: cropHeight }"
            :initialColor="bgColor"
            :active-tool="activeTool"
            :blur-radius="blurRadius"
            :blur-intensity="blurIntensity"
            :mark-thickness="markThickness"
            :mark-color="markColor"
            :mark-shape="markShape"
            :export-bytes="exportBytes"
            :export-loading="exportLoading"
            :bg-transparent="isTransparent" 
            :export-suggested-name="exportName"
            :export-suggested-type="exportType"
            :top-gap="topGap"
            :applied-grayscale-strength="lastGrayscaleStrength"
            :applied-bg-color="lastBgColor"
            @set-active-tool="setActiveTool"
            @update-blur-radius="blurRadius = $event"
            @update-blur-intensity="blurIntensity = $event"
            @update-mark-thickness="markThickness = $event"
            @update-mark-color="markColor = $event"
            @update-mark-shape="markShape = $event"
            @download="onDownload"
            @clear="onClear"
            @crop="cropToContent"
            @preview-crop="previewCrop"
            @resize-crop="applyCrop"
            @fix-artifacts="fixArtifacts"
            @apply-color="applyBackgroundColor"
            @highlight-artifacts="highlightArtifacts"
            @apply-grayscale="applyGrayscale"
            @preview-grayscale="previewGrayscale"
            @end-preview-grayscale="endPreviewGrayscale"
            @preview-color="previewBgColor"
            @end-preview-color="endPreviewBgColor"
            @request-export-preview="updateExportSize"
            @export="exportFile"
            @remove-background="removeBackground"
        />

        <PdfPageDialog
            v-if="showPageDlg"
            :src="imagePreview"
            :pages="totalPages"
            v-model="pickPage"
            @confirm="confirmPage"
            @cancel="showPageDlg = false"
        />
    </div>
</template>

<script setup>
    import { ref, computed, onUnmounted, onMounted, nextTick } from 'vue'
    import { consumePendingFile } from '@/composables/usePendingFile'
    import ImageArea from '@/components/ImageArea.vue'
    import Sidebar from '@/components/Sidebar.vue'
    import PdfPageDialog from '@/components/PdfPageDialog.vue'
    import TopBar from '@/components/Topbar.vue'
    import * as analytics from '@/statistics/analytics'

    const sidebarClosed = ref(false)
    const rightGap = computed(function() {
        if (sidebarClosed.value) {
            return '30px'
        } else {
            return 'min(30vw, 300px)'
        }
    })

    const topGap = '48px'
    const initialDoc = ref(null)
    const actionsPerformed = ref([])

    const imageArea = ref(null)
    const imagePreview = ref(null)
    const imageMeta = ref(null)
    const cropWidth = ref(0)
    const cropHeight = ref(0)
    const bgColor = ref('#ffffff')
    const isTransparent = ref(false)
    const showPageDlg = ref(false)
    const totalPages = ref(1)
    const pickPage = ref(1)
    const lastPdfFileId = ref(null)

    const displayScale = ref(100)
    const referenceWidthMm = ref(210)
    const calibrationDpi = ref(null)
    const showScale = ref(false)
    const minScale = ref(1)
    const maxScale = ref(10000)

    const exportName = ref(null)
    const exportType = ref(null)
    const exportBytes = ref(null)
    const exportLoading = ref(false)
    const lastExportFormat = ref('png')
    let exportTimer = null
    const isEditing = ref(false)
    const lastFileId = ref(null)
    const isCalibrated = computed(function() {
        return calibrationDpi.value != null
    })

    const lastGrayscaleStrength = ref(null)
    const lastBgColor = ref(null)
    const activeTool = ref(null)
    const blurRadius = ref(28)
    const blurIntensity = ref(10)
    const markThickness = ref(4)
    const markColor = ref('#ff0000')
    const markShape = ref('rect')

    function detectFileFormat(meta) {
        const name = (meta?.name || '').toLowerCase()
        const type = (meta?.type || '').toLowerCase()

        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || type.includes('jpeg') || type.includes('jpg')) {
            return 'jpg'
        }

        if (name.endsWith('.png') || type.includes('png')) {
            return 'png'
        }

        if (name.endsWith('.pdf') || type.includes('pdf')) {
            return 'pdf'
        }

        return 'png'
    }

    function recordAction(name, data) {
        const entry = { t: name }
        if (data) {
            Object.assign(entry, data)
        }
        actionsPerformed.value.push(entry)
    }

    // File

    function metaUpdate(meta) {
        imageMeta.value = meta
        cropWidth.value = meta?.width || 0
        cropHeight.value = meta?.height || 0

        // docSig is a stable file id from ImageArea, if it is missing, use name, size, and date instead
        const fileId = meta?.docSig || `${meta?.name}|${meta?.size}|${meta?.lastModified}`
        
        // isEditing stops edits like crop or grayscale from looking like a new file load
        const isNewFile = fileId !== lastFileId.value && !isEditing.value

        if (isNewFile) {
            if (!analytics.hasActive?.()) {
                analytics.startSession()
            }

            exportName.value = meta?.name || 'export'
            exportType.value = meta?.type || ''
            const fileFormat = detectFileFormat(meta)
            lastExportFormat.value = fileFormat
            analytics.setSourceFormat?.(fileFormat)

            initialDoc.value = {
                name: meta?.name,
                type: meta?.type,
                size: meta?.size,
                width: meta?.width,
                height: meta?.height,
                pages: meta?.pages || 1,
                page: meta?.page || 1
            }

            lastGrayscaleStrength.value = null
            lastBgColor.value = null
            activeTool.value = null
        }

        // show the page picker only when a multi-page PDF is loaded for the first time
        if (meta?.type === 'application/pdf' && (meta.pages || 1) > 1 && meta.page === 1 && meta.docSig !== lastPdfFileId.value && !meta.noGallery) {
            const pdfFileId = meta.docSig || `${meta.name}|${meta.size}|${meta.lastModified}`
            if (pdfFileId !== lastPdfFileId.value) {
                lastPdfFileId.value = pdfFileId
                totalPages.value = meta.pages
                pickPage.value = meta.page || 1
                showPageDlg.value = true
            }
        }

        if (meta) {
            imageArea.value.showOverlay(meta.width, meta.height)
        }

        lastFileId.value = fileId
        isEditing.value = false
        exportSizeDelay(80)
    }

    function confirmPage(n) {
        imageArea.value?.setPdfPage(n)
        showPageDlg.value = false
        recordAction('pdf_page_selected')
    }

    function onDownload() {
        imageArea.value?.download()
    }

    function onClear() {
        imageArea.value?.clear()
        imagePreview.value = null
        imageMeta.value = null
        cropWidth.value = 0
        cropHeight.value = 0
        lastPdfFileId.value = null
        exportBytes.value = null
        exportLoading.value = false
        lastExportFormat.value = 'png'
        exportName.value = null
        exportType.value = null
        lastFileId.value = null
        showScale.value = false
        lastGrayscaleStrength.value = null
        lastBgColor.value = null
        activeTool.value = null
    }

    // History

    function onUndo() {
        imageArea.value?.undo?.()
        lastGrayscaleStrength.value = null
        lastBgColor.value = null
        activeTool.value = null
    }

    function onRedo() {
        imageArea.value?.redo?.()
    }

    function onReset() {
        imageArea.value?.resetToOriginal?.()
        lastGrayscaleStrength.value = null
        lastBgColor.value = null
        activeTool.value = null
    }

    // Crop

    function setCropVisible(visible) {
        imageArea.value?.setOverlayVisible?.(visible)
    }

    function overlayUpdate(overlay) {
        cropWidth.value = overlay.width
        cropHeight.value = overlay.height
        exportSizeDelay(250)
    }

    function cropToContent() {
        imageArea.value?.previewCropToContent()
        recordAction('crop_to_content')
    }

    function previewCrop(size) {
        cropWidth.value = size.width
        cropHeight.value = size.height
        imageArea.value?.showOverlay(size.width, size.height)
    }

    function applyCrop() {
        isEditing.value = true
        imageArea.value?.cropToOverlay()
        recordAction('crop_apply', { width: cropWidth.value, height: cropHeight.value })
    }

    // Background Color

    // null means the image has transparent background, so there is no solid color
    function backgroundColorUpdate(hex) {
        if (hex === null) {
            bgColor.value = '#ffffff'
            isTransparent.value = true
        } else {
            bgColor.value = hex
            isTransparent.value = false
        }

        if (!isEditing.value) {
            lastBgColor.value = null
        }
        exportSizeDelay()
    }

    function previewBgColor(hex) {
        imageArea.value?.previewBackgroundColor(hex)
    }

    function endPreviewBgColor() {
        imageArea.value?.endPreviewBackgroundColor()
    }

    function applyBackgroundColor(color) {
        isEditing.value = true
        imageArea.value?.endPreviewBackgroundColor()
        imageArea.value?.setBackgroundColor(color)
        lastBgColor.value = color
        exportSizeDelay(120)
        recordAction('bgcolor_apply', { color: color })
    }

    function removeBackground() {
        isEditing.value = true
        imageArea.value?.removeBackground?.()
        lastBgColor.value = null
        exportSizeDelay(120)
        recordAction('remove_background')
    }

    // Grayscale

    function previewGrayscale(opts) {
        imageArea.value?.previewGrayscale(opts)
    }

    function endPreviewGrayscale() {
        imageArea.value?.endPreviewGrayscale()
    }

    function applyGrayscale(opts) {
        isEditing.value = true
        imageArea.value?.endPreviewGrayscale()
        imageArea.value?.applyGrayscale(opts)
        lastGrayscaleStrength.value = opts ? opts.strength : null
        recordAction('grayscale_apply', opts || {})
    }

    // JPEG Artifacts

    function highlightArtifacts(color = '#00E5FF') {
        const artifactsParameters = { diffThresh: 1, lowEdge: 40, highEdge: 160, gradLimit: 120 }

        imageArea.value?.highlightJpegArtifacts(color, artifactsParameters)
        recordAction('highlight_artifacts')
    }

    function fixArtifacts() {
        isEditing.value = true
        imageArea.value?.fixJpegArtifacts()
        recordAction('fix_jpeg_artifacts')
    }

    // Blur Tool

    function blurStroke(data) {
        recordAction('blur_stroke', {
            radius: data.radius,
            intensity: data.intensity
        })
    }

    // Mark Tool

    function setActiveTool(toolName) {
        activeTool.value = toolName
    }

    function markShapeDraw(data) {
        recordAction('mark_shape', {
            thickness: data.thickness,
            color: data.color,
            shape: data.shape,
            width: data.width,
            height: data.height
        })
    }

    // Scale, zoom, calibration

    function updateScaleInfo(scaleInfo) {
        const newScale = scaleInfo.displayScale
        const refWidth = scaleInfo.referenceWidthMm
        const minDisplayScale = scaleInfo.minDisplayScale
        const maxDisplayScale = scaleInfo.maxDisplayScale
        displayScale.value = newScale
        referenceWidthMm.value = refWidth

        if (Number.isFinite(minDisplayScale) && Number.isFinite(maxDisplayScale)) {
            minScale.value = Math.max(0.01, minDisplayScale)
            maxScale.value = Math.max(minScale.value, maxDisplayScale)
        }

        showScale.value = true
    }

    function scaleUpdate(newScale) {
        imageArea.value?.setDisplayScale?.(newScale)
    }

    function referenceWidthUpdate(newWidthMm) {
        imageArea.value?.setReferenceWidth?.(newWidthMm)
    }

    async function onResetTo100() {
        await imageArea.value?.resetZoomTo100?.()
    }

    async function openCalibration() {
        try {
            const dpi = await imageArea.value?.openCalibration?.()
            calibrationDpi.value = dpi || 96
            recordAction('calibration')
        } catch (e) {
            calibrationDpi.value = 96
            recordAction('calibration')
        }
    }

    function clearCalibration() {
        calibrationDpi.value = null
        imageArea.value?.clearCalibration?.()
        recordAction('calibration_cleared')
    }

    // Export

    async function updateExportSize(options) {
        const format = options ? options.format : null
        if (format && format !== lastExportFormat.value) {
            analytics.setExportFormat?.(format)
            lastExportFormat.value = format
        }

        exportLoading.value = true

        try {
            const exportResult = await imageArea.value?.prepareExport({ format: lastExportFormat.value })
            exportBytes.value = exportResult ? exportResult.sizeBytes : null
        } finally {
            exportLoading.value = false
        }
    }

    async function refreshExportSize() {
        if (!imageArea.value) {
            exportBytes.value = null
            return
        }

        exportLoading.value = true

        try {
            const result = await imageArea.value.prepareExport({ format: lastExportFormat.value || 'png' })
            exportBytes.value = result ? result.sizeBytes : null
        } finally {
            exportLoading.value = false
        }
    }

    function exportSizeDelay(delay = 200) {
        clearTimeout(exportTimer)
        exportTimer = setTimeout(refreshExportSize, delay)
    }

    async function exportFile(options) {
        const name = options ? options.name : null
        const format = options ? options.format : null
        const targetFormat = format || lastExportFormat.value || 'png'
        const exportResult = await imageArea.value?.prepareExport({ format: targetFormat })

        if (!exportResult?.blob) {
            return
        }

        let exportedBytes = null
        if (exportResult && exportResult.sizeBytes) {
            exportedBytes = exportResult.sizeBytes
        } else if (exportResult && exportResult.blob) {
            exportedBytes = exportResult.blob.size
        }
        recordAction('export', {
            format: targetFormat,
            bytes: exportedBytes
        })

        if (!analytics.hasActive?.()) {
            analytics.startSession()
        }

        const fileExtension = exportResult.fileExtension || targetFormat || 'png'
        const url = URL.createObjectURL(exportResult.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(name || 'export').trim()}.${fileExtension}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        // wait a short time before removing the URL, so the download can start
        setTimeout(function() {
            URL.revokeObjectURL(url)
        }, 100)
        analytics.endSession({ actions: actionsPerformed.value })
        actionsPerformed.value = []
    }

    // get the file that was dropped on the landing page
    onMounted(async function() {
        const file = consumePendingFile()

        if (!file) {
            return
        }

        // wait for ImageArea to be ready before using its methods
        await nextTick()
        if (imageArea.value?.loadExternalFile) {
            await imageArea.value.loadExternalFile(file)
        }
    })

    onMounted(function() {
        if (typeof window === 'undefined') {
            return
        }

        analytics.bindUnloadOnce?.()
        
        // restore the DPI calibration from the last session if it looks like a sane value
        const saved = parseFloat(localStorage.getItem('imageDrop.cssBaseDpi'))

        if (Number.isFinite(saved) && saved > 20 && saved < 2000) {
            calibrationDpi.value = saved
        }
    })

    onUnmounted(function() {
        clearTimeout(exportTimer)
    })
</script>

<style>
    html, body, #app {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
    }

    .app-container {
        display: flex;
        width: 100vw;
        height: 100%;
    }

    p {
        color: black !important;
    }

    .topbar{
        position: fixed;
        top: 0;
        left: 0;
        background: #ffffff;
        border-bottom: 1px solid #e6e6e6;
        z-index: 90;
        display: flex;
        align-items: center;
    }

    .topbar-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .75rem;
        padding: 0 .75rem;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
    }

    .logo {
        height: 70%;
        max-height: 28px;
        display: block;
    }
</style>
