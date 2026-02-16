<template>
  <div class="mark-controls">
    <button class="control-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="control-toggle-left">
        <img :src="markIcon" alt="Mark" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Mark</span>
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
              <span class="ty-body-medium">Thickness</span>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                v-model.number="localThickness"
              />
              <span class="value ty-body-medium">{{ localThickness }}px</span>
            </label>

            <div class="color-row">
              <span class="ty-body-medium">Color</span>
              <div class="color-input-wrap">
                <input
                  type="text"
                  class="color-text ty-body-small"
                  :value="localColor"
                  @input="onColorInput"
                  placeholder="#ff0000"
                />
                <div
                  class="color-box"
                  :style="{ backgroundColor: localColor }"
                  @click="openPicker"
                ></div>
                <input
                  ref="picker"
                  type="color"
                  v-model="localColor"
                  class="native-picker"
                />
              </div>
            </div>

            <div class="shape-row">
              <span class="ty-body-medium">Shape</span>
              <div class="shape-buttons">
                <button
                  :class="['shape-btn', { active: localShape === 'rect' }]"
                  @click="localShape = 'rect'"
                  title="Rectangle"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
                <button
                  :class="['shape-btn', { active: localShape === 'circle' }]"
                  @click="localShape = 'circle'"
                  title="Ellipse"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <ellipse cx="12" cy="12" rx="9" ry="7" fill="none" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
              </div>
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
  import markIcon from '@/assets/mark.svg'

  const props = defineProps({
    meta: Object,
    isOpen: { type: Boolean, default: false },
    thickness: { type: Number, default: 4 },
    color: { type: String, default: '#ff0000' },
    shape: { type: String, default: 'rect' }
  })

  const emit = defineEmits(['toggle', 'update:thickness', 'update:color', 'update:shape'])

  const localThickness = ref(props.thickness)
  const localColor = ref(props.color)
  const localShape = ref(props.shape)
  const picker = ref(null)

  watch(() => props.thickness, v => (localThickness.value = v))
  watch(() => props.color, v => (localColor.value = v))
  watch(() => props.shape, v => (localShape.value = v))

  watch(localThickness, v => emit('update:thickness', v))
  watch(localColor, v => emit('update:color', v))
  watch(localShape, v => emit('update:shape', v))

  function onColorInput(e) {
    localColor.value = e.target.value
  }

  function openPicker() {
    picker.value?.click()
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
  .mark-controls {
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
    margin-bottom: 1.3rem;
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

  .color-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .color-row > span {
    width: 5rem;
    color: black;
    font-weight: 500;
    flex-shrink: 0;
  }

  .color-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .color-text {
    flex: 1;
    padding: 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-width: 0;
    max-width: 100px;
  }

  .color-box {
    width: 31px;
    height: 31px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .native-picker {
    display: none;
  }

  .shape-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .shape-row > span {
    width: 5rem;
    color: black;
    font-weight: 500;
    flex-shrink: 0;
  }

  .shape-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .shape-btn {
    width: 36px;
    height: 36px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    transition: all 0.15s ease;
  }

  .shape-btn:hover {
    border-color: #999;
    background: #f5f5f5;
  }

    .shape-btn.active {
        border-color: var(--lime400);
        background: var(--lime400);
        color: var(--neutral100);
    }

  .hint {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
    color: #555;
    text-align: center;
  }

  .no-image {
    padding: 0.5rem;
    font-style: italic;
    color: #666;
  }
</style>