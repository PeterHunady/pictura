import { ref, nextTick } from 'vue'
import panzoom from 'panzoom'

const PZ_MIN_ZOOM = 0.2
const PZ_MAX_ZOOM = 20

export function usePanzoom({
  isPdf,
  pdfCanvas,
  imgEl,
  previewWrap,
  panCont,
  markCanvas,
  emit,
  displayScale,
  referenceWidthMm,
  screenDPI,
  basePixelWidth,
  minScalePct,
  maxScalePct,
  highlightOn,
  endPreviewBackgroundColor
}) {
  let pz = null
  const initialScale = ref(1)
  const absMinScale = ref(null)
  const absMaxScale = ref(null)

  const lastPointer = { x: null, y: null }
  let pointerListenersAttached = false

  function rememberPointer(e) {
    lastPointer.x = e.clientX
    lastPointer.y = e.clientY
  }

  function getDisplayScaleBounds() {
    const natW = basePixelWidth.value || 1
    const referenceWidthCssPx = (referenceWidthMm.value / 25.4) * screenDPI.value
    const minAbs = (absMinScale.value ?? ((initialScale.value || 1) * PZ_MIN_ZOOM))
    const maxAbs = (absMaxScale.value ?? ((initialScale.value || 1) * PZ_MAX_ZOOM))
    const minPct = (natW * minAbs / referenceWidthCssPx) * 100
    const maxPct = (natW * maxAbs / referenceWidthCssPx) * 100
    return { minPct, maxPct }
  }

  function recomputeScaleBounds() {
    const { minPct, maxPct } = getDisplayScaleBounds()
    minScalePct.value = minPct
    maxScalePct.value = maxPct
  }

  function updateDisplayScale() {
    if (!pz || !basePixelWidth.value) return

    const currentTransform = pz.getTransform()
    const absoluteScale = initialScale.value * currentTransform.scale
    const currentWidthCssPx = basePixelWidth.value * absoluteScale
    const referenceWidthCssPx = (referenceWidthMm.value / 25.4) * screenDPI.value

    const pct = (currentWidthCssPx / referenceWidthCssPx) * 100
    displayScale.value = pct

    emit('update:scale', {
      displayScale: displayScale.value,
      referenceWidthMm: referenceWidthMm.value,
      basePixelWidth: basePixelWidth.value,
      minDisplayScale: minScalePct.value,
      maxDisplayScale: maxScalePct.value,
    })
  }

  function setDisplayScale(newScale) {
    if (!pz || !basePixelWidth.value) return

    const targetPct = Math.max(
      minScalePct.value,
      Math.min(maxScalePct.value, Number(newScale) || 0)
    )

    const referenceWidthPx = (referenceWidthMm.value / 25.4) * screenDPI.value
    const targetScreenWidthPx = (targetPct / 100) * referenceWidthPx

    const targetAbsoluteScale = targetScreenWidthPx / basePixelWidth.value
    const currentTransform = pz.getTransform()
    const currentUserScale = currentTransform.scale || 1

    let targetUserScale = targetAbsoluteScale / (initialScale.value || 1)

    const minUserZoom = pz.getMinZoom ? pz.getMinZoom() : PZ_MIN_ZOOM
    const maxUserZoom = pz.getMaxZoom ? pz.getMaxZoom() : PZ_MAX_ZOOM
    targetUserScale = Math.max(minUserZoom, Math.min(maxUserZoom, targetUserScale))

    const factor = targetUserScale / currentUserScale
    if (!isFinite(factor) || Math.abs(factor - 1) < 1e-4) {
      return
    }

    const wrap = previewWrap.value
    if (!wrap) return

    const wrapRect = wrap.getBoundingClientRect()

    const BIG_JUMP_FACTOR = 2
    const isBigJump = factor >= BIG_JUMP_FACTOR || factor <= 1 / BIG_JUMP_FACTOR

    let cx = wrapRect.left + wrapRect.width / 2
    let cy = wrapRect.top + wrapRect.height / 2

    if (!isBigJump && lastPointer.x != null && lastPointer.y != null) {
      cx = lastPointer.x
      cy = lastPointer.y
    }

    pz.zoomTo(cx, cy, factor)

    nextTick(() => updateDisplayScale())
  }
  
  function setReferenceWidth(newWidthMm) {
    referenceWidthMm.value = newWidthMm
    recomputeScaleBounds()
    updateDisplayScale()
  }

  async function initPanzoom() {
    await nextTick()
    const elem = isPdf.value ? pdfCanvas.value : imgEl.value
    if (!elem) {
      return
    }

    const natW = isPdf.value ? elem.width : elem.naturalWidth
    const natH = isPdf.value ? elem.height : elem.naturalHeight

    const wrap = previewWrap.value

    if (wrap && !pointerListenersAttached) {
      wrap.addEventListener('mousemove', rememberPointer)
      wrap.addEventListener('mousedown', rememberPointer)

      wrap.addEventListener(
        'touchstart',
        (ev) => {
          const t = ev.touches && ev.touches[0]
          if (t) rememberPointer(t)
        },
        { passive: true }
      )

      wrap.addEventListener(
        'wheel',
        (ev) => {
          rememberPointer(ev)

          if (ev.ctrlKey || ev.metaKey) {
            return
          }

          ev.preventDefault()
          const scrollSpeed = 0.5
          if (pz) {
            pz.moveBy(0, -ev.deltaY * scrollSpeed)
          }
        },
        { passive: false }
      )

      pointerListenersAttached = true
    }

    const scaleW = Math.floor(wrap.clientWidth) / natW
    const scaleH = Math.floor(wrap.clientHeight) / natH
    initialScale.value = Math.min(scaleW, scaleH)

    if (pz) {
      pz.dispose(); pz = null
    }

    panCont.value.style.transform = 'translate(0px, 0px) scale(1)'

    panCont.value.style.width = `${natW * initialScale.value}px`
    panCont.value.style.height = `${natH * initialScale.value}px`

    absMinScale.value = initialScale.value * PZ_MIN_ZOOM
    absMaxScale.value = initialScale.value * PZ_MAX_ZOOM
    pz = panzoom(panCont.value, {
      minZoom: absMinScale.value / initialScale.value,
      maxZoom: absMaxScale.value / initialScale.value,
      bounds: false,
      boundsPadding: 0.1,
      beforeWheel: function (e) {
        const isZoomGesture = e.ctrlKey || e.metaKey
        return !isZoomGesture
      },
    })

    pz.on('zoom', updateDisplayScale)
    pz.on('pan', updateDisplayScale)

    if (wrap) {
      const contW = natW * initialScale.value
      const contH = natH * initialScale.value
      const offsetX = (wrap.clientWidth - contW) / 2
      const offsetY = (wrap.clientHeight - contH) / 2
      pz.moveTo(offsetX, offsetY)
    }

    markCanvas.value.width = natW
    markCanvas.value.height = natH
    const mctx = markCanvas.value.getContext('2d')
    mctx.clearRect(0, 0, natW, natH)
    highlightOn.value = false

    basePixelWidth.value = natW
    recomputeScaleBounds()
    updateDisplayScale()
    endPreviewBackgroundColor()
  }

  function adjustForContainerResize() {
    const elem = isPdf.value ? pdfCanvas.value : imgEl.value
    const wrap = previewWrap.value
    if (!elem || !wrap || !panCont.value) {
      return
    }

    const natW = isPdf.value ? elem.width : elem.naturalWidth
    const natH = isPdf.value ? elem.height : elem.naturalHeight

    const oldInit = initialScale.value || 1
    const oldT = pz ? pz.getTransform() : { x: 0, y: 0, scale: 1 }

    const newInit = Math.min(wrap.clientWidth / natW, wrap.clientHeight / natH) || 1

    if (Math.abs(newInit - oldInit) < 0.0001) {
      return
    }

    const oldCx = wrap.clientWidth / 2
    const oldCy = wrap.clientHeight / 2

    const oldAbsoluteScale = oldInit * oldT.scale
    const contentX = (oldCx - oldT.x) / oldAbsoluteScale
    const contentY = (oldCy - oldT.y) / oldAbsoluteScale

    initialScale.value = newInit

    if (pz) {
      pz.dispose(); pz = null
    }

    panCont.value.style.transform = 'translate(0px, 0px) scale(1)'
    panCont.value.style.width = `${natW * newInit}px`
    panCont.value.style.height = `${natH * newInit}px`

    absMinScale.value = newInit * PZ_MIN_ZOOM
    absMaxScale.value = newInit * PZ_MAX_ZOOM

    pz = panzoom(panCont.value, {
      minZoom: PZ_MIN_ZOOM,
      maxZoom: PZ_MAX_ZOOM,
      bounds: false,
      boundsPadding: 0.1,
      beforeWheel: function (e) {
        const isZoomGesture = e.ctrlKey || e.metaKey
        return !isZoomGesture
      },
    })

    pz.on('zoom', updateDisplayScale)
    pz.on('pan', updateDisplayScale)

    const newUserScale = oldAbsoluteScale / newInit
    const newCx = wrap.clientWidth / 2
    const newCy = wrap.clientHeight / 2
    const tx = newCx - contentX * newInit * newUserScale
    const ty = newCy - contentY * newInit * newUserScale

    pz.zoomAbs(0, 0, newUserScale)
    pz.moveTo(tx, ty)
    recomputeScaleBounds()
    updateDisplayScale()
  }

  function disposePanzoom() {
    if (pz) {
      pz.dispose()
      pz = null
    }
  }

  function getPanzoom() {
    return pz
  }

  return {
    initialScale,
    absMinScale,
    absMaxScale,
    initPanzoom,
    updateDisplayScale,
    setDisplayScale,
    setReferenceWidth,
    recomputeScaleBounds,
    adjustForContainerResize,
    disposePanzoom,
    getPanzoom,
  }
}