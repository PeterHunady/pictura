<template>
  <header class="topbar" :style="{ height: topGap }">
    <div class="topbar-content">
      <div class="brand">
        <img :src="defaultLogo" alt="Logo" class="logo" />
      </div>

      <div class="toolbar" v-if="showScale">
        <div v-if="showActions" class="actions-group">
          <button class="icon-btn" title="Undo (Ctrl+Z)" @click="$emit('undo')">
            <img class="icon" :src="undoIcon" alt="Undo" />
          </button>

          <button class="icon-btn" title="Redo (Ctrl+Y)" @click="$emit('redo')">
            <img class="icon" :src="redoIcon" alt="Redo" />
          </button>

          <button class="icon-btn" title="Reset" @click="$emit('reset')">
            <img class="icon" :src="resetIcon" alt="Reset" />
          </button>

          <button
            class="icon-btn danger"
            title="Clear image"
            @click="$emit('clear')"
          >
            <img class="icon" :src="binIcon" alt="Clear" />
          </button>
        </div>

        <div v-if="showActions" class="toolbar-divider"></div>

        <div v-if="showScale" class="scale-control" ref="scaleControlRef">
          <div class="scale-wrapper bg-neutral200 bg-hover-neutral100" @click="toggleDropdown">
            <button class="scale-btn ty-body-small" @click.stop="decrementScale">−</button>

            <input
              type="number"
              v-model.number="localScale"
              @change="onScaleChange"
              @keyup.enter="onScaleChange"
              @click.stop
              class="scale-input ty-body-small"
              step="1"
            />

            <span class="scale-unit ty-body-small">%</span>

            <button class="scale-btn ty-body-small" @click.stop="incrementScale">+</button>

            <button
              class="reset-100-btn"
              @click.stop="resetTo100"
              title="Reset to 100%"
            >
              <img :src="resetZoomIcon" alt="Reset to 100%" class="reset-icon" />
            </button>

            <span
              v-if="!isCalibrated"
              class="warn-wrap"
              @mouseenter="showPctTooltip = true"
              @mouseleave="showPctTooltip = false"
            >
              <img
                :src="exclamationMark"
                class="warn-badge"
                alt="No calibration set yet"
              />
              <span v-show="showPctTooltip" class="warn-tooltip ty-body-small">
                No calibration set yet
              </span>
            </span>
          </div>

          <transition
            name="scale-dropdown-anim"
            @enter="onDropEnter"
            @after-enter="onDropAfterEnter"
            @leave="onDropLeave"
          >
            <div v-if="dropdownOpen" class="scale-dropdown">
              <div class="dropdown-item ty-body-small">
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

              <div class="dropdown-actions">
                <button class="ref-action ty-body-small bg-lime600 bg-hover-lime500" @click="onCalibrate">Calibrate</button>
                <button
                  v-if="isCalibrated"
                  class="ref-action danger ty-body-small bg-red600 bg-hover-red500"
                  @click="onClearCalibration"
                >
                  Reset calibration
                </button>
              </div>
            </div>
          </transition>
        </div>

        <div v-if="showActions" class="toolbar-divider"></div>

        <button
          v-if="showActions"
          class="toolbar-btn toolbar-btn-ghost ty-body-small bg-neutral200 bg-hover-neutral100"
          @click="visibleCropPreview(isVisible)"
        >
          <span>Crop preview</span>
          <img
            class="icon icon-eye"
            :src="isVisible ? visibleIcon : invisibleIcon"
            alt=""
          />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import defaultLogo from '@/assets/logo.png'
  import undoIcon from '@/assets/undo.svg'
  import redoIcon from '@/assets/redo.svg'
  import resetIcon from '@/assets/reset.svg'
  import binIcon from '@/assets/bin.svg'
  import visibleIcon from '@/assets/visible.svg'
  import invisibleIcon from '@/assets/invisible.svg'
  import exclamationMark from '@/assets/exclamationMark.svg'
  import resetZoomIcon from '@/assets/reset.svg'

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
    'undo','redo','reset','clear','visible',
    'update:scale','update:reference-width',
    'calibrate','clear-calibration','reset-to-100',
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

  function resetTo100() {
    emit('reset-to-100')
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

  const handleKeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault()
      emit('undo')
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
      event.preventDefault()
      emit('redo')
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', handleKeydown)
  })

  const onDropEnter = (el) => {
    el.style.height = '0px'
    el.style.opacity = '0'

    const target = el.scrollHeight

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.25s ease, opacity 0.25s ease'
      el.style.height = target + 'px'
      el.style.opacity = '1'
    })
  }

  const onDropAfterEnter = (el) => {
    el.style.height = 'auto'
    el.style.transition = ''
  }

  const onDropLeave = (el) => {
    el.style.height = el.scrollHeight + 'px'
    el.style.opacity = '1'
    void el.offsetHeight

    el.style.transition = 'height 0.2s ease-out, opacity 0.2s ease-out'
    el.style.height = '0px'
    el.style.opacity = '0'
  }

