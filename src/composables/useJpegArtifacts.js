import { ref } from 'vue'
import { bilateralOnceRGB, sobelMag, dilate1px, gaussianBlur } from '../utils/imageProcessing'

export function useJpegArtifacts({ markCanvas, getSourceCanvas, pushHistory, preview, emit, imgEl }) {
  const highlightOn = ref(false)

  function highlightJpegArtifacts(color = '#00E5FF', opts = {}) {
    if (highlightOn.value) {
      clearHighlights(); return
    }

    const { diffThresh = 12, lowEdge = 40, highEdge = 150, dilate = 1 } = opts

    const src = getSourceCanvas(), mc = markCanvas.value
    if (!src || !mc) {
      return
    }

    const W = src.width, H = src.height
    if (mc.width !== W || mc.height !== H) {
      mc.width = W; mc.height = H
    }

    const sctx = src.getContext('2d', { willReadFrequently: true })
    const srcIm = sctx.getImageData(0, 0, W, H)
    const S = srcIm.data
    const B = bilateralOnceRGB(S, W, H, 2, 2, 25)

    const Y = new Float32Array(W * H)
    for (let i = 0, j = 0; i < S.length; i += 4, j++) Y[j] = 0.299 * S[i] + 0.587 * S[i + 1] + 0.114 * S[i + 2]
    const G = sobelMag(Y, W, H)

    const near = new Uint8Array(W * H)
    const core = new Uint8Array(W * H)
    for (let i = 0; i < near.length; i++) {
      if (G[i] > lowEdge) {
        near[i] = 1
      }
      if (G[i] > highEdge) {
        core[i] = 1
      }
    }

    let nearDil = near
    for (let k = 0; k < dilate; k++) {
      nearDil = dilate1px(nearDil, W, H)
    }

    const mask = new Uint8Array(W * H)
    for (let i = 0, j = 0; i < S.length; i += 4, j++) {
      const d = (Math.abs(S[i] - B[i]) + Math.abs(S[i + 1] - B[i + 1]) + Math.abs(S[i + 2] - B[i + 2])) / 3
      const gVal = G[j]
      if (d > diffThresh && nearDil[j] && !core[j] && gVal < 50) {
        mask[j] = 1
      }
    }

    const cr = parseInt(color.slice(1, 3), 16)
    const cg = parseInt(color.slice(3, 5), 16)
    const cb = parseInt(color.slice(5, 7), 16)
    const A = 255

    const octx = mc.getContext('2d')
    const oIm = octx.createImageData(W, H)
    const O = oIm.data

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = y * W + x
        if (!mask[id]) {
          continue
        }

        const k = id * 4
        O[k] = cr; O[k + 1] = cg; O[k + 2] = cb; O[k + 3] = A
      }
    }
    octx.putImageData(oIm, 0, 0)
    highlightOn.value = true
  }

  function fixJpegArtifacts() {
    clearHighlights()
    pushHistory()
    const img = imgEl.value;
    if (!img?.naturalWidth) {
      return;
    }

    const W = img.naturalWidth, H = img.naturalHeight;

    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const ctxOff = off.getContext('2d', { willReadFrequently: true });
    ctxOff.drawImage(img, 0, 0, W, H);

    const src0 = ctxOff.getImageData(0, 0, W, H);
    const s0 = src0.data;
    const dst0 = ctxOff.createImageData(W, H);
    const d0 = dst0.data;

    const r = 2;
    const twoσs2 = 2 * 2 * 2, twoσr2 = 2 * 25 * 25;

    const sp = new Array(2 * r + 1).fill(0).map((_, i) => {
      const x = i - r; return Math.exp(- (x * x) / twoσs2);
    });

    for (let y = r; y < H - r; y++) {
      for (let x = r; x < W - r; x++) {
        const i0 = (y * W + x) * 4;
        const r0 = s0[i0], g0 = s0[i0 + 1], b0 = s0[i0 + 2];
        let wsum = 0, sr = 0, sg = 0, sb = 0;

        for (let dy = -r; dy <= r; dy++) {
          const wy = sp[dy + r];
          for (let dx = -r; dx <= r; dx++) {
            const wx = sp[dx + r];
            const wS = wy * wx;
            const ii = ((y + dy) * W + (x + dx)) * 4;
            const dr = s0[ii] - r0;
            const dg = s0[ii + 1] - g0;
            const db = s0[ii + 2] - b0;
            const wR = Math.exp(-(dr * dr + dg * dg + db * db) / twoσr2);
            const w = wS * wR;

            wsum += w;
            sr += s0[ii] * w;
            sg += s0[ii + 1] * w;
            sb += s0[ii + 2] * w;
          }
        }

        d0[i0] = sr / wsum;
        d0[i0 + 1] = sg / wsum;
        d0[i0 + 2] = sb / wsum;
        d0[i0 + 3] = s0[i0 + 3];
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < r || y >= H - r || x < r || x >= W - r) {
          const i = (y * W + x) * 4;
          d0[i] = s0[i]; d0[i + 1] = s0[i + 1]; d0[i + 2] = s0[i + 2]; d0[i + 3] = s0[i + 3];
        }
      }
    }
    ctxOff.putImageData(dst0, 0, 0);

    const ctx = off.getContext('2d');
    const blurred = ctx.getImageData(0, 0, W, H);
    const gauss = gaussianBlur(blurred, W, H, 5, 1.0);
    const G = gauss.data;

    const finalImg = ctx.createImageData(W, H);
    const F = finalImg.data;
    const M = dst0.data;
    const amount = 1.5;

    for (let i = 0; i < M.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const detail = M[i + c] - G[i + c];
        F[i + c] = Math.min(255, Math.max(0, M[i + c] + amount * detail));
      }
      F[i + 3] = M[i + 3];
    }

    ctx.putImageData(finalImg, 0, 0);

    const newSrc = off.toDataURL('image/png');
    preview.value = newSrc;
    emit('update:preview', newSrc);
  }

  function clearHighlights() {
    const mc = markCanvas.value; if (!mc) return
    mc.getContext('2d').clearRect(0, 0, mc.width, mc.height)
    highlightOn.value = false
  }

  return {
    highlightOn,
    highlightJpegArtifacts,
    fixJpegArtifacts,
    clearHighlights,
  }
}