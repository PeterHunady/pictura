// Author: Peter Huňady (xhunadp00)
// File: useHistory.js
// Bachelor's Thesis, VUT Brno, 2026

import { ref } from 'vue'
import { hasAlphaImage } from './imageProcessing'

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
  imgTransparent
}) {
  const history = []
  const future = []
  const origSnapshot = ref(null)

  // always return a copy, so the snapshot is not changed when originalPdf changes later
  function pdfBytes() {
    return originalPdf.value instanceof Uint8Array ? originalPdf.value.slice() : new Uint8Array(originalPdf.value)
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

  async function restoreSnapshot(snap) {
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
      await renderPdfPage(snap.page || 1)
    } else {
      isPdf.value = false
      originalFileName.value = snap.name
      originalFileType.value = snap.type
      originalFileSize.value = snap.size
      originalLastModified.value = snap.lastModified

      preview.value = snap.dataUrl
      emit('update:preview', preview.value)

      // image size is known only after loading, so meta and overlay setup must be in onload
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
        imgTransparent.value = false
        const isAlpha = hasAlphaImage(img)
        setHasAlpha(isAlpha)

        // transparent images do not have a clear background color, so skip detection
        if (!isAlpha) {
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
    // any new action clears redo history, and .length = 0 clears it without making a new array
    future.length = 0

    if (history.length > MAX_HISTORY) {
      history.shift()
    }
  }

  async function undo() {
    const snap = history.pop()
    if (!snap) {
      return
    }

    // save the current state to redo before going back
    const currentSnap = makeSnapshot()
    future.push(currentSnap)

    await restoreSnapshot(snap)
  }

  async function redo() {
    const snap = future.pop()
    if (!snap) {
      return
    }

    const currentSnap = makeSnapshot()
    history.push(currentSnap)
    await restoreSnapshot(snap)
  }

  async function resetToOriginal() {
    if (!origSnapshot.value) {
      return
    }

    history.length = 0
    future.length = 0
    await restoreSnapshot(origSnapshot.value)
  }

  // run this when a new file is loaded, so old history is removed
  function saveOriginalSnapshot() {
    origSnapshot.value = makeSnapshot()
    history.length = 0
  }

  function clearHistory() {
    history.length = 0
    future.length = 0
    origSnapshot.value = null
  }

  return {
    history,
    future,
    origSnapshot,
    pushHistory,
    undo,
    redo,
    resetToOriginal,
    saveOriginalSnapshot,
    makeSnapshot,
    clearHistory,
  }
}