<template>
    <div class="dropField" @dragover.prevent @dragenter.prevent @drop.prevent="handleDrop" @click="openFilePicker">
        <p v-if="!preview">Click or drag and drop an image here</p>

        <div v-else class="preview-container">
            <div ref="panCont" class="panzoom-container">
                <img :key="preview" ref="imgEl" :src="preview" class="preview-img" alt="Preview" draggable="false" @load="initPanzoom"/>

                <div v-if="overlayW && overlayH" class="crop-overlay" :style="overlayStyle">
                    <div v-for="dir in dirs" :key="dir" class="handle" :class="dir" @mousedown.stop="startResize(dir, $event)"/>
                </div>
            </div>
        </div>

        <input type="file" ref="fileInput" accept="image/*" hidden @change="handleFileChange"/>
    </div>
</template>

<script setup>
    import { ref, nextTick, computed } from 'vue'
    import panzoom from 'panzoom'

    const preview = ref(null)
    const imgEl = ref(null)
    const panCont = ref(null)
    const fileInput = ref(null)
    let pz = null

    const overlayX = ref(0)
    const overlayY = ref(0)
    const overlayW = ref(0)
    const overlayH = ref(0)

    const initialScale = ref(1)

    const dirs = ['nw','n','ne','e','se','s','sw','w']
    let resizing = false,
    resizeDir = null
    const resizeStart = { rect:null, scale:1, origX:0, origY:0, origW:0, origH:0 }

    const emit = defineEmits(['update:preview','update:meta','update:overlay'])

    function openFilePicker() {
        if (!preview.value) fileInput.value.click()
    }

    function handleFileChange(e) {
        const f = e.target.files[0]
        if (f) loadFile(f)
    }

    function handleDrop(e) {
        const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
        if (f) loadFile(f)
    }

    function loadFile(file) {
        const r = new FileReader()
        r.onload = ev => {
            preview.value = ev.target.result
            emit('update:preview', ev.target.result)

            const img = new Image()
            img.src = ev.target.result
            img.onload = () => {
                emit('update:meta', {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    lastModified: file.lastModified
                })
                showOverlay(img.naturalWidth, img.naturalHeight, 0, 0)
            }
        }
        r.readAsDataURL(file)
    }

    async function initPanzoom() {
        await nextTick()
        const img  = imgEl.value
        const wrap = panCont.value.parentElement

        initialScale.value = Math.min(
            wrap.clientWidth / img.naturalWidth,
            wrap.clientHeight / img.naturalHeight
        )

        panCont.value.style.width = `${img.naturalWidth * initialScale.value}px`
        panCont.value.style.height = `${img.naturalHeight * initialScale.value}px`

        if (pz) pz.dispose()
        pz = panzoom(panCont.value, {
            maxZoom: 5,
            minZoom: 0.7,
            bounds: true,
            boundsPadding: 0.1
        })
    }

    function showOverlay(w, h, x = overlayX.value, y = overlayY.value) {
        const img = imgEl.value
        const cw = Math.min(w, img.naturalWidth)
        const ch = Math.min(h, img.naturalHeight)
        const cx = Math.max(0, Math.min(x, img.naturalWidth  - cw))
        const cy = Math.max(0, Math.min(y, img.naturalHeight - ch))
        overlayW.value = cw
        overlayH.value = ch
        overlayX.value = cx
        overlayY.value = cy
        emit('update:overlay', { width: cw, height: ch, x: cx, y: cy })
    }

    function hideOverlay() {
        overlayW.value = 0
        overlayH.value = 0
    }

    function previewCropToContent() {
        const img = imgEl.value
        if (!img?.naturalWidth) return

        const W = img.naturalWidth, H = img.naturalHeight
        const can = Object.assign(document.createElement('canvas'), { width: W, height: H })
        const ctx = can.getContext('2d')
        ctx.drawImage(img, 0, 0, W, H)
        const d = ctx.getImageData(0, 0, W, H).data

        const corners = [
            [0, 0],
            [W - 1, 0],
            [0, H - 1],
            [W - 1, H - 1]
        ]
        
        let bgR = 0, bgG = 0, bgB = 0
        for (const [x, y] of corners) {
            const i = (y * W + x) * 4
            bgR += d[i]
            bgG += d[i + 1]
            bgB += d[i + 2]
        }
        bgR /= corners.length
        bgG /= corners.length
        bgB /= corners.length

        let l = W, r = 0, t = H, b = 0
        const TH = 20
        for (let y = 0; y < H; y += 2) {
            for (let x = 0; x < W; x += 2) {
                const i = (y * W + x) * 4
                const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3]
                const diff =
                    Math.abs(R - bgR) +
                    Math.abs(G - bgG) +
                    Math.abs(B - bgB)
                const isBg = A < 10 || diff < TH
                if (!isBg) {
                    l = Math.min(l, x)
                    r = Math.max(r, x)
                    t = Math.min(t, y)
                    b = Math.max(b, y)
                }
            }
        }
        if (r <= l || b <= t) return
            const PAD = 2
            l = Math.max(0, l - PAD)
            t = Math.max(0, t - PAD)
            r = Math.min(W - 1, r + PAD)
            b = Math.min(H - 1, b + PAD)

            showOverlay(r - l, b - t, l, t)
      }


    function cropToOverlay() {
        const img = imgEl.value
        if (!img?.naturalWidth) return

        const c = Object.assign(document.createElement('canvas'), {
            width: overlayW.value,
            height: overlayH.value
        })
        c.getContext('2d').drawImage(img, overlayX.value, overlayY.value, overlayW.value, overlayH.value, 0, 0, overlayW.value, overlayH.value)

        const newSrc = c.toDataURL('image/png')
        const newW = overlayW.value
        const newH = overlayH.value

        preview.value = newSrc
        emit('update:preview', newSrc)

        overlayX.value = 0
        overlayY.value = 0
        emit('update:overlay', { width: newW, height: newH, x: 0, y: 0 })

        emit('update:meta', {
            name: 'cropped.png',
            type: 'image/png',
            size: atob(newSrc.split(',')[1]).length,
            width: newW,
            height: newH,
            lastModified: Date.now()
        })
    }

    function startResize(dir, e) {
        resizing = true
        resizeDir = dir
        resizeStart.rect = panCont.value.getBoundingClientRect()

        const currentZoom = pz ? pz.getTransform().scale : 1
        resizeStart.scale = initialScale.value * currentZoom

        resizeStart.origX = overlayX.value
        resizeStart.origY = overlayY.value
        resizeStart.origW = overlayW.value
        resizeStart.origH = overlayH.value
        window.addEventListener('mousemove', onResize)
        window.addEventListener('mouseup',   stopResize)
    }

    function onResize(e) {
        if (!resizing) return
        const { left, top } = resizeStart.rect
        const scale = resizeStart.scale

        const natX = (e.clientX - left) / scale
        const natY = (e.clientY - top ) / scale

        let NX = resizeStart.origX
        let NY = resizeStart.origY
        let NW = resizeStart.origW
        let NH = resizeStart.origH

        if (resizeDir.includes('e')) NW = Math.max(10, Math.min(natX - NX, imgEl.value.naturalWidth  - NX))
        if (resizeDir.includes('s')) NH = Math.max(10, Math.min(natY - NY, imgEl.value.naturalHeight - NY))

        if (resizeDir.includes('w')) {
            const newX = Math.max(0, Math.min(natX, resizeStart.origX + resizeStart.origW - 10))
            NW = resizeStart.origX + resizeStart.origW - newX
            NX = newX
        }

        if (resizeDir.includes('n')) {
            const newY = Math.max(0, Math.min(natY, resizeStart.origY + resizeStart.origH - 10))
            NH = resizeStart.origY + resizeStart.origH - newY
            NY = newY
        }

        overlayX.value = NX
        overlayY.value = NY
        overlayW.value = NW
        overlayH.value = NH

        emit('update:overlay', { width: NW, height: NH, x: NX, y: NY })
    }

    function stopResize() {
        resizing = false
        window.removeEventListener('mousemove', onResize)
        window.removeEventListener('mouseup',   stopResize)
    }


    const overlayStyle = computed(() => ({
        position      : 'absolute',
        left          : `${overlayX.value * initialScale.value}px`,
        top           : `${overlayY.value * initialScale.value}px`,
        width         : `${overlayW.value * initialScale.value}px`,
        height        : `${overlayH.value * initialScale.value}px`,
        border        : '2px dashed #ff3b30',
        boxSizing     : 'border-box',
        pointerEvents : 'all'
    }))

    defineExpose({
        previewCropToContent,
        cropToContent: previewCropToContent,
        cropToOverlay,
        showOverlay,
        hideOverlay,
        clear(){
            preview.value = null
            hideOverlay()
            if (pz){ pz.dispose(); pz = null }
            if (panCont.value){
                panCont.value.style.transform = ''
                panCont.value.style.width     = ''
                panCont.value.style.height    = ''
            }
            initialScale.value = 1
            if (fileInput.value) fileInput.value.value = ''
            emit('update:preview', null)
            emit('update:meta',    null)
            emit('update:overlay', { width:0, height:0, x:0, y:0 })
        }
    })
</script>

<style scoped>
    .dropField {
        width: 100%;
        height: 100vh;
        border: 2px dashed #ccc;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .dropField:hover {
      border-color: #888;
    }

    .preview-container {
        position: relative;
        width:100%; height:100%;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .panzoom-container {
        position: relative;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    .panzoom-container {
        position: relative;
    }

    .preview-img {
        width:100%;
        height:100%;
        object-fit: contain;
        user-select: none;
        will-change: transform;
    }

    .crop-overlay .handle {
        position: absolute;
        width: 8px;
        height: 8px;
        background: #fff;
        border: 1px solid #ff3b30;
        box-sizing: border-box;
        z-index: 10;
    }

    .crop-overlay .nw{top: -5px; left: -5px; cursor: nw-resize}
    .crop-overlay .n {top: -5px; left:50%; transform: translateX(-50%); cursor: n-resize}
    .crop-overlay .ne{top: -5px; right: -5px; cursor: ne-resize}
    .crop-overlay .e {top: 50%; right: -5px; transform: translateY(-50%); cursor: e-resize}
    .crop-overlay .se{bottom: -5px; right: -5px; cursor: se-resize}
    .crop-overlay .s {bottom: -5px; left: 50%; transform: translateX(-50%); cursor: s-resize}
    .crop-overlay .sw{bottom: -5px; left: -5px; cursor: sw-resize}
    .crop-overlay .w {top: 50%; left: -5px; transform: translateY(-50%); cursor: w-resize}
</style>
