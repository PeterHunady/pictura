<template>
  <header class="topbar" :style="{ height: topGap }">
    <div class="topbar-content" :style="{ paddingRight: rightGap }">
      <img :src="defaultLogo" alt="Logo" class="logo" />

      <div v-if="showScale" class="scale-control" ref="scaleControlRef">
        <div class="scale-wrapper" @click="toggleDropdown">
          <button class="scale-btn" @click.stop="decrementScale">−</button>
          <input
            type="number"
            v-model.number="localScale"
            @change="onScaleChange"
            @keyup.enter="onScaleChange"
            @click.stop
            class="scale-input"
            step="1"
          />
          <span class="scale-unit">%</span>
          <button class="scale-btn" @click.stop="incrementScale">+</button>
          <span
            v-if="!isCalibrated"
            class="warn-wrap"
            @mouseenter="showPctTooltip = true"
            @mouseleave="showPctTooltip = false"
          >
            <img :src="exclamationMark" class="warn-badge" alt="No calibration set yet" />
            <span v-show="showPctTooltip" class="warn-tooltip">No calibration set yet</span>
        </span>
        </div>

        <div v-if="dropdownOpen" class="scale-dropdown">
          <div class="dropdown-item">
            <label>Reference width (mm):</label>
            <input
              type="number"
              v-model.number="localReferenceWidth"
              @change="onReferenceWidthChange"
              @keyup.enter="onReferenceWidthChange"
              class="ref-input"
              min="1"
              max="1000"
              :min="scaleMin"
              :max="scaleMax"
            />
          </div>

          <div class="dropdown-sep"></div>

          <div class="dropdown-actions">
            <button class="ref-action" @click="onCalibrate">Calibrate</button>
            <button
              v-if="isCalibrated"
              class="ref-action danger"
              @click="onClearCalibration"
            >
              Reset calibration
            </button>
          </div>
        </div>
      </div>

      <div class="spacer"></div>
    </div>

    <div class="actions-fixed" v-if="showActions">
      <button class="icon-btn show-crop-preview" @click="visibleCropPreview(isVisible)">
        <p>Show crop preview</p>
        <img class="icon" :src="isVisible ? visibleIcon : invisibleIcon" alt="">
      </button>

      <button class="icon-btn" title="Undo" @click="$emit('undo')">
        <img class="icon" :src="undoIcon" alt="Undo" />
      </button>
      <button class="icon-btn" title="Reset" @click="$emit('reset')">
        <img class="icon" :src="resetIcon" alt="Reset" />
      </button>
    </div>
  </header>
</template>

<script setup>
  import { ref, watch, onUnmounted } from 'vue'
  import defaultLogo from '@/assets/logo.png'
  import undoIcon from '@/assets/undo.png'
  import resetIcon from '@/assets/reset.png'
  import visibleIcon from '@/assets/visible.png'
  import invisibleIcon from '@/assets/invisible.png'
  import exclamationMark from '@/assets/exclamationMark.png'

  const props = defineProps({
    rightGap: { type: String, default: 'min(30vw, 300px)' },
    topGap: { type: String, default: '48px' },
    showActions: { type: Boolean, default: true },
    showScale: { type: Boolean, default: false },
    displayScale: { type: Number, default: 100 },
    referenceWidthMm: { type: Number, default: 210 },
    isCalibrated: { type: Boolean, default: false },
    minScale: { type: Number, default: 1 },
    maxScale: { type: Number, default: 10000 },
  })

  const showPctTooltip = ref(false)
  const showCalibTooltip = ref(false)

  const emit = defineEmits([
    'undo','reset','visible',
    'update:scale','update:reference-width',
    'calibrate','clear-calibration',
  ])

  function onCalibrate(){ emit('calibrate') }
  function onClearCalibration(){ emit('clear-calibration') }

  const isVisible = ref(true)
  function visibleCropPreview(){
    isVisible.value = !isVisible.value
    emit('visible', isVisible.value)
  }

  const localScale = ref(props.displayScale)
  const localReferenceWidth = ref(props.referenceWidthMm)
  const dropdownOpen = ref(false)
  const scaleControlRef = ref(null)

  watch(() => props.displayScale, v => {
    localScale.value = Math.round(v)
  })

  watch(() => props.referenceWidthMm, v => {
    localReferenceWidth.value = v
  })

  const clampScale = (v) => Math.max(props.minScale, Math.min(props.maxScale, v))

  function decrementScale() {
    localScale.value = clampScale(localScale.value - 10)
    onScaleChange()
  }

  function incrementScale() {
    localScale.value = clampScale(localScale.value + 10)
    onScaleChange()
  }

  function onScaleChange() {
    localScale.value = clampScale(localScale.value)
    emit('update:scale', localScale.value)
  }

  function toggleDropdown() {
    dropdownOpen.value = !dropdownOpen.value
  }

  function onReferenceWidthChange() {
    localReferenceWidth.value = Math.max(1, Math.min(1000, localReferenceWidth.value))
    emit('update:reference-width', localReferenceWidth.value)
  }

  function handleClickOutside(event) {
    if (scaleControlRef.value && !scaleControlRef.value.contains(event.target)) {
      dropdownOpen.value = false
    }
  }

  watch(dropdownOpen, (isOpen) => {
    if (isOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
    } else {
      document.removeEventListener('click', handleClickOutside)
    }
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })
</script>

