import { ref, nextTick, watch } from 'vue'

const CAL_KEY = 'imageDrop.cssBaseDpi'
const CARD_SLIDER_KEY = 'imageDrop.cardSliderValue'
const REF_WIDTH_KEY = 'imageDrop.referenceWidthMm'

export function useCalibration({ screenDPI, recomputeScaleBounds, updateDisplayScale, referenceWidthMm }) {
  const calibrationBaseCssDpi = ref(null)
  const calOpen = ref(false)
  const calMeasuredMm = ref(100)
  const calLineEl = ref(null)
  const calCssPx = ref(0)
  const calError = ref('')

  const calibrationMode = ref('line')
  const cardSliderValue = ref(100)
  const cardImageEl = ref(null)
  const CARD_WIDTH_MM = 85.6
  const CARD_HEIGHT_MM = 53.98

  watch(cardSliderValue, (newValue) => {
    localStorage.setItem(CARD_SLIDER_KEY, newValue.toString())
  })

  watch(referenceWidthMm, (newValue) => {
    localStorage.setItem(REF_WIDTH_KEY, newValue.toString())
  })

  function getPageZoomSafe() {
    return (window.visualViewport && typeof window.visualViewport.scale === 'number')
      ? (window.visualViewport.scale || 1)
      : 1
  }

  function applyCalibratedEffectiveDpiFromBase() {
    if (!calibrationBaseCssDpi.value) return
    const zoom = getPageZoomSafe()
    screenDPI.value = calibrationBaseCssDpi.value / zoom

    recomputeScaleBounds()
    updateDisplayScale()
  }

  function attachCalibrationListeners() {
    window.visualViewport?.addEventListener('resize', applyCalibratedEffectiveDpiFromBase)
    window.addEventListener('resize', applyCalibratedEffectiveDpiFromBase)
  }

  function detachCalibrationListeners() {
    window.visualViewport?.removeEventListener('resize', applyCalibratedEffectiveDpiFromBase)
    window.removeEventListener('resize', applyCalibratedEffectiveDpiFromBase)
  }

  function measureCalLinePx() {
    if (calLineEl.value) {
      calCssPx.value = calLineEl.value.getBoundingClientRect().width
    }
  }

  function openCalibration() {
    calOpen.value = true
    nextTick(() => {
      measureCalLinePx()

      if (calibrationBaseCssDpi.value && calCssPx.value > 0) {
        const effectiveCssDpi = calibrationBaseCssDpi.value / getPageZoomSafe()
        const savedMm = (calCssPx.value * 25.4) / effectiveCssDpi
        calMeasuredMm.value = Math.round(savedMm * 10) / 10
      } else {
        calMeasuredMm.value = 100
      }

      window.addEventListener('resize', measureCalLinePx)
    })
  }

  function closeCalibration() {
    calOpen.value = false
    calError.value = ''
    calibrationMode.value = 'line'
    window.removeEventListener('resize', measureCalLinePx)
  }

  function applyCalibration(pz, basePixelWidth, initialScale, panCont, displayScale) {
    measureCalLinePx()
    const mm = Number(calMeasuredMm.value)
    if (!Number.isFinite(mm) || mm <= 0) {
      calError.value = 'Please enter a positive value in mm.'
      return
    }

    const effectiveCssDpi = (calCssPx.value * 25.4) / mm
    const baseCssDpi = effectiveCssDpi * getPageZoomSafe()

    calibrationBaseCssDpi.value = baseCssDpi
    localStorage.setItem(CAL_KEY, String(baseCssDpi))

    detachCalibrationListeners()
    attachCalibrationListeners()

    const newDpi = baseCssDpi / getPageZoomSafe()
    screenDPI.value = newDpi

    if (pz && basePixelWidth.value > 0) {
      const referenceWidthPx = (referenceWidthMm.value / 25.4) * screenDPI.value;
      const targetScreenWidthPx = referenceWidthPx;
      const targetAbsoluteScale = targetScreenWidthPx / basePixelWidth.value
      const targetUserScale = targetAbsoluteScale / initialScale.value

      const r = panCont.value.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top  + r.height / 2
      pz.zoomAbs(cx, cy, targetUserScale)
    }

    displayScale.value = 100
    recomputeScaleBounds()
    updateDisplayScale()
    closeCalibration()
  }

  function applyCardCalibration(pz, basePixelWidth, initialScale, panCont, displayScale) {
    if (!cardImageEl.value) {
      calError.value = 'Card image not loaded.'
      return
    }

    const cardRect = cardImageEl.value.getBoundingClientRect()
    const displayedCardWidthCssPx = cardRect.width

    if (!displayedCardWidthCssPx || displayedCardWidthCssPx <= 0) {
      calError.value = 'Could not measure card size.'
      return
    }

    const effectiveCssDpi = (displayedCardWidthCssPx * 25.4) / CARD_WIDTH_MM
    const baseCssDpi = effectiveCssDpi * getPageZoomSafe()

    calibrationBaseCssDpi.value = baseCssDpi
    localStorage.setItem(CAL_KEY, String(baseCssDpi))

    detachCalibrationListeners()
    attachCalibrationListeners()

    const newDpi = baseCssDpi / getPageZoomSafe()
    screenDPI.value = newDpi

    if (pz && basePixelWidth.value > 0) {
      const referenceWidthPx = (referenceWidthMm.value / 25.4) * screenDPI.value;
      const targetScreenWidthPx = referenceWidthPx;
      const targetAbsoluteScale = targetScreenWidthPx / basePixelWidth.value
      const targetUserScale = targetAbsoluteScale / initialScale.value

      const r = panCont.value.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top  + r.height / 2
      pz.zoomAbs(cx, cy, targetUserScale)
    }

    displayScale.value = 100
    recomputeScaleBounds()
    updateDisplayScale()
    closeCalibration()
  }

  function clearCalibration() {
    localStorage.removeItem(CAL_KEY)
    calibrationBaseCssDpi.value = null
    detachCalibrationListeners()
    measureCssDpi1in()
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function measureCssDpi1in() {
    const el = document.createElement('div')
    el.style.width = '1in'
    el.style.position = 'absolute'
    el.style.visibility = 'hidden'
    document.body.appendChild(el)
    const cssDpi = el.offsetWidth || 96
    document.body.removeChild(el)
    screenDPI.value = cssDpi
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function initCalibration() {
    const savedBase = parseFloat(localStorage.getItem(CAL_KEY))
    if (Number.isFinite(savedBase) && savedBase > 20 && savedBase < 2000) {
      calibrationBaseCssDpi.value = savedBase
      attachCalibrationListeners()
      applyCalibratedEffectiveDpiFromBase()
    } else {
      measureCssDpi1in()
    }

    const savedSlider = parseFloat(localStorage.getItem(CARD_SLIDER_KEY))
    if (Number.isFinite(savedSlider) && savedSlider >= 30 && savedSlider <= 200) {
      cardSliderValue.value = savedSlider
    }

    const savedRefWidth = parseFloat(localStorage.getItem(REF_WIDTH_KEY))
    if (Number.isFinite(savedRefWidth) && savedRefWidth > 0) {
      referenceWidthMm.value = savedRefWidth
    }
  }

  return {
    calibrationBaseCssDpi,
    calOpen,
    calMeasuredMm,
    calLineEl,
    calCssPx,
    calError,
    calibrationMode,
    cardSliderValue,
    cardImageEl,
    CARD_WIDTH_MM,
    CARD_HEIGHT_MM,
    openCalibration,
    closeCalibration,
    applyCalibration,
    applyCardCalibration,
    clearCalibration,
    measureCalLinePx,
    measureCssDpi1in,
    initCalibration,
    detachCalibrationListeners,
  }
}