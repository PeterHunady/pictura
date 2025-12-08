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
                <p>Width: {{ w }}</p>
              </div>

              <div class="input-group ty-body-medium">
                <p>Height: {{ h }}</p>
              </div>
            </div>

            <div class="button-row">
              <button class="crop-btn ty-body-small bg-blue600" @click="emit('crop')">
                Crop to Content
              </button>
              <button class="apply-btn ty-body-small bg-lime600" @click="onApply">
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
  const w = ref(0)
  const h = ref(0)

  watch(() => props.meta, m => {
      w.value = m?.width  ? Math.round(m.width)  : 0
      h.value = m?.height ? Math.round(m.height) : 0
    }, { immediate: true }
  )

  watch(() => [props.initialSize.width, props.initialSize.height], ([nw, nh]) => {
    if (nw > 0 && nh > 0 && props.meta) {
      w.value = Math.round(Math.min(nw, props.meta.width))
      h.value = Math.round(Math.min(nh, props.meta.height))
    }}, { immediate: true }
  )

  watch([w, h], ([nw, nh]) => { 
    if (nw > 0 && nh > 0) { 
      emit('preview', { width: nw, height: nh })
    }
  })

  function onApply() {
    if (w.value > 0 && h.value > 0) {
      emit('apply', { width: w.value, height: h.value })
    }
  }

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
