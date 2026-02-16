<template>
  <div class="blur-controls">
    <button class="control-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="control-toggle-left">
        <img :src="blurIcon" alt="Blur" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Blur</span>
      </span>
      <span :class="isOpen ? 'arrow-down' : 'arrow-right'"></span>
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
            <label class="row">
              <span class="ty-body-medium">Radius</span>
              <input
                type="range"
                min="4"
                max="180"
                step="1"
                v-model.number="localRadius"
              />
              <span class="value ty-body-medium">{{ localRadius }}px</span>
            </label>

            <label class="row">
              <span class="ty-body-medium">Intensity</span>
              <input
                type="range"
                min="1"
                max="32"
                step="1"
                v-model.number="localIntensity"
              />
              <span class="value ty-body-medium">{{ localIntensity }}</span>
            </label>
          </div>

          <p v-else class="no-image">No image loaded.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
  import { ref, watch } from 'vue'
  import blurIcon from '@/assets/blur.svg'

  const props = defineProps({
    meta: Object,
    isOpen: { type: Boolean, default: false },
    radius: { type: Number, default: 28 },
    intensity: { type: Number, default: 10 }
  })

  const emit = defineEmits(['toggle', 'update:radius', 'update:intensity'])

  const localRadius = ref(props.radius)
  const localIntensity = ref(props.intensity)

  watch(() => props.radius, v => (localRadius.value = v))
  watch(() => props.intensity, v => (localIntensity.value = v))

  watch(localRadius, v => emit('update:radius', v))
  watch(localIntensity, v => emit('update:intensity', v))

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
  .blur-controls {
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

  .control-panel {
    padding: 0.75rem;
    padding-top: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: 5rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .row span {
    color: black;
    font-weight: 500;
  }

  .row span:first-child {
    text-align: left;
  }

  .row input[type="range"] {
    width: 100%;
  }

  .value {
    font-variant-numeric: tabular-nums;
    min-width: 4ch;
    text-align: right;
    color: black;
  }

  .no-image {
    padding: 0.5rem;
    font-style: italic;
    color: #666;
  }
</style>