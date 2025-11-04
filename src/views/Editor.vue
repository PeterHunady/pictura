<template>
    <div class="app-container">
        <TopBar
            :isCalibrated="isCalibrated"
            :show-scale="showScale"
            :display-scale="displayScale"
            :reference-width-mm="referenceWidthMm"
            :min-scale="minScale"
            :max-scale="maxScale"
            @update:scale="onScaleUpdate"
            @update:reference-width="onReferenceWidthUpdate"
            @visible="onToggleCropVisible"
            @undo="onUndo"
            @reset="onReset"
            @calibrate="onOpenCalibration"
            @clear-calibration="onClearCalibration"
        />

        <ImageDrop
            :right-gap="rightGap"
            :top-gap="topGap"
            ref="dropRef"
            @update:preview="imagePreview = $event"
            @update:meta="onMetaUpdate"
            @update:overlay="onOverlayUpdate"
            @update:bgcolor="onBgColorUpdate"
            @update:scale="onScaleUpdateFromDrop"
            @update:has-alpha="isTransparent = $event"
        />

        <Sidebar
            v-model="sidebarCollapsed"
            :meta="imageMeta"
            :initial-size="{ width: cropWidth, height: cropHeight }"
            :initialColor="bgColor"
            :export-bytes="exportPreviewBytes"
            :export-loading="exportLoading"
            :bg-transparent="isTransparent" 
            :export-suggested-name="exportName"
            :export-suggested-type="exportType"
            :top-gap="topGap"
            @download="onDownload"
            @clear="onClear"
            @crop="onCropToContent"
            @preview-crop="onPreviewCrop"
            @resize-crop="onApplyCrop"
            @fix-artifacts="onFixArtifacts"
            @apply-color="onApplyBgColor"
            @highlight-artifacts="onHighlightArtifacts"
            @apply-grayscale="onApplyGrayscale"
            @preview-grayscale="onPreviewGrayscale"
            @end-preview-grayscale="onEndPreviewGrayscale"
            @preview-color="onPreviewBgColor"
            @end-preview-color="onEndPreviewBgColor"
            @request-export-preview="onRequestExportPreview"
            @export="onExport"
            @remove-background="onRemoveBackground"
        />

        <PageGalleryDialog
            v-if="showPageDlg"
            :src="imagePreview"
            :pages="totalPages"
            v-model="pickPage"
            @confirm="onConfirmPage"
            @cancel="showPageDlg = false"
        />
    </div>
</template>

<script setup>
    import { ref, computed, onUnmounted, onMounted, nextTick } from 'vue'
    import { consumePendingFile } from '@/composables/usePendingFile'
    import ImageDrop from '@/components/ImageDrop.vue'
    import Sidebar from '@/components/Sidebar.vue'
    import PageGalleryDialog from '@/components/PageGalleryDialog.vue'
    import TopBar from '@/components/TopBar.vue'
    import * as analytics from '@/analytics'

    const dropRef = ref(null)
    const imagePreview = ref(null)
    const imageMeta = ref(null)
    const cropWidth = ref(0)
    const cropHeight = ref(0)
    const bgColor = ref('#ffffff')
    const isTransparent = ref(false)
    const showPageDlg = ref(false)
    const totalPages = ref(1)
    const pickPage = ref(1)
    const lastDocSig = ref(null)

    const displayScale = ref(100)
    const referenceWidthMm = ref(210)
    const calibrationBaseCssDpi = ref(null)
    const showScale = ref(false)
    const minScale = ref(1)
    const maxScale = ref(10000)

    const exportName = ref(null)
    const exportType = ref(null)
    const editingNow = ref(false)
    const sourceSig = ref(null)
    const isCalibrated = computed(() => calibrationBaseCssDpi.value != null)

    onMounted(() => {
        if (typeof window === 'undefined') return
        const saved = parseFloat(localStorage.getItem('imageDrop.cssBaseDpi'))
        if (Number.isFinite(saved) && saved > 20 && saved < 2000) {
            calibrationBaseCssDpi.value = saved
        }
    })

    const sidebarCollapsed = ref(false)
    const rightGap = computed(() =>
        sidebarCollapsed.value ? '30px' : 'min(30vw, 300px)'
    )

    const topGap = '48px'

    const initialDoc = ref(null)
    const actionsPerformed = ref([])

    function recordAction(name, data) {
        actionsPerformed.value.push({ t: name, ...(data || {}) })
    }

    function onUndo() {
        dropRef.value?.undo?.()
        recordAction('undo')
    }

    function onReset() {
        dropRef.value?.resetToOriginal?.()
        recordAction('reset')
    }

    function onToggleCropVisible(visible) {
        dropRef.value?.toggleOverlayVisibility?.(visible)
    }

    async function onOpenCalibration() {
        try {
            const dpi = await dropRef.value?.openCalibration?.()
            calibrationBaseCssDpi.value = dpi || 96
            recordAction('calibration')
        } catch (e) {
            calibrationBaseCssDpi.value = 96
            recordAction('calibration')
        }
    }

    function onClearCalibration() {
        calibrationBaseCssDpi.value = null
        dropRef.value?.clearCalibration?.()
        recordAction('calibration_cleared')
    }

    onMounted(async () => {
        const f = consumePendingFile()
        if (!f) return
        await nextTick()
        if (dropRef.value?.loadExternalFile) {
            await dropRef.value.loadExternalFile(f)
        }
    })

    const exportPreviewBytes = ref(null)
    const exportLoading = ref(false)
    const lastExportFormat = ref('png')
    let exportTimer = null

    async function onRequestExportPreview({ name, format }) {
        const prev = lastExportFormat.value
        if (format && format !== prev) {
            recordAction('export_format_change', { from: prev, to: format })
            lastExportFormat.value = format
        }


        if (format) lastExportFormat.value = format
        exportLoading.value = true
        try {
            const res = await dropRef.value?.estimateExport({ format: lastExportFormat.value })
            exportPreviewBytes.value = res?.sizeBytes ?? null
        } finally {
            exportLoading.value = false
    }
    }

    async function recalcExportPreview() {
        if (!dropRef.value) {
            exportPreviewBytes.value = null
            return
        }
        exportLoading.value = true

        try {
            const { sizeBytes } = (await dropRef.value.estimateExport({format: lastExportFormat.value || 'png'})) || {}
            exportPreviewBytes.value = sizeBytes ?? null
        } finally {
            exportLoading.value = false
        }
    }

    function scheduleExportRecalc(delay = 200) {
        clearTimeout(exportTimer)
        exportTimer = setTimeout(recalcExportPreview, delay)
    }

    onUnmounted(() => clearTimeout(exportTimer))

    async function onExport({ name, format }) {
        const finalFormat = format || lastExportFormat.value || 'png'

        const res = await dropRef.value?.estimateExport({ format })
        if (!res?.blob) return

        recordAction('export', {
            format: finalFormat,
            bytes: res?.sizeBytes ?? res?.blob?.size ?? null
        })

        if (!analytics.hasActive?.()) analytics.startSession()

        const ext = res.ext || format || 'png'
        const a = document.createElement('a')
        a.href = URL.createObjectURL(res.blob)
        a.download = `${(name || 'export').trim()}.${ext}`
        a.click()
        URL.revokeObjectURL(a.href)

        analytics.endSession({
            actions: actionsPerformed.value
        })

        actionsPerformed.value = []
    }

    function onPreviewGrayscale(opts) {
        dropRef.value?.previewGrayscale(opts)
    }

    function onEndPreviewGrayscale() {
        dropRef.value?.endPreviewGrayscale()
    }
    
    function onPreviewBgColor(hex) {
        dropRef.value?.previewBackgroundColor(hex)
    }

    function onEndPreviewBgColor() {
        dropRef.value?.endPreviewBackgroundColor()
    }

    function onRemoveBackground() {
        editingNow.value = true
        dropRef.value?.removeBackground?.()
        scheduleExportRecalc(120)
        recordAction('remove_background')
    }

    function onBgColorUpdate(hex) {
        if (hex === null) {
            bgColor.value = '#ffffff'
            isTransparent.value = true
        } else {
            bgColor.value = hex
            isTransparent.value = false
        }
        scheduleExportRecalc()
    }

    function onApplyGrayscale(opts) {
        editingNow.value = true
        dropRef.value?.endPreviewGrayscale()
        dropRef.value?.applyGrayscale(opts)
        recordAction('grayscale_apply', opts || {})
    }

    function onHighlightArtifacts(color = '#00E5FF') {
        const params = { diffThresh: 8, lowEdge: 25, highEdge: 100, dilate: 3 }
        dropRef.value?.highlightJpegArtifacts(color, params)
        recordAction('highlight_artifacts', { color, ...params })
    }

    function onApplyBgColor(color) {
        editingNow.value = true
        dropRef.value?.endPreviewBackgroundColor()
        dropRef.value?.setBackgroundColor(color)
        scheduleExportRecalc(120)
        recordAction('bgcolor_apply', { color })
    }

    function onMetaUpdate(meta) {
        imageMeta.value = meta
        cropWidth.value = meta?.width || 0
        cropHeight.value = meta?.height || 0

        const sig = meta?.docSig || `${meta?.name}|${meta?.size}|${meta?.lastModified}`
        const isNewDoc = sig !== sourceSig.value && !editingNow.value

        if (isNewDoc) {
            if (!analytics.hasActive?.()) analytics.startSession()
            exportName.value = meta?.name || 'export'
            exportType.value = meta?.type || ''

            initialDoc.value = {
            name: meta?.name, type: meta?.type, size: meta?.size,
            width: meta?.width, height: meta?.height,
            pages: meta?.pages || 1, page: meta?.page || 1
            }
        }

        if (
            meta?.type === 'application/pdf' &&
            (meta.pages || 1) > 1 &&
            meta.page === 1 &&
            meta.docSig !== lastDocSig.value &&
            !meta.noGallery
        ) {
            const sg = meta.docSig || `${meta.name}|${meta.size}|${meta.lastModified}`
            if (sg !== lastDocSig.value) {
            lastDocSig.value = sg
            totalPages.value = meta.pages
            pickPage.value = meta.page || 1
            showPageDlg.value = true
            }
        }

        if (meta) {
            dropRef.value.showOverlay(meta.width, meta.height)
        }

        sourceSig.value = sig
        editingNow.value = false
        scheduleExportRecalc(80)
    }

    function onOverlayUpdate({ width, height }) {
        cropWidth.value = width
        cropHeight.value = height
        scheduleExportRecalc(250)
    }

    function onCropToContent() {
        dropRef.value?.previewCropToContent()
        recordAction('crop_to_content')
    }

    function onConfirmPage(n) {
        dropRef.value?.setPdfPage(n)
        showPageDlg.value = false
        recordAction('pdf_page_selected')
    }

    function onDownload() {
        dropRef.value?.download()
    }

    function onClear() {
        dropRef.value?.clear()
        imagePreview.value = null
        imageMeta.value = null
        cropWidth.value = 0
        cropHeight.value = 0
        lastDocSig.value = null
        exportPreviewBytes.value = null
        exportLoading.value = false
        lastExportFormat.value = 'png'
        exportName.value = null
        exportType.value = null
        sourceSig.value = null
        showScale.value = false
    }

    function onFixArtifacts() {
        editingNow.value = true
        dropRef.value?.fixJpegArtifacts()
        recordAction('fix_jpeg_artifacts')
    }

    function onPreviewCrop(size) {
        cropWidth.value = size.width
        cropHeight.value = size.height
        dropRef.value?.showOverlay(size.width, size.height)
    }

    function onApplyCrop() {
        editingNow.value = true
        dropRef.value?.cropToOverlay()
        recordAction('crop_apply', { width: cropWidth.value, height: cropHeight.value })
    }

    function onScaleUpdateFromDrop({ displayScale: newScale, referenceWidthMm: refWidth, minDisplayScale, maxDisplayScale }) {
        displayScale.value = newScale
        referenceWidthMm.value = refWidth

        if (Number.isFinite(minDisplayScale) && Number.isFinite(maxDisplayScale)) {
            minScale.value = Math.max(0.01, minDisplayScale)
            maxScale.value = Math.max(minScale.value, maxDisplayScale)
        }
        if (imageMeta.value) showScale.value = true
    }

    function onScaleUpdate(newScale) {
        dropRef.value?.setDisplayScale?.(newScale)
    }

    function onReferenceWidthUpdate(newWidthMm) {
        dropRef.value?.setReferenceWidth?.(newWidthMm)
    }
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

    .tabs {
        display: flex;
        align-items: center;
        gap: .25rem;
    }

    .tab {
        border: 1px solid #ddd;
        background: #f7f7f7;
        padding: .2rem .5rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
    }

    .tab.active {
        background:#ececec;
    }
</style>
