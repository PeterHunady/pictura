export function applyBilateralFilter(srcPixels, width, height, radius = 2, spatialDistance = 2, colorSimilarity = 25) {
  const spatialDivider = 2 * spatialDistance * spatialDistance
  const colorDivider = 2 * colorSimilarity * colorSimilarity

  const spatialWeights = new Float32Array(2 * radius + 1)
  for (let i = 0; i < spatialWeights.length; i++) {
    const offset = i - radius
    spatialWeights[i] = Math.exp(-(offset * offset) / spatialDivider)
  }

  const outputPixels = new Uint8ClampedArray(width * height * 4)

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const centerIndex = (y * width + x) * 4
      const centerR = srcPixels[centerIndex]
      const centerG = srcPixels[centerIndex + 1]
      const centerB = srcPixels[centerIndex + 2]
      let weightSum = 0, sumR = 0, sumG = 0, sumB = 0

      for (let dy = -radius; dy <= radius; dy++) {
        const yWeight = spatialWeights[dy + radius]

        for (let dx = -radius; dx <= radius; dx++) {
          const neighborIndex = ((y + dy) * width + (x + dx)) * 4
          const diffR = srcPixels[neighborIndex] - centerR
          const diffG = srcPixels[neighborIndex + 1] - centerG
          const diffB = srcPixels[neighborIndex + 2] - centerB
          const weight = yWeight * spatialWeights[dx + radius] * Math.exp(-(diffR * diffR + diffG * diffG + diffB * diffB) / colorDivider)

          weightSum += weight
          sumR += srcPixels[neighborIndex] * weight
          sumG += srcPixels[neighborIndex + 1] * weight
          sumB += srcPixels[neighborIndex + 2] * weight
        }
      }

      outputPixels[centerIndex] = sumR / weightSum
      outputPixels[centerIndex + 1] = sumG / weightSum
      outputPixels[centerIndex + 2] = sumB / weightSum
      outputPixels[centerIndex + 3] = srcPixels[centerIndex + 3]
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y >= radius && y < height - radius && x >= radius && x < width - radius) {
        continue
      }
      
      const i = (y * width + x) * 4
      outputPixels[i] = srcPixels[i]
      outputPixels[i + 1] = srcPixels[i + 1]
      outputPixels[i + 2] = srcPixels[i + 2]
      outputPixels[i + 3] = srcPixels[i + 3]
    }
  }

  return outputPixels
}

export function bilateralFilterImageData(srcData, width, height, radius, spatialDistance, colorSimilarity) {
  const filteredPixels = applyBilateralFilter(srcData.data, width, height, radius, spatialDistance, colorSimilarity)
  return new ImageData(filteredPixels, width, height)
}

export function sobelGradient(luminance, width, height) {
  const magnitude = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      const rowAbove = width * (y - 1)
      const rowCenter = width * y
      const rowBelow = width * (y + 1)
      const gradientX = -luminance[rowAbove + x - 1] - 2 * luminance[rowCenter + x - 1] - luminance[rowBelow + x - 1] + luminance[rowAbove + x + 1] + 2 * luminance[rowCenter + x + 1] + luminance[rowBelow + x + 1]
      const gradientY = luminance[rowAbove + x - 1] + 2 * luminance[rowAbove + x] + luminance[rowAbove + x + 1] - luminance[rowBelow + x - 1] - 2 * luminance[rowBelow + x] - luminance[rowBelow + x + 1]
      magnitude[index] = Math.abs(gradientX) + Math.abs(gradientY)
    }
  }

  return magnitude
}

export function gaussianBlur(imageData, width, height, kernelSize, blurAmount) {
  const data = imageData.data
  const half = Math.floor(kernelSize / 2)

  const kernel = Array.from({ length: kernelSize }, (_, i) => {
    const x = i - half
    return Math.exp(-(x * x) / (2 * blurAmount * blurAmount))
  })
  
  const kernelSum = kernel.reduce((a, b) => a + b, 0)
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum
  }

  const horizontal = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let j = 0; j < 4; j++) {
        let valueSum = 0
        for (let k = -half; k <= half; k++) {
          const sourceX = Math.min(width - 1, Math.max(0, x + k))
          valueSum += data[(y * width + sourceX) * 4 + j] * kernel[k + half]
        }
        horizontal[(y * width + x) * 4 + j] = valueSum
      }
    }
  }

  const result = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let j = 0; j < 4; j++) {
        let valueSum = 0
        for (let k = -half; k <= half; k++) {
          const sourceY = Math.min(height - 1, Math.max(0, y + k))
          valueSum += horizontal[(sourceY * width + x) * 4 + j] * kernel[k + half]
        }
        result[(y * width + x) * 4 + j] = valueSum
      }
    }
  }

  return new ImageData(result, width, height)
}

export function unsharpMask(filteredData, width, height, blurSize, blurAmount, sharpenStrength) {
  const gaussianData = gaussianBlur(filteredData, width, height, blurSize, blurAmount)
  const filteredPixels = filteredData.data
  const gaussianPixels = gaussianData.data

  const result = new ImageData(width, height)
  const resultPixels = result.data

  for (let i = 0; i < filteredPixels.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      const detail = filteredPixels[i + j] - gaussianPixels[i + j]
      resultPixels[i + j] = Math.min(255, Math.max(0, filteredPixels[i + j] + sharpenStrength * detail))
    }
    resultPixels[i + 3] = filteredPixels[i + 3]
  }

  return result
}

export function canvasHasAlpha(src, stepHint = 200) {
  if (!src?.width || !src?.height) {
    return false
  }

  const width = src.width
  const height = src.height
  const context = src.getContext('2d', { willReadFrequently: true })
  const step = Math.max(1, Math.floor(Math.min(width, height) / stepHint))

  for (let y = 0; y < height; y += step) {
    const row = context.getImageData(0, y, width, 1).data
    for (let x = 0; x < width; x += step) {
      if (row[x * 4 + 3] < 255) {
        return true
      }
    }
  }
  return false
}

export function hasAlphaImage(imageEl) {
  const width = imageEl.naturalWidth
  const height = imageEl.naturalHeight
  if (!width || !height) {
    return false
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(imageEl, 0, 0)
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200))

  for (let y = 0; y < height; y += step) {
    const row = context.getImageData(0, y, width, 1).data
    for (let x = 0; x < width; x += step) {
      if (row[x * 4 + 3] < 255) {
        return true
      }
    }
  }
  return false
}

export function canvasToBlob(canvas, type) {
  return new Promise(res => canvas.toBlob(b => res(b), type))
}

export function dataURLtoU8(dataURL) {
  const b64 = dataURL.split(',')[1]
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)

  for (let i = 0; i < bin.length; i++) {
    u8[i] = bin.charCodeAt(i)
  }
  return u8
}

export function extOf(fmt) {
  return fmt === 'jpg' ? 'jpg' : (fmt === 'png' ? 'png' : 'pdf')
}

export function hexToRgb(hex) {
  let cleaned = (hex || '').replace('#', '').trim()
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(ch => ch + ch).join('')
  }

  return {r: parseInt(cleaned.slice(0, 2), 16) || 0, g: parseInt(cleaned.slice(2, 4), 16) || 0, b: parseInt(cleaned.slice(4, 6), 16) || 0}
}

export function rgbToHex({ r, g, b }) {
  const to2 = v => v.toString(16).padStart(2, '0')
  return '#' + to2(r) + to2(g) + to2(b)
}