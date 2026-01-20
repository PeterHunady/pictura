<template>
  <div class="grayscale">
    <button class="toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="toggle-left">
        <img :src="grayscaleIcon" alt="Grayscale" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Grayscale</span>
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
        <div class="panel">
          <div v-if="meta">
            <label class="row">
              <span class="ty-body-medium">Intensity</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                v-model.number="intensity"
              />
              <span class="value ty-body-medium">{{ intensity }}%</span>
            </label>

            <button class="apply-btn ty-body-small bg-lime600" @click="apply">
              Apply
            </button>
          </div>

          <p v-else class="no-image">No image loaded.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
  import { ref, watch, onBeforeUnmount } from 'vue'
  import grayscaleIcon from '@/assets/grayscale.svg'

  const props = defineProps({
    meta: Object,
    isOpen: { type: Boolean, default: false },
    appliedStrength: { type: Number, default: null }
  })

  const intensity = ref(0)
  const emit = defineEmits(['apply-grayscale', 'preview', 'end-preview', 'toggle'])

  function strengthFromPct (pct) {
    return Math.max(0, Math.min(1, (pct ?? 0) / 100))
  }

  function apply () {
    const s = strengthFromPct(intensity.value)
    emit('apply-grayscale', { strength: s })
  }

  watch(intensity, (v) => {
    if (props.isOpen) {
      emit('preview', { strength: strengthFromPct(v) })
    }
  })

  function syncIntensityFromProps () {
    if (!props.isOpen) return

    if (props.appliedStrength == null) {
      intensity.value = 0
    } else {
      const clamped = Math.max(0, Math.min(1, props.appliedStrength))
      intensity.value = Math.round(clamped * 100)
    }
  }

  watch(() => props.isOpen, (newVal, oldVal) => {
    if (!oldVal && newVal) {
      syncIntensityFromProps()
    }

    if (oldVal && !newVal) {
      emit('end-preview')
    }
  })

  watch(() => props.appliedStrength, () => {
    syncIntensityFromProps()
  })

  onBeforeUnmount(() => emit('end-preview'))

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
  .grayscale {
    margin-top: 1rem;
  }

  .toggle {
    width: 100%;
    padding: 0.7rem;
    border: none; 
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .toggle-left {
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

  .panel {
    padding: 0.75rem;
    padding-top: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 1rem;
  }

  .row span {
    color: black;
    font-weight: 500;
  }

  .row input[type="range"] {
    width: 100%;
    margin-left: 10px;
  }

  .value {
    font-variant-numeric: tabular-nums;
    min-width: 3.5ch;
    text-align: right;
    color: black;
  }

  .apply-btn {
    width: 100%;
    color: #fff;
    border: none;
    padding: 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    margin-top: 1rem;
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
