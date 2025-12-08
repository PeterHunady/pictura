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
              <strong v-else>{{ prettySize }}</strong>
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

  function baseName(n) {
    if(!n) {
      return 'export'
    }

    const i = n.lastIndexOf('.')
    return i > 0 ? n.slice(0,i) : n 
  }

  function inferFormat(s = '') {
    s = s.toLowerCase()
    if (s.includes('pdf')) {
      return 'pdf'
    }

    if (s.includes('jpeg') || s.includes('jpg')){
      return 'jpg'
    }

    if (s.includes('png')) {
      return 'png'
    }

    const m = s.match(/\.([a-z0-9]+)$/)
    const ext = m?.[1]
    
    if (ext==='pdf') {
      return 'pdf'
    }

    if (ext==='jpg' || ext==='jpeg') {
      return 'jpg'
    }

    if (ext==='png') {
      return 'png'
    }

    return 'png'
  }

  function applySuggested(){
    name.value = baseName(props.suggestedName || 'export')
    format.value = inferFormat(props.suggestedType || props.suggestedName)
  }

  applySuggested()
  watch(() => [props.suggestedName, props.suggestedType], applySuggested)

  let t = null
  watch([name, format], ([n,f]) => {
    clearTimeout(t)
    t = setTimeout(() => emit('request-preview', { name: n, format: f }), 150)
  }, { immediate: true })

  onBeforeUnmount(() => clearTimeout(t))

  function onSave(){
    emit('export', { name: name.value, format: format.value })
  }

  const prettySize = computed(() => {
    const b = props.sizeHint
    if (b == null) {
      return '—'
    }

    const kb = b / 1024
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb/1024).toFixed(2)} MB`
  })

  const onEnter = (el) => {
    el.style.height = '0px'
    el.style.opacity = '0'

    const target = el.scrollHeight

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.3s ease, opacity 0.3s ease'
      el.style.height = target + 'px'
      el.style.opacity = '1'
    })
  }

  const onAfterEnter = (el) => {
    el.style.height = 'auto'
    el.style.transition = ''
  }

  const onLeave = (el) => {
    el.style.height = el.scrollHeight + 'px'
    el.style.opacity = '1'
    void el.offsetHeight

    el.style.transition = 'height 0.3s ease-out, opacity 0.3s ease-out'
    el.style.height = '0px'
    el.style.opacity = '0'
  }
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
