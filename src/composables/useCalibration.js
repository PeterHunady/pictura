import { ref, nextTick, watch } from 'vue'

const CALIBRATION_KEY = 'imageDrop.cssBaseDpi'
const CARD_SLIDER_KEY = 'imageDrop.cardSliderValue'
const REF_WIDTH_KEY = 'imageDrop.referenceWidthMm'

export function useCalibration({ screenDPI, updateScaleLimits, updateDisplayScale, referenceWidthMm }) {
  const calibrationDpi = ref(null)
  const calibrationOpen = ref(false)
  const calibrationMeasured = ref(100)
  const calibrationLineEl = ref(null)
  const calibrationCssPx = ref(0)
  const calibrationError = ref('')
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

  function getPageZoom() {
    return (window.visualViewport && typeof window.visualViewport.scale === 'number') ? (window.visualViewport.scale || 1) : 1
  }

  function updateCalibratedDpi() {
    if (!calibrationDpi.value) {
      return
    }

    const zoom = getPageZoom()
    screenDPI.value = calibrationDpi.value / zoom
    updateScaleLimits()
    updateDisplayScale()
  }

  function attachCalibrationListeners() {
    window.visualViewport?.addEventListener('resize', updateCalibratedDpi)
    window.addEventListener('resize', updateCalibratedDpi)
  }

  function detachCalibrationListeners() {
    window.visualViewport?.removeEventListener('resize', updateCalibratedDpi)
    window.removeEventListener('resize', updateCalibratedDpi)
  }

  function measureCalibrationLine() {
    if (calibrationLineEl.value) {
      calibrationCssPx.value = calibrationLineEl.value.getBoundingClientRect().width
    }
  }

  function openCalibration() {
    calibrationOpen.value = true
    nextTick(() => {
      measureCalibrationLine()

      if (calibrationDpi.value && calibrationCssPx.value > 0) {
        const measuredDpi = calibrationDpi.value / getPageZoom()
        const savedMm = (calibrationCssPx.value * 25.4) / measuredDpi
        calibrationMeasured.value = Math.round(savedMm * 10) / 10
      } else {
        calibrationMeasured.value = 100
      }

      window.addEventListener('resize', measureCalibrationLine)
    })
  }

  function closeCalibration() {
    calibrationOpen.value = false
    calibrationError.value = ''
    calibrationMode.value = 'line'
    window.removeEventListener('resize', measureCalibrationLine)
  }

  function applyCalibration(panzoom, basePixelWidth, initialScale, canvasWrapper, displayScale) {
    measureCalibrationLine()
    const mm = Number(calibrationMeasured.value)

    if (!Number.isFinite(mm) || mm <= 0) {
      calibrationError.value = 'Please enter a positive value in mm.'
      return
    }

    const measuredDpi = (calibrationCssPx.value * 25.4) / mm
    const savedDpi = measuredDpi * getPageZoom()

    calibrationDpi.value = savedDpi
    localStorage.setItem(CALIBRATION_KEY, String(savedDpi))

    detachCalibrationListeners()
    attachCalibrationListeners()

    const newDpi = savedDpi / getPageZoom()
    screenDPI.value = newDpi

    if (panzoom && basePixelWidth.value > 0) {
      const referenceWidth = (referenceWidthMm.value / 25.4) * screenDPI.value
      const referenceScale = referenceWidth / basePixelWidth.value
      const zoomScale = referenceScale / initialScale.value

      const rect = canvasWrapper.value.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      panzoom.zoomAbs(centerX, centerY, zoomScale)
    }

    displayScale.value = 100
    updateScaleLimits()
    updateDisplayScale()
    closeCalibration()
  }

  function applyCardCalibration(panzoom, basePixelWidth, initialScale, canvasWrapper, displayScale) {
    if (!cardImageEl.value) {
      calibrationError.value = 'Card image not loaded.'
      return
    }

    const cardRect = cardImageEl.value.getBoundingClientRect()
    const displayedCardWidth = cardRect.width

    if (!displayedCardWidth || displayedCardWidth <= 0) {
      calibrationError.value = 'Could not measure card size.'
      return
    }

    const measuredDpi = (displayedCardWidth * 25.4) / CARD_WIDTH_MM
    const savedDpi = measuredDpi * getPageZoom()
    calibrationDpi.value = savedDpi
    localStorage.setItem(CALIBRATION_KEY, String(savedDpi))

    detachCalibrationListeners()
    attachCalibrationListeners()

    const newDpi = savedDpi / getPageZoom()
    screenDPI.value = newDpi

    if (panzoom && basePixelWidth.value > 0) {
      const referenceWidth = (referenceWidthMm.value / 25.4) * screenDPI.value
      const referenceScale = referenceWidth / basePixelWidth.value
      const zoomScale = referenceScale / initialScale.value

      const rect = canvasWrapper.value.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      panzoom.zoomAbs(centerX, centerY, zoomScale)
    }

    displayScale.value = 100
    updateScaleLimits()
    updateDisplayScale()
    closeCalibration()
  }

  function clearCalibration() {
    localStorage.removeItem(CALIBRATION_KEY)
    calibrationDpi.value = null

    detachCalibrationListeners()
    measureCssDpi()
    updateScaleLimits()
    updateDisplayScale()
  }

  function measureCssDpi() {
    const el = document.createElement('div')
    el.style.width = '1in'
    el.style.position = 'absolute'
    el.style.visibility = 'hidden'
    document.body.appendChild(el)
    const cssDpi = el.offsetWidth || 96
    document.body.removeChild(el)
    screenDPI.value = cssDpi

    updateScaleLimits()
    updateDisplayScale()
  }

  function initCalibration() {
    const savedDpi = parseFloat(localStorage.getItem(CALIBRATION_KEY))

    if (Number.isFinite(savedDpi) && savedDpi > 20 && savedDpi < 2000) {
      calibrationDpi.value = savedDpi
      attachCalibrationListeners()
      updateCalibratedDpi()
    } else {
      measureCssDpi()
    }

    const savedSlider = parseFloat(localStorage.getItem(CARD_SLIDER_KEY))
    if (Number.isFinite(savedSlider) && savedSlider >= 30 && savedSlider <= 200) {
      cardSliderValue.value = savedSlider
    }

    const savedReferenceWidth = parseFloat(localStorage.getItem(REF_WIDTH_KEY))
    if (Number.isFinite(savedReferenceWidth) && savedReferenceWidth > 0) {
      referenceWidthMm.value = savedReferenceWidth
    }
  }

  return {
    calibrationDpi,
    calibrationOpen,
    calibrationMeasured,
    calibrationLineEl,
    calibrationCssPx,
    calibrationError,
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
    measureCalibrationLine,
    measureCssDpi,
    initCalibration,
    detachCalibrationListeners,
    getPageZoom,
  }
}