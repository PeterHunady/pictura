<template>
    <div class="app-container">
        <ImageDrop
            :key="imageKey"          
            ref="dropRef"
            @update:preview="imagePreview = $event"
            @update:meta ="onMetaUpdate"
            @update:overlay="onOverlayUpdate"
        />

        <Sidebar
            :meta="imageMeta"
            :initial-size="{ width: cropWidth, height: cropHeight }"
            @download ="onDownload"
            @clear ="onClear"
            @crop ="onCropToContent"
            @preview-crop ="onPreviewCrop"
            @resize-crop ="onApplyCrop"
        />
    </div>
</template>

<script setup>
    import { ref } from 'vue'
    import ImageDrop from './components/ImageDrop.vue'
    import Sidebar from './components/Sidebar.vue'

    const dropRef = ref(null)
    const imagePreview = ref(null)
    const imageMeta = ref(null)
    const cropWidth = ref(0)
    const cropHeight = ref(0)
    const imageKey = ref(0)

    function onMetaUpdate(meta) {
        imageMeta.value = meta
        cropWidth.value = meta?.width  || 0
        cropHeight.value = meta?.height || 0
        if (meta) dropRef.value.showOverlay(meta.width, meta.height)
    }

    function onOverlayUpdate({ width, height }) {
        cropWidth.value = width
        cropHeight.value = height
    }

    function onDownload() {
        if (!imagePreview.value) return
        const a = document.createElement('a')
        a.href = imagePreview.value
        a.download = imageMeta.value?.name || 'image.png'
        a.click()
    }

    function onClear() {
        dropRef.value.clear()
        imagePreview.value = null
        imageMeta.value = null
        cropWidth.value = 0
        cropHeight.value = 0
        imageKey.value++
    }

    function onCropToContent() {
        dropRef.value.previewCropToContent()
    }

    function onPreviewCrop({ width, height }) {
        cropWidth.value = width
        cropHeight.value = height
        dropRef.value.showOverlay(width, height)
    }

    function onApplyCrop() {
        dropRef.value.cropToOverlay()
    }
</script>

<style>
    html, body, #app {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        color: black;
    }

    .app-container {
        display: flex;
        width: 100vw;
        height: 100%;
    }
</style>
