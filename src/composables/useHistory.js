import { ref } from 'vue'
import { hasAlphaImage } from '../utils/imageProcessing'

const MAX_HISTORY = 30

export function useHistory({
  isPdf,
  preview,
  originalFileName,
  originalFileType,
  originalFileSize,
  originalLastModified,
  originalPdf,
  currentPage,
  emit,
  renderPdfPage,
  setupOverlay,
  setHasAlpha,
  detectBackground,
  initPanzoom,
  madeTransparentImg
}) {
  const history = []
  const origSnapshot = ref(null)

  function pdfBytes() {
    return originalPdf.value instanceof Uint8Array ? originalPdf.value.slice() : new Uint8Array(originalPdf.value)
  }

  function makeDocSig() {
    return `${originalFileName.value}|${originalFileSize.value}|${originalLastModified.value}`
  }

  function makeSnapshot() {
    if (isPdf.value) {
      return {
        kind: 'pdf',
        bytes: pdfBytes(),
        name: originalFileName.value,
        type: 'application/pdf',
        size: originalFileSize.value,
        lastModified: originalLastModified.value,
        page: currentPage.value,
      }
    } else {
      return {
        kind: 'image',
        dataUrl: preview.value,
        name: originalFileName.value,
        type: originalFileType.value || 'image/png',
        size: preview.value ? atob((preview.value.split(',')[1] || '')).length : 0,
        lastModified: originalLastModified.value || Date.now(),
      }
    }
  }

  function restoreSnapshot(snap) {
    if (!snap) {
      return
    }

    if (snap.kind === 'pdf') {
      originalPdf.value = snap.bytes
      originalFileName.value = snap.name
      originalFileSize.value = snap.size
      originalLastModified.value = snap.lastModified
      isPdf.value = true

      preview.value = URL.createObjectURL(new Blob([snap.bytes], { type: 'application/pdf' }))
      emit('update:preview', preview.value)
      renderPdfPage(snap.page || 1)
    } else {
      isPdf.value = false
      originalFileName.value = snap.name
      originalFileType.value = snap.type
      originalFileSize.value = snap.size
      originalLastModified.value = snap.lastModified

      preview.value = snap.dataUrl
      emit('update:preview', preview.value)

      const img = new Image()
      img.onload = () => {
        emit('update:meta', {
          name: snap.name,
          type: snap.type,
          size: snap.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
          lastModified: snap.lastModified,
        })
        setupOverlay(img.naturalWidth, img.naturalHeight)
        madeTransparentImg.value = false
        const alphaNow = hasAlphaImage(img)
        setHasAlpha(alphaNow)
        if (!alphaNow) {
          detectBackground()
        } else {
          emit('update:bgcolor', null)
        }
      }
      img.src = snap.dataUrl
    }
  }

  function pushHistory() {
    if (!preview.value && !isPdf.value) {
      return
    }

    const snap = makeSnapshot()
    history.push(snap)

    if (history.length > MAX_HISTORY) {
      history.shift()
    }
  }

  function undo() {
    const snap = history.pop()
    if (!snap) {
      return
    }

    restoreSnapshot(snap)
  }

  function resetToOriginal() {
    if (!origSnapshot.value) {
      return
    }

    history.length = 0
    restoreSnapshot(origSnapshot.value)
  }

  function saveOriginalSnapshot() {
    origSnapshot.value = makeSnapshot()
    history.length = 0
  }

  return {
    history,
    origSnapshot,
    pushHistory,
    undo,
    resetToOriginal,
    saveOriginalSnapshot,
    makeSnapshot,
  }
}