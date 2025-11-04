<template>
  <div class="background-color-control">
    <button class="control-toggle" @click="toggle">
      <span>Background Color</span>
      <span :class="collapsed ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <div v-show="!collapsed" class="control-panel">
      <div class="field">
        <label for="bg-color-input">Hex Color</label>

        <input
          id="bg-color-input"
          type="text"
          :value="bgTransparent ? 'transparent' : color"
          @input="onColorInput"
          :placeholder="bgTransparent ? 'transparent' : '#ffffff'"
        />

        <div
          class="color-box"
          :style="{ backgroundColor: normalizedColor ?? '#ffffff' }"
          @click="openPicker">
        </div>

        <input
          ref="picker"
          type="color"
          v-model="color"
          class="native-picker"
        />
      </div>

      <div class="btn-row">
        <button class="apply-btn" @click="applyColor">
          Apply
        </button>

        <button 
          class="remove-btn"
          @click="removeBackground"
          :disabled="bgTransparent"
        >
          Remove Background
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'

  const props = defineProps({
    initialColor: { type: String, default: '#ffffff' },
    bgTransparent: { type: Boolean, default: false }
  })

  const emit = defineEmits(['apply-color', 'preview-color', 'end-preview-color', 'remove-background'])

  const collapsed = ref(true)
  const color = ref(props.initialColor)
  const picker = ref(null)
  const normalizedColor = computed(() => normalizeHex(color.value))

  function onColorInput(e) {
    if (!props.bgTransparent) {
      color.value = e.target.value
    }
  }

  function openPicker() {
    if (picker.value) {
      picker.value.click()
    }
  }

  function normalizeHex (val) {
    const s = String(val || '').trim()
    const m6 = s.match(/^#?([0-9a-fA-F]{6})$/)

    if (m6) { 
      return `#${m6[1].toLowerCase()}`
    }

    const m3 = s.match(/^#?([0-9a-fA-F]{3})$/)

    if (m3) { 
      return `#${m3[1].split('').map(c => c + c).join('').toLowerCase()}`
    }

    return null
  }

  function applyColor() {
    emit('apply-color', normalizedColor.value ?? '#ffffff')
  }

  function removeBackground() {
    emit('remove-background')
  }

  let previewTimer = null
  watch(color, (v) => {
    if (collapsed.value){ 
      return 
    }

    const hx = normalizeHex(v)
    if (!hx){ 
      return 
    }

    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => emit('preview-color', hx), 80)
  })

  function toggle () {
    collapsed.value = !collapsed.value
    if (collapsed.value) {
      emit('end-preview-color')
    }
  }

  onMounted(() => {
    color.value = props.initialColor
  })
  
  watch(() => props.initialColor, (v) => {
    color.value = v
  })

  watch(() => props.bgTransparent, (v) => {
    if (v) color.value = ''
  })

  onBeforeUnmount(() => {
    if (previewTimer) {
      clearTimeout(previewTimer)
    }

    emit('end-preview-color')
  })
</script>

<style scoped>
  .background-color-control { 
    margin-top: 1rem; 
  }

  .control-toggle {
    width: 100%; 
    padding: 0.7rem; 
    background: rgba(0, 0, 0, 0.05);
    border: none;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .control-toggle span { 
    font-size: 24px;
  }

  .control-panel { 
    padding: 0.5rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .field label {
    font-weight: 600;
    white-space: nowrap;
    color: black; 
  }

  .field input[type="text"] {
    flex: 1;
    padding: 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .color-box {
    width: 24px;
    height: 24px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .native-picker {
    display: none;
  }

  .apply-btn {
    flex: 1;
    padding: 0.6rem 1rem;
    border: none;
    background: #28a745;
    color: white;
    font-weight: 600;
    border-radius: 4px;
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

  .btn-row {
    display: flex;
    gap: 0.5rem;
  }

  .remove-btn {
    flex: 1;
    padding: 0.6rem 1rem;
    border: none;
    background: #e53935;
    color: white;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
