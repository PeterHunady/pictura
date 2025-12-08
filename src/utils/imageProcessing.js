export function bilateralOnceRGB(S, W, H, r = 2, sigmaS = 2, sigmaR = 25) {
  const twoσs2 = 2 * sigmaS * sigmaS
  const twoσr2 = 2 * sigmaR * sigmaR
  const sp = new Float32Array(2*r+1)
  for (let i=0;i<sp.length;i++) { const x = i-r; sp[i] = Math.exp(-(x*x)/twoσs2) }

  const out = new Uint8ClampedArray(W*H*4)
  for (let y=r; y < H-r; y++) {
    for (let x=r; x < W-r; x++) {
      const i0 = (y*W + x)*4
      const r0 = S[i0], g0 = S[i0+1], b0 = S[i0+2]
      let wsum=0, sr=0, sg=0, sb=0

      for (let dy=-r; dy<=r; dy++){
        const wy = sp[dy+r]
        for (let dx=-r; dx<=r; dx++){
          const wx = sp[dx+r]
          const ii = ((y+dy)*W + (x+dx))*4
          const dr = S[ii]   - r0
          const dg = S[ii+1] - g0
          const db = S[ii+2] - b0
          const w  = wy*wx * Math.exp(-(dr*dr+dg*dg+db*db)/twoσr2)
          wsum += w; sr += S[ii]*w; sg += S[ii+1]*w; sb += S[ii+2]*w
        }
      }

      out[i0] = sr/wsum
      out[i0+1] = sg/wsum
      out[i0+2] = sb/wsum
      out[i0+3] = S[i0+3]
    }
  }

  for (let y = 0; y < H; y++){
    for (let x = 0 ; x < W ; x++){
      if (y>=r && y<H-r && x>=r && x<W-r) {
        continue
      }

      const i = (y*W + x)*4
      out[i]=S[i]; out[i+1]=S[i+1]; out[i+2]=S[i+2]; out[i+3]=S[i+3]
    }
  }
  return out
}

export function sobelMag(Y, W, H){
  const M = new Float32Array(W*H)

  for (let y = 1 ; y < H-1 ; y++){
    for (let x = 1; x < W-1; x++){
      const i = y*W+x
      const ym = W*(y-1), y0=W*y, yp=W*(y+1)
      const gx = -Y[ym+x-1]-2*Y[y0+x-1]-Y[yp+x-1] + Y[ym+x+1]+2*Y[y0+x+1]+Y[yp+x+1]
      const gy = Y[ym+x-1]+2*Y[ym+x]+Y[ym+x+1] - Y[yp+x-1]-2*Y[yp+x]-Y[yp+x+1]
      M[i] = Math.abs(gx)+Math.abs(gy)
    }
  }
  return M
}

export function dilate1px(mask, W, H){
  const out = new Uint8Array(W*H)

  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++){
      let on = 0

      for (let dy=-1;dy<=1;dy++){
        const yy = Math.min(H-1, Math.max(0, y+dy))

        for (let dx=-1;dx<=1;dx++){
          const xx = Math.min(W-1, Math.max(0, x+dx))
          if (mask[yy*W+xx]) {
            on=1;
            break
          }
        }
        if (on) {
          break
        }
      }
      out[y*W+x]=on
    }
  }
  return out
}

export function gaussianBlur(imageData, W, H, kSize, sigma){
  const data = imageData.data;
  const half = Math.floor(kSize/2);
  const ga = new Array(kSize).fill(0).map((_,i)=>{
    const x = i-half; return Math.exp(- (x*x)/(2*sigma*sigma));
  });

  const s = ga.reduce((a,b)=>a+b,0);
  for (let i=0;i<ga.length;i++) ga[i]/=s;

  const tmp = new Uint8ClampedArray(data.length);
  for (let y=0; y<H; y++){
    for (let x=0; x<W; x++){
      for (let c=0; c<4; c++){
        let acc=0;
        for (let k=-half;k<=half;k++){
          const xx = Math.min(W-1, Math.max(0, x+k));
          acc += data[(y*W+xx)*4 + c] * ga[k+half];
        }
        tmp[(y*W+x)*4 + c] = acc;
      }
    }
  }

  const out = new Uint8ClampedArray(data.length);

  for (let y=0; y<H; y++){
    for (let x=0; x<W; x++){
      for (let c=0; c<4; c++){
        let acc=0;
        for (let k=-half;k<=half;k++){
          const yy = Math.min(H-1, Math.max(0, y+k));
          acc += tmp[(yy*W+x)*4 + c] * ga[k+half];
        }
        out[(y*W+x)*4 + c] = acc;
      }
    }
  }
  return new ImageData(out, W, H);
}

export function canvasHasAlpha(src, stepHint = 200) {
  if (!src?.width || !src?.height) return false

  const w = src.width, h = src.height
  const ctx = src.getContext('2d', { willReadFrequently: true })
  const step = Math.max(1, Math.floor(Math.min(w, h) / stepHint))

  for (let y = 0; y < h; y += step) {
    const row = ctx.getImageData(0, y, w, 1).data

    for (let x = 0; x < w; x += step) {
      if (row[x * 4 + 3] < 255) return true
    }
  }
  return false
}

export function hasAlphaImage(imageEl) {
  const w = imageEl.naturalWidth, h = imageEl.naturalHeight
  if (!w || !h) return false

  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(imageEl, 0, 0)
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200))

  for (let y = 0; y < h; y += step) {
    const row = ctx.getImageData(0, y, w, 1).data

    for (let x = 0; x < w; x += step) {
      const a = row[x * 4 + 3]
      if (a < 255) return true
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

  for (let i=0;i<bin.length;i++) {
    u8[i] = bin.charCodeAt(i)
  }
  return u8
}

export function extOf(fmt) {
  return fmt === 'jpg' ? 'jpg' : (fmt === 'png' ? 'png' : 'pdf')
}

export function hexToRgb(hex) {
  let c = (hex || '').replace('#','').trim()
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('')

  return {
    r: parseInt(c.slice(0,2),16) || 0,
    g: parseInt(c.slice(2,4),16) || 0,
    b: parseInt(c.slice(4,6),16) || 0,
  }
}

export function rgbToHex({ r, g, b }) {
  const to2 = v => v.toString(16).padStart(2,'0')
  return '#' + to2(r) + to2(g) + to2(b)
}