
<template>
  <div class="background-color-control">
    <button class="control-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="control-toggle-left">
        <img :src="backgroundIcon" alt="Background color" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Background color</span>
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
        <div class="control-panel">
          <div v-if="meta">
            <div class="field">
              <label for="bg-color-input" class="ty-body-medium">Hex Color</label>

              <input
                id="bg-color-input"
                type="text"
                class="ty-body-small"
                :value="color"
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
              <button class="apply-btn ty-body-small bg-lime600" @click="applyColor">
                Apply
              </button>

              <button
                class="remove-btn ty-body-small bg-red600"
                @click="removeBackground"
                :disabled="bgTransparent"
              >
                Remove Background
              </button>
            </div>
          </div>

          <p v-else class="no-image">No image loaded.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
  import { ref, watch, computed, onBeforeUnmount } from 'vue'
  import backgroundIcon from '@/assets/BackgroundColor.svg'

  const props = defineProps({
    initialColor: { type: String, default: '#ffffff' },
    bgTransparent: { type: Boolean, default: false },
    meta: Object,
    isOpen: { type: Boolean, default: false },
    appliedColor: { type: String, default: null }
  })

  const emit = defineEmits([
    'apply-color',
    'preview-color',
    'end-preview-color',
    'remove-background',
    'toggle'
  ])

  const color = ref(props.initialColor)
  const lastValidColor = ref(null)
  const picker = ref(null)

  function normalizeHex (val) {
    const s = String(val || '').trim()
    const m6 = s.match(/^#?([0-9a-fA-F]{6})$/)
    if (m6) return `#${m6[1].toLowerCase()}`

    const m3 = s.match(/^#?([0-9a-fA-F]{3})$/)
    if (m3) {
      return (
        '#' +
        m3[1]
          .split('')
          .map(c => c + c)
          .join('')
          .toLowerCase()
      )
    }
    return null
  }

  const normalizedColor = computed(() => normalizeHex(color.value))

  function onColorInput(e) {
    color.value = e.target.value
  }

  function openPicker() {
    if (picker.value) {
      picker.value.click()
    }
  }

  function applyColor() {
    if (!lastValidColor.value) return
    emit('apply-color', lastValidColor.value)
  }

  function removeBackground() {
    emit('remove-background')
  }

  let previewTimer = null
  watch(color, (v) => {
    if (!props.isOpen) return

    const hx = normalizeHex(v)
    if (!hx) return

    lastValidColor.value = hx

    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => emit('preview-color', hx), 80)
  })

  watch(
    () => props.isOpen,
    (newVal, oldVal) => {
      if (!oldVal && newVal) {
        if (props.bgTransparent) {
          color.value = ''
          lastValidColor.value = null
        } else if (props.appliedColor) {
          color.value = props.appliedColor
          lastValidColor.value = normalizeHex(color.value)
        } else {
          color.value = props.initialColor || '#ffffff'
          lastValidColor.value = normalizeHex(color.value)
        }
      }

      if (oldVal && !newVal) {
        emit('end-preview-color')
      }
    }
  )

  watch(
    () => props.bgTransparent,
    (v) => {
      if (v) {
        color.value = ''
        lastValidColor.value = null
      }
    }
  )

  watch(
    () => props.appliedColor,
    (v) => {
      if (!props.bgTransparent && v) {
        color.value = v
        lastValidColor.value = normalizeHex(v)
      }
    }
  )

  watch(
    () => props.initialColor,
    (v) => {
      if (!props.bgTransparent && !props.appliedColor) {
        color.value = v || '#ffffff'
        lastValidColor.value = normalizeHex(color.value)
      }
    }
  )

  onBeforeUnmount(() => {
    if (previewTimer) {
      clearTimeout(previewTimer)
    }
    emit('end-preview-color')
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
  .background-color-control { 
    margin-top: 1rem; 
  }

  .control-toggle {
    width: 100%; 
    padding: 0.7rem; 
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .control-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-icon {
    width: 20px;
    height: 20px;
    display: block;
  }

  .control-panel { 
    padding: 0.75rem;
    padding-top: 1rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .field label {
    font-weight: 500;
    white-space: nowrap;
    color: black; 
  }

  .field input[type="text"] {
    flex: 1;
    padding: 0.4rem;
    margin-left: 1.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .color-box {
    width: 31px;
    height: 31px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .native-picker {
    display: none;
  }

  .apply-btn {
    flex: 1;
    padding: 0.4rem 0;
    border: none;
    color: white;
    font-weight: 600;
    border-radius: 6px;
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
    gap: 0.75rem;
  }

  .remove-btn {
    flex: 1;
    padding: 0.4rem 0;
    border: none;
    color: white;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
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
