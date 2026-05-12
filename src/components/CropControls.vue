<!--
  Author: Peter Huňady (xhunadp00)
  File: CropControls.vue
  Bachelor's Thesis, VUT Brno, 2026
-->

<template>
  <div class="resize">
    <button class="resize-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="resize-toggle-left">
        <img :src="cropIcon" alt="Crop image" class="toggle-icon" />
        <span class="resize-label ty-title-medium">Crop image</span>
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
        <div class="resize-list">
          <div class="resize-fields" v-if="meta">
            <div class="input-row">
              <div class="input-group ty-body-medium">
                <p>Width: {{ displayWidth }}</p>
              </div>

              <div class="input-group ty-body-medium">
                <p>Height: {{ displayHeight }}</p>
              </div>
            </div>

            <div class="button-row">
              <button class="crop-btn ty-body-small bg-blue600" @click="emit('crop')">
                Crop to Content
              </button>
              <button class="apply-btn ty-body-small bg-lime600" @click="apply">
                Apply
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
  import { ref, watch } from 'vue'
  import cropIcon from '@/assets/crop.svg'

  const props = defineProps({
    meta: Object,
    initialSize: Object,
    isOpen: { type: Boolean, default: false }
  })

  const emit = defineEmits(['crop','preview','apply','toggle'])
  const displayWidth = ref(0)
  const displayHeight = ref(0)

  function apply() {
    if (displayWidth.value > 0 && displayHeight.value > 0) {
      emit('apply', { width: displayWidth.value, height: displayHeight.value })
    }
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

  // fill the shown values when the component starts
  watch(() => props.meta, (newMeta) => {
    displayWidth.value = newMeta?.width ? Math.round(newMeta.width) : 0
    displayHeight.value = newMeta?.height ? Math.round(newMeta.height) : 0
  }, { immediate: true })

  // keep initialSize inside the real image size, because the overlay can go outside the image
  watch(() => props.initialSize, () => {
    const width = props.initialSize.width
    const height = props.initialSize.height
    
    if (width > 0 && height > 0 && props.meta) {
      displayWidth.value = Math.round(Math.min(width, props.meta.width))
      displayHeight.value = Math.round(Math.min(height, props.meta.height))
    }
  }, { immediate: true, deep: true })

  watch([displayWidth, displayHeight], () => {
    if (displayWidth.value > 0 && displayHeight.value > 0) {
      emit('preview', { width: displayWidth.value, height: displayHeight.value })
    }
  })
</script>

<style scoped>
  .resize {
    margin-top: 1rem;
  }

  label{
    color: black;
  }

  .resize-toggle {
    width: 100%;
    padding: 0.7rem;
    border: none;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .resize-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-icon {
    width: 22px;
    height: 22px;
    display: block;
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

  .slide-wrapper {
    overflow: hidden;
  }

  .resize-list {
    padding: 0.75rem;
    padding-top: 1rem;
  }

  .resize-fields {
    width: 100%;
  }

  .input-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .input-group {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
    
  .input-group label {
    margin-bottom: 0.25rem;
    font-weight: 600;
  }
    
  .input-group input {
    width: 100%;
    padding: 0.3rem;
    box-sizing: border-box;
  }

  .button-row {
    display: flex;
    gap: 0.75rem;
  }

  .button-row button {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .crop-btn {
    color: #fff;
  }

  .apply-btn {
    color: #fff;
  }

  .no-image {
    padding: 0.5rem;
    font-style: italic;
    color: #666;
  }
</style>
