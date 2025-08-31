<template>
  <div class="app-container">
    <ImageDrop
      ref="dropRef"
      @update:preview="imagePreview = $event"
      @update:meta="onMetaUpdate"
      @update:overlay="onOverlayUpdate"
      @update:bgcolor="onBgColorUpdate"
    />

    <Sidebar
      :meta="imageMeta"
      :initial-size="{ width: cropWidth, height: cropHeight }"
      :initialColor="bgColor"         
      @download="onDownload"
      @clear="onClear"
      @crop="onCropToContent"
      @preview-crop="onPreviewCrop"
      @resize-crop="onApplyCrop"
      @fix-artifacts="onFixArtifacts"
      @apply-color="onApplyBgColor"
      @highlight-artifacts="onHighlightArtifacts"
      @apply-grayscale="onApplyGrayscale"
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
  import { ref } from 'vue'
  import ImageDrop from './components/ImageDrop.vue'
  import Sidebar from './components/Sidebar.vue'
  import PageGalleryDialog from './components/PageGalleryDialog.vue'

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

  function onBgColorUpdate(hex) {
    bgColor.value = hex
  }

  function onApplyBgColor(color) {
    dropRef.value?.setBackgroundColor(color)
  }

  function onHighlightArtifacts(color='#00E5FF') {
    dropRef.value?.highlightJpegArtifacts(color, { diffThresh:12, lowEdge:40, highEdge:150, dilate:1 })
  }

  function onApplyGrayscale(opts) {
    dropRef.value?.applyGrayscale(opts)
  }

  function onMetaUpdate(meta) {
    imageMeta.value = meta
    cropWidth.value = meta?.width  || 0
    cropHeight.value = meta?.height || 0

    if (meta?.type === 'application/pdf' && (meta.pages || 1) > 1 && meta.page === 1 && meta.docSig !== lastDocSig.value && !meta.noGallery) {
      const sig = meta.docSig || `${meta.name}|${meta.size}|${meta.lastModified}`

      if (sig !== lastDocSig.value) {
        lastDocSig.value = sig
        totalPages.value = meta.pages
        pickPage.value = meta.page || 1
        showPageDlg.value = true
      }
    }else {
      lastDocSig.value = null
    }

    if (meta) dropRef.value.showOverlay(meta.width, meta.height)
  }

  function onOverlayUpdate({ width, height }) {
    cropWidth.value = width
    cropHeight.value = height
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
  }

  function onFixArtifacts() { 
    dropRef.value?.fixJpegArtifacts() 
  }

  function onCropToContent() { 
    dropRef.value?.previewCropToContent() 
  }

  function onPreviewCrop(size) { 
    cropWidth.value=size.width; cropHeight.value=size.height; dropRef.value?.showOverlay(size.width, size.height) 
  }

  function onApplyCrop() { 
    dropRef.value?.cropToOverlay()
  }

  function onConfirmPage(n) {
    dropRef.value?.setPdfPage(n)
    showPageDlg.value = false
  }
</script>

<style>
  html, body, #app {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
  }
  .app-container {
    display: flex;
    width: 100vw; height: 100%;
  }

  p {
    color: black !important;
  }
</style>