</script>

<style scoped>
  .topbar{
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    border-bottom: 1px solid #e6e6e6;
    z-index: 110;
  }

  .topbar-content{
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0.75rem;
  }

  .brand{
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  .logo{
    height: 70%;
    max-height: 28px;
    display: block;
  }

  .toolbar{
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: .75rem;
  }

  .icon-btn{ 
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .icon{
    width: 20px;
    height: 20px;
    display: block;
  }

  .icon-btn:hover .icon{
    opacity: .7;
  }

  .toolbar-btn{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .scale-wrapper, .toolbar-btn {
    padding: 4px 10px;
    border-radius: 999px;
    min-height: 30px;
    box-sizing: border-box;
  }

  .toolbar-btn{
    padding: 0px 10px;
  }

  .toolbar-btn span{
    white-space: nowrap;
  }

  .toolbar-btn-ghost{
    border-color: #e0e0e0;
  }

  .icon-eye{
    width: 22px;
    height: 22px;
  }

  .actions-group{
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toolbar-divider{
    width: 1px;
    height: 18px;
    background: #e0e0e0;
  }

  .scale-control {
    position: relative;
    display: inline-flex;
  }

  .scale-wrapper {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .scale-btn,
  .dropdown-btn {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
  }

  .scale-btn:hover,
  .dropdown-btn:hover {
    opacity: 0.7;
  }

  .reset-100-btn {
    background: none;
    border: 0;
    padding: 0 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 10px;
  }

  .reset-100-btn:hover .reset-icon {
    opacity: .7;
  }

  .reset-icon {
    width: 15px;
    height: 15px;
    display: block;
  }

  .scale-input {
    width: 33px;
    border: 0;
    background: transparent;
    text-align: center;
    font-weight: 600;
    outline: none;
    -moz-appearance: textfield;
  }

  .scale-input::-webkit-outer-spin-button,
  .scale-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .scale-unit {
    font-weight: 600;
    color: #666;
  }

  .scale-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.75rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 120;
    box-sizing: border-box;
    overflow: hidden;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dropdown-item label {
    font-weight: 500;
    color: #333;
    white-space: nowrap;
  }

  .ref-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    outline: none;
    -moz-appearance: textfield;
  }

  .ref-input::-webkit-outer-spin-button,
  .ref-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .ref-input:focus {
    border-color: #999;
  }

  .dropdown-actions {
    display: flex;
    padding-top: 1rem;
    gap: 0.5rem;
  }

  .ref-action {
    padding: .35rem .6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    color: white;
    cursor: pointer;
  }

  .warn-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
  }

  .warn-badge {
    width: 16px;
    height: 16px;
    display: inline-block;
    vertical-align: middle;
    cursor: pointer;
  }

  .warn-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: 120%;
    white-space: nowrap;
    background: #111;
    color: #fff;
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
