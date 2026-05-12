<!--
  Author: Peter Huňady (xhunadp00)
  File: Topbar.vue
  Bachelor's Thesis, VUT Brno, 2026
-->

<template>
  <header class="topbar" :style="{ height: topGap }">
    <div class="topbar-content">
      <div class="brand">
        <img :src="defaultLogo" alt="Logo" class="logo" />
      </div>

      <button v-if="showPrivacy" class="privacy-btn" @click="privacyOpen = true" title="Privacy">
        <img class="icon" :src="questionMarkIcon" alt="Privacy" />
      </button>

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

        <div v-if="showScale" class="scale-control" ref="scaleControl">
          <div class="scale-wrapper bg-neutral200 bg-hover-neutral100" @click="toggleDropdown">
            <button class="scale-btn ty-body-small" @click.stop="decrementScale">−</button>

            <input
              type="number"
              v-model.number="scaleValue"
              @change="scaleChange"
              @keyup.enter="scaleChange"
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
              @mouseenter="showCalibrationHint = true"
              @mouseleave="showCalibrationHint = false"
            >
              <img
                :src="exclamationMark"
                class="warn-badge"
                alt="No calibration set yet"
              />
              <span v-show="showCalibrationHint" class="warn-tooltip ty-body-small">
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
                  v-model.number="referenceWidth"
                  @change="referenceWidthChange"
                  @keyup.enter="referenceWidthChange"
                  class="ref-input"
                  min="1"
                  max="1000"
                />
              </div>

              <div class="dropdown-actions">
                <button class="ref-action ty-body-small bg-lime600 bg-hover-lime500" @click="calibrate">Calibrate</button>
                <button
                  v-if="isCalibrated"
                  class="ref-action danger ty-body-small bg-red600 bg-hover-red500"
                  @click="clearCalibration"
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

  <div v-if="privacyOpen" class="privacy-backdrop" @click.self="privacyOpen = false">
    <div class="privacy-modal">
      <h3 class="ty-title-medium">Privacy Policy</h3>
      <p class="ty-body-small">
        This application uses anonymized usage statistics to better understand how people work with the app and its tools.
      </p>
      <p class="ty-body-small">
        All images and documents are processed directly in your browser. They are not uploaded to any server and never leave your device.
      </p>
      <div class="privacy-footer">
        <button class="privacy-close bg-red600 bg-hover-red500" @click="privacyOpen = false">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  defineOptions({ inheritAttrs: false })
  import defaultLogo from '@/assets/logo.png'
  import questionMarkIcon from '@/assets/questionMark.svg'
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
    showPrivacy: { type: Boolean, default: false },
    displayScale: { type: Number, default: 100 },
    referenceWidthMm: { type: Number, default: 210 },
    isCalibrated: { type: Boolean, default: false },
    minScale: { type: Number, default: 1 },
    maxScale: { type: Number, default: 10000 },
  })

  const emit = defineEmits([
    'undo','redo','reset','clear','visible',
    'update:scale','update:reference-width',
    'calibrate','clear-calibration','reset-to-100',
  ])

  const privacyOpen = ref(false)
  const isVisible = ref(true)
  const showCalibrationHint = ref(false)
  const scaleValue = ref(props.displayScale)
  const referenceWidth = ref(props.referenceWidthMm)
  const dropdownOpen = ref(false)
  const scaleControl = ref(null)
  function limitScale(value) {
    if (value < props.minScale) {
      return props.minScale
    }
    if (value > props.maxScale) {
      return props.maxScale
    }
    return value
  }

  function calibrate(){
    emit('calibrate') 
  }

  function clearCalibration(){
    emit('clear-calibration') 
  }

  function visibleCropPreview(){
    isVisible.value = !isVisible.value
    emit('visible', isVisible.value)
  }

  function decrementScale() {
    scaleValue.value = limitScale(scaleValue.value - 10)
    scaleChange()
  }

  function incrementScale() {
    scaleValue.value = limitScale(scaleValue.value + 10)
    scaleChange()
  }

  function resetTo100() {
    emit('reset-to-100')
  }

  function scaleChange() {
    scaleValue.value = limitScale(scaleValue.value)
    emit('update:scale', scaleValue.value)
  }

  function toggleDropdown() {
    dropdownOpen.value = !dropdownOpen.value
  }

  function referenceWidthChange() {
    if (referenceWidth.value < 1) {
      referenceWidth.value = 1
    }

    if (referenceWidth.value > 1000) {
      referenceWidth.value = 1000
    }
    emit('update:reference-width', referenceWidth.value)
  }

  function handleClickOutside(event) {
    if (scaleControl.value && !scaleControl.value.contains(event.target)) {
      dropdownOpen.value = false
    }
  }

  // metaKey is for Cmd on Mac, and ctrlKey is for Ctrl on Windows or Linux
  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault()
      emit('undo')
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
      event.preventDefault()
      emit('redo')
    }
  }

  function onDropEnter(el) {
    el.style.height = '0px'
    el.style.opacity = '0'
    const target = el.scrollHeight

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.25s ease, opacity 0.25s ease'
      el.style.height = target + 'px'
      el.style.opacity = '1'
    })
  }

  function onDropAfterEnter(el) {
    el.style.height = 'auto'
    el.style.transition = ''
  }

  function onDropLeave(el) {
    el.style.height = el.scrollHeight + 'px'
    el.style.opacity = '1'
    el.offsetHeight

    el.style.transition = 'height 0.2s ease-out, opacity 0.2s ease-out'
    el.style.height = '0px'
    el.style.opacity = '0'
  }

  watch(() => props.displayScale, (newValue) => {
    scaleValue.value = Math.round(newValue)
  })

  watch(() => props.referenceWidthMm, (newValue) => {
    referenceWidth.value = newValue
  })

  // setTimeout(0) adds the listener after the opening click, so the dropdown does not close right away
  watch(dropdownOpen, (isOpen) => {
    if (isOpen) {
      setTimeout(function() {document.addEventListener('click', handleClickOutside)}, 0)
    } else {
      document.removeEventListener('click', handleClickOutside)
    }
  })

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', handleKeydown)
  })

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

  .privacy-btn {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .privacy-btn:hover .icon {
    opacity: 0.7;
  }

  .privacy-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .privacy-modal {
    background: #fff;
    border-radius: 10px;
    padding: 16px 18px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    color: #000;
  }

  .privacy-modal h3 {
    color: #000;
    margin: 0 0 16px;
  }

  .privacy-modal p {
    color: #000;
    line-height: 1.6;
    margin: 0 0 12px;
  }

  .privacy-footer {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #eee;
  }

  .privacy-close {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    color: white;
  }
</style>
