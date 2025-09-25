<template>
  <div class="export export-control">
    <button class="export-toggle" @click="collapsed = !collapsed">
      <span>Export</span>
      <span :class="collapsed ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <div v-show="!collapsed" class="export-panel">
      <div class="row">
        <label for="exp-name">File name</label>
        <input id="exp-name" type="text" v-model.trim="name" />
      </div>

      <div class="row">
        <label for="exp-format">Format</label>
        <select id="exp-format" v-model="format">
          <option value="pdf">PDF</option>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
      </div>

      <div class="hint">
        <span>Estimated size:</span>
        <strong v-if="loading">…</strong>
        <strong v-else>{{ prettySize }}</strong>
      </div>

      <button class="save-btn" :disabled="!name" @click="onSave">Save</button>
    </div>
  </div>
</template>

<script setup>
  import { ref, watch, computed, onBeforeUnmount } from 'vue'

  const props = defineProps({
      suggestedName: { type: String, default: 'export' },
      suggestedType: { type: String, default: '' },
      sizeHint: { type: Number, default: null },  
      loading: { type: Boolean, default: false }
  })

  const emit = defineEmits(['export','request-preview'])

  const collapsed = ref(true)
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
</script>

<style scoped>
  .export {
    margin-top: 1rem;
  }

  .export-toggle {
    width: 100%;
    padding: .7rem;
    background: rgba(0,0,0,.05);
    border: none;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .export-toggle span {
    font-size: 24px;
  }

  .export-panel {
    padding: .75rem;
  }

  .row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: .75rem;
    align-items: center;
    margin-bottom: .75rem;
  }

  .row label {
    font-weight: 600;
    color: #000;
  }

  .row input[type="text"], .row select {
    width: 100%;
    padding: .4rem;
    border: 1px solid #ccc;
    border-radius: 6px;
  }

  .hint{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .5rem .6rem;
    margin-bottom: .75rem;
    border: 1px dashed #e0e0e0;
    border-radius: 8px;
    background: #fafafa;
    font-size: .95rem;
  }

  .hint span{
    color:#333;
  }

  .hint strong{
    color:#000;
  }

  .save-btn {
    width: 100%;
    padding: .6rem 1rem;
    border: none;
    border-radius: 6px;
    background: #28a745;
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }

  .save-btn:disabled {
    opacity: .6;
    cursor: not-allowed;
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
</style>