<style scoped>
  .topbar{
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-bottom: 1px solid #e6e6e6;
    z-index: 110;
  }

  .topbar-content{
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0 .75rem;
  }

  .logo{
    height: 70%;
    max-height: 28px;
    display: block;
  }

  .spacer{
    flex: 1 1 auto;
  }

  .actions-fixed{
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: .5rem;
  }

  .icon-btn{ 
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .icon{
    width: 22px;
    height: 22px;
    display: block;
  }

  .icon-btn:hover .icon, .show-crop-preview:hover p{
    opacity: .75;
  }

  .show-crop-preview{
    margin-right: 40px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 2px 8px;
    border-radius: 20px;
    background-color: #e6e6e6;
  }

  .scale-control {
    position: relative;
    margin-left: 1rem;
  }

  .scale-wrapper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: #f7f7f7;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }

  .scale-btn, .dropdown-btn {
    background: none;
    border: 0;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
  }

  .scale-btn:hover, .dropdown-btn:hover {
    opacity: 0.7;
  }

  .scale-input {
    width: 60px;
    border: 0;
    background: transparent;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    outline: none;
    -moz-appearance: textfield;
  }

  .scale-input::-webkit-outer-spin-button, .scale-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .scale-unit {
    font-size: 14px;
    font-weight: 600;
    color: #666;
  }

  .scale-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.75rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 120;
    min-width: 250px;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dropdown-item label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
  }

  .ref-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    -moz-appearance: textfield;
  }

  .ref-input::-webkit-outer-spin-button, .ref-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .ref-input:focus {
    border-color: #999;
  }

  .dropdown-sep {
    height: 1px;
    background: #eee;
    margin: .75rem 0;
  }

  .dropdown-actions {
    display: flex;
    gap: .5rem;
  }

  .ref-action {
    padding: .35rem .6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fafafa;
    cursor: pointer;
    font-size: 13px;
  }

  .ref-action:hover {
    background: #f0f0f0;
  }

  .ref-action.danger {
    border-color: #f5c2c2;
    color: #c00;
    background: #fff6f6;
  }

  .ref-action.danger:hover {
    background: #ffecec;
  }

  .warn-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
  }

  .warn-badge {
    width: 14px;
    height: 14px;
    display: inline-block;
    vertical-align: middle;
    cursor: default;
  }

  .warn-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: 120%;
    white-space: nowrap;
    background: #111;
    color: #fff;
    font-size: 11px;
    line-height: 1;
    padding: 6px 8px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .15);
    z-index: 9999;
  }

  .warn-tooltip--below {
    top: 140%;
  }

  .calib-action-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
