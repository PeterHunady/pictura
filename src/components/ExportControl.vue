<!--
  Author: Peter Huňady (xhunadp00)
  File: ExportControl.vue
  Bachelor's Thesis, VUT Brno, 2026
-->

<template>
  <div class="export export-control">
    <button class="export-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="export-toggle-left">
        <img :src="exportIcon" alt="Export" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Export</span>
      </span>
      <span :class="!isOpen ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <transition
      name="accordion"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @leave="onLeave"
    >
      <div v-show="isOpen" class="slide-wrapper">
        <div class="export-panel">
          <div v-if="suggestedName">
            <div class="row ty-body-medium">
              <label for="exp-name">File name</label>
              <input
                id="exp-name"
                type="text"
                class="ty-body-small"
                v-model.trim="name"
              />
            </div>

            <div class="row ty-body-medium">
              <label for="exp-format" class="ty-body-medium">Format</label>
              <select
                id="exp-format"
                v-model="format"
                class="ty-body-small"
              >
                <option value="pdf">PDF</option>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </div>

            <div class="hint ty-body-medium">
              <span>Estimated size:</span>
              <strong v-if="loading">…</strong>
              <strong v-else>{{ fileSizeText }}</strong>
            </div>

            <button
              class="save-btn ty-body-small bg-lime500"
              :disabled="!name"
              @click="onSave"
            >
              Save
            </button>
          </div>

          <p v-else class="no-image">No image loaded.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
  import { ref, watch, computed, onBeforeUnmount } from 'vue'
  import exportIcon from '@/assets/export.svg'

  const props = defineProps({
    suggestedName: { type: String, default: 'export' },
    suggestedType: { type: String, default: '' },
    sizeHint: { type: Number, default: null },
    loading: { type: Boolean, default: false },
    isOpen: { type: Boolean, default: false }
  })

  const emit = defineEmits(['export','request-preview','toggle'])
  const name = ref('')
  const format = ref('png')

  const fileSizeText = computed(() => {
    const bytes = props.sizeHint
    if (bytes == null) {
      return '—'
    }

    const kb = bytes / 1024
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`
    }

    return `${(kb / 1024).toFixed(2)} MB`
  })

  function baseName(fileName) {
    if(!fileName) {
      return 'export'
    }

    const dotIndex = fileName.lastIndexOf('.')
    
    // use dotIndex > 0 so files like .gitignore are not handled as files with an extension
    if (dotIndex > 0) {
      return fileName.slice(0, dotIndex)
    }
    return fileName
  }

  // check both the file type text and the file extension
  // suggestedType can have the file type, but suggestedName can have the extension
  function detectFileFormat(fileInfo = '') {
    fileInfo = fileInfo.toLowerCase()
    if (fileInfo.includes('pdf')) {
      return 'pdf'
    }

    if (fileInfo.includes('jpeg') || fileInfo.includes('jpg')){
      return 'jpg'
    }

    if (fileInfo.includes('png')) {
      return 'png'
    }

    const suffixMatch = fileInfo.match(/\.([a-z0-9]+)$/)
    const suffix = suffixMatch?.[1]
    
    if (suffix==='pdf') {
      return 'pdf'
    }

    if (suffix==='jpg' || suffix==='jpeg') {
      return 'jpg'
    }

    if (suffix==='png') {
      return 'png'
    }

    return 'png'
  }

  // use suggestedName to detect the format when suggestedType is empty
  function setExportInfo(){
    name.value = baseName(props.suggestedName || 'export')
    format.value = detectFileFormat(props.suggestedType || props.suggestedName)
  }

  function onSave(){
    emit('export', { name: name.value, format: format.value })
  }

  function onEnter(el) {
    el.style.height = '0px'
    el.style.opacity = '0'

    const target = el.scrollHeight

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.3s ease, opacity 0.3s ease'
      el.style.height = target + 'px'
      el.style.opacity = '1'
    })
  }

  function onAfterEnter(el) {
    el.style.height = 'auto'
    el.style.transition = ''
  }

  function onLeave(el) {
    el.style.height = el.scrollHeight + 'px'
    el.style.opacity = '1'
    el.offsetHeight

    el.style.transition = 'height 0.3s ease-out, opacity 0.3s ease-out'
    el.style.height = '0px'
    el.style.opacity = '0'
  }

  // run this when the component starts and when the suggested file info changes
  setExportInfo()
  watch(() => props.suggestedName, setExportInfo)
  watch(() => props.suggestedType, setExportInfo)

  // wait a short time, so the size check is not called after every typed letter
  // run the first size check when the component starts
  let exportSizeTimer = null
  watch([name, format], () => {
    clearTimeout(exportSizeTimer)
    exportSizeTimer = setTimeout(() => emit('request-preview', { name: name.value, format: format.value }), 150)
  }, { immediate: true })

  onBeforeUnmount(() => clearTimeout(exportSizeTimer))
</script>

<style scoped>
  .export {
    margin-top: 1rem;
  }

  .export-toggle {
    width: 100%;
    padding: .7rem;
    border: none;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .export-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-icon {
    width: 20px;
    height: 20px;
    display: block;
  }

  .export-panel {
    padding: .75rem;
    padding-top: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: .75rem;
    align-items: center;
    margin-bottom: .75rem;
  }

  .row label {
    font-weight: 500;
    color: #000;
  }

  .row input[type="text"], .row select {
    width: 100%;
    padding: .4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .hint{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .5rem .6rem;
    margin-bottom: 1rem;
    border: 1px dashed #e0e0e0;
    border-radius: 4px;
  }

  .hint span{
    color:#333;
  }

  .hint strong{
    color:#000;
  }

  .save-btn {
    width: 100%;
    padding: .5rem 0;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }

  .arrow-right, .arrow-down {
    width: 0;
    height: 0;
    display: inline-block;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  .arrow-right {
    border-left: 8px solid #333;
  }

  .arrow-down {
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #333;
  }

  .no-image {
    padding: 0.5rem;
    font-style: italic;
    color: #666;
  }

  .slide-wrapper {
    overflow: hidden;
  }
</style>
