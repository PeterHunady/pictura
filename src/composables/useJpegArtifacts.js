import { ref } from 'vue'
import { applyBilateralFilter, sobelGradient, bilateralFilterImageData, unsharpMask } from './imageProcessing'

const BILATERAL_RADIUS = 4
const BILATERAL_SPATIAL_DISTANCE = 4
const BILATERAL_COLOR_SIMILARITY = 60
const SHARPEN_BLUR_SIZE = 5
const SHARPEN_BLUR_AMOUNT = 1.0
const SHARPEN_STRENGTH = 1.5

export function useJpegArtifacts({ markCanvas, getSourceCanvas, pushHistory, preview, emit, imgEl }) {
  const highlightOn = ref(false)

  function highlightJpegArtifacts(color = '#00E5FF', opts = {}) {
    if (highlightOn.value) {
      clearHighlights()
      return
    }

    const { diffThresh = 12, lowEdge = 40, highEdge = 150, gradLimit = 120 } = opts

    const src = getSourceCanvas()
    const markCanvasEl = markCanvas.value
    if (!src || !markCanvasEl) {
      return
    }

    const width = src.width
    const height = src.height
    if (markCanvasEl.width !== width || markCanvasEl.height !== height) {
      markCanvasEl.width = width
      markCanvasEl.height = height
    }

    const sourceContext = src.getContext('2d', { willReadFrequently: true })
    const srcImageData = sourceContext.getImageData(0, 0, width, height)
    const srcPixels = srcImageData.data
    const bilateralPixels = applyBilateralFilter(srcPixels, width, height, 2, 2, 25)

    const luminance = new Float32Array(width * height)
    for (let i = 0, j = 0; i < srcPixels.length; i += 4, j++) {
      luminance[j] = 0.299 * srcPixels[i] + 0.587 * srcPixels[i + 1] + 0.114 * srcPixels[i + 2]
    }

    const gradient = sobelGradient(luminance, width, height)
    const nearEdge = new Uint8Array(width * height)
    const strongEdge = new Uint8Array(width * height)
    for (let i = 0; i < nearEdge.length; i++) {
      if (gradient[i] > lowEdge) {
        nearEdge[i] = 1
      }
      if (gradient[i] > highEdge) {
        strongEdge[i] = 1
      }
    }

    const mask = new Uint8Array(width * height)
    for (let i = 0, j = 0; i < srcPixels.length; i += 4, j++) {
      const avgDiff = (Math.abs(srcPixels[i] - bilateralPixels[i]) + Math.abs(srcPixels[i + 1] - bilateralPixels[i + 1]) + Math.abs(srcPixels[i + 2] - bilateralPixels[i + 2])) / 3
      if (avgDiff > diffThresh && nearEdge[j] && !strongEdge[j] && gradient[j] < gradLimit) {
        mask[j] = 1
      }
    }

    const colorR = parseInt(color.slice(1, 3), 16)
    const colorG = parseInt(color.slice(3, 5), 16)
    const colorB = parseInt(color.slice(5, 7), 16)

    const markContext = markCanvasEl.getContext('2d')
    const overlayImageData = markContext.createImageData(width, height)
    const overlayPixels = overlayImageData.data

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (!mask[index]) {
          continue
        }

        const dataIndex = index * 4
        overlayPixels[dataIndex] = colorR
        overlayPixels[dataIndex + 1] = colorG
        overlayPixels[dataIndex + 2] = colorB
        overlayPixels[dataIndex + 3] = 255
      }
    }

    markContext.putImageData(overlayImageData, 0, 0)
    highlightOn.value = true
  }

  function fixJpegArtifacts() {
    clearHighlights()
    pushHistory()

    const img = imgEl.value
    if (!img?.naturalWidth) {
      return
    }

    const width = img.naturalWidth
    const height = img.naturalHeight
    const offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height

    const context = offscreen.getContext('2d', { willReadFrequently: true })
    context.drawImage(img, 0, 0, width, height)
    const srcData = context.getImageData(0, 0, width, height)
    const bilateralResult = bilateralFilterImageData(srcData, width, height, BILATERAL_RADIUS, BILATERAL_SPATIAL_DISTANCE, BILATERAL_COLOR_SIMILARITY)
    const sharpenedResult = unsharpMask(bilateralResult, width, height, SHARPEN_BLUR_SIZE, SHARPEN_BLUR_AMOUNT, SHARPEN_STRENGTH)
    context.putImageData(sharpenedResult, 0, 0)

    const newSrc = offscreen.toDataURL('image/png')
    preview.value = newSrc
    emit('update:preview', newSrc)
  }

  function clearHighlights() {
    const markCanvasEl = markCanvas.value
    if (!markCanvasEl) {
      return
    }

    markCanvasEl.getContext('2d').clearRect(0, 0, markCanvasEl.width, markCanvasEl.height)
    highlightOn.value = false
  }

  return {
    highlightOn,
    highlightJpegArtifacts,
    fixJpegArtifacts,
    clearHighlights,
  }
}