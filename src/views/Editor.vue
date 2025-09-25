<template>
    <div class="app-container">
        <TopBar
            :right-gap="rightGap"
            :top-gap="topGap"
            :show-actions="true"
            @undo="onUndo"
            @reset="onReset"
        />

        <ImageDrop
            :right-gap="rightGap" 
            :top-gap="topGap"
            ref="dropRef"
            @update:preview="imagePreview = $event"
            @update:meta="onMetaUpdate"
            @update:overlay="onOverlayUpdate"
            @update:bgcolor="onBgColorUpdate"
        />

        <Sidebar
            v-model="sidebarCollapsed"
            :meta="imageMeta"
            :initial-size="{ width: cropWidth, height: cropHeight }"
            :initialColor="bgColor"
            :export-bytes="exportPreviewBytes"
            :export-loading="exportLoading"

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
    import { ref, computed, onUnmounted, onMounted, nextTick  } from 'vue'
    import { consumePendingFile } from '@/composables/usePendingFile'
    import ImageDrop from '@/components/ImageDrop.vue'
    import Sidebar from '@/components/Sidebar.vue'
    import PageGalleryDialog from '@/components/PageGalleryDialog.vue'
    import TopBar from '@/components/TopBar.vue'

    const dropRef = ref(null)
    const imagePreview = ref(null)
    const imageMeta = ref(null)
    const cropWidth = ref(0)
    const cropHeight = ref(0)
    const bgColor = ref('#ffffff')
    const showPageDlg = ref(false)
    const totalPages = ref(1)
    const pickPage = ref(1)
    const lastDocSig = ref(null)

    const exportName = ref(null)
    const exportType = ref(null)
    const editingNow = ref(false)
    const sourceSig = ref(null) 

    const sidebarCollapsed = ref(false)
    const rightGap = computed(() =>
        sidebarCollapsed.value ? '30px' : 'min(30vw, 300px)'
    )

    const topGap = '48px'

    function onUndo() {
        dropRef.value?.undo?.()
    }
    
    function onReset() {
        dropRef.value?.resetToOriginal?.()
    }

    onMounted(async () => {
        const f = consumePendingFile()
        if (!f) {
            return
        }

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
        if (format) {
            lastExportFormat.value = format
        }
        exportLoading.value = true

        try {
            const res = await dropRef.value?.estimateExport({ format: lastExportFormat.value })
            exportPreviewBytes.value = res?.sizeBytes ?? null
        } finally {
            exportLoading.value = false
        }
    }

  async function recalcExportPreview () {
    if (!dropRef.value) {
        exportPreviewBytes.value = null;
        return
    }
    exportLoading.value = true

    try {
      const { sizeBytes } = await dropRef.value.estimateExport({
        format: lastExportFormat.value || 'png'
      }) || {}

      exportPreviewBytes.value = sizeBytes ?? null
    } finally {
      exportLoading.value = false
    }
  }

    function scheduleExportRecalc (delay = 200) {
        clearTimeout(exportTimer)
        exportTimer = setTimeout(recalcExportPreview, delay)
    }

    onUnmounted(() => clearTimeout(exportTimer))

    async function onExport({ name, format }) {
        const res = await dropRef.value?.estimateExport({ format })
        if (!res?.blob) {
            return
        }

        const ext = res.ext || format || 'png'
        const a = document.createElement('a')

        a.href = URL.createObjectURL(res.blob)
        a.download = `${(name || 'export').trim()}.${ext}`
        a.click()
        URL.revokeObjectURL(a.href)
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

    function onBgColorUpdate(hex) {
        bgColor.value = hex
        scheduleExportRecalc()
    }

    function onApplyGrayscale(opts) {
        editingNow.value = true
        dropRef.value?.endPreviewGrayscale()
        dropRef.value?.applyGrayscale(opts)
    }

    function onHighlightArtifacts(color='#00E5FF') {
        dropRef.value?.highlightJpegArtifacts(color, { diffThresh:12, lowEdge:40, highEdge:150, dilate:1 })
    }

    function onApplyBgColor(color) {
    editingNow.value = true
    dropRef.value?.endPreviewBackgroundColor()
    dropRef.value?.setBackgroundColor(color)
    scheduleExportRecalc(120)
    }

    function onMetaUpdate(meta) {
        imageMeta.value = meta
        cropWidth.value  = meta?.width  || 0
        cropHeight.value = meta?.height || 0

        const sig = meta?.docSig || `${meta?.name}|${meta?.size}|${meta?.lastModified}`
        const isNewDoc = sig !== sourceSig.value && !editingNow.value

        if (isNewDoc) {
            exportName.value = meta?.name || 'export'
            exportType.value = meta?.type || ''
        }

        if (meta?.type === 'application/pdf' && (meta.pages || 1) > 1 && meta.page === 1 && meta.docSig !== lastDocSig.value && !meta.noGallery) {
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
    }

    function onFixArtifacts() { 
        editingNow.value = true
        dropRef.value?.fixJpegArtifacts() 
    }

    function onCropToContent() { 
        dropRef.value?.previewCropToContent() 
    }

    function onPreviewCrop(size) { 
        cropWidth.value=size.width
        cropHeight.value=size.height
        dropRef.value?.showOverlay(size.width, size.height) 
    }

    function onApplyCrop() { 
        editingNow.value = true
        dropRef.value?.cropToOverlay()
    }

    function onConfirmPage(n) {
        dropRef.value?.setPdfPage(n)
        showPageDlg.value = false
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
