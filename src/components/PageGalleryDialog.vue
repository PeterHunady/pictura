<template>
  <div class="backdrop" @click.self="$emit('cancel')">
    <div class="modal">
      <div class="hdr">
        <h3>Choose a page</h3>
        <div class="hint">{{ pages }} pages</div>
      </div>

      <div class="grid">
        <button
          v-for="p in pages"
          :key="p"
          class="thumb"
          :class="{ selected: localSel === p }"
          @click="localSel = p"
        >

          <div class="canvas-wrap">
            <canvas v-if="!thumbs[p]" class="skel"></canvas>
            <img v-else class="img" :src="thumbs[p]" :alt="`Page ${p}`" draggable="false" />
          </div>

          <span class="badge">#{{ p }}</span>
        </button>
      </div>

      <div class="actions">
        <button class="ghost" @click="$emit('cancel')">Cancel</button>
        <button class="primary" :disabled="!localSel" @click="confirm">Select</button>
      </div>
    </div>
  </div>
</template>

<script setup>
    import { ref, watch, onMounted } from 'vue'
    import * as pdfjsLib from 'pdfjs-dist'
    import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
    const { getDocument } = pdfjsLib

    const props = defineProps({
        src: { type: String, required: true },
        pages: { type: Number, required: true },
        modelValue: { type: Number, default: 1 },
        thumbWidth: { type: Number, default: 160 }
    })

    const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

    const localSel = ref(props.modelValue || 1)
    watch(() => props.modelValue, v => { localSel.value = v || 1 })
    watch(localSel, v => emit('update:modelValue', v))

    const thumbs = ref({})

    async function renderThumbs () {
        thumbs.value = {}
        
        try {
            const pdf = await getDocument({ url: props.src }).promise
            const count = Math.max(1, Math.min(props.pages, pdf.numPages))

            for (let p = 1; p <= count; p++) {
                const page = await pdf.getPage(p)
                const vp1 = page.getViewport({ scale: 1 })
                const scale = props.thumbWidth / vp1.width
                const vp = page.getViewport({ scale })
                const c = document.createElement('canvas')

                c.width = Math.max(1, Math.round(vp.width))
                c.height = Math.max(1, Math.round(vp.height))

                await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
                thumbs.value = { ...thumbs.value, [p]: c.toDataURL('image/png') }
            }
        }catch (e) {
            console.error('Thumb render failed:', e)
        }
    }

    onMounted(renderThumbs)
    watch(() => props.src, renderThumbs)
    watch(() => props.pages, renderThumbs)

    function confirm () {
        if (!localSel.value) {
            return
        }
        emit('confirm', localSel.value)
    }
</script>

<style scoped>
    .hdr h3 {
        color: #000;
    }

    .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.45);
        display: grid;
        place-items: center;
        z-index: 1000;
    }

    .modal {
        width: min(860px, 94vw);
        background: #fff;
        border-radius: 12px;
        padding: 1rem 1.2rem;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        max-height: 90vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: .8rem;
    }

    .hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .hint {
        color: #666;
        font-size: .9rem;
    }

    .grid {
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
        padding: .25rem;
    }

    .thumb {
        border: 2px solid transparent;
        border-radius: 10px;
        background: #f7f7f7;
        padding: 8px;
        cursor: pointer;
        display: grid;
        gap: 6px;
        position: relative;
    }

    .thumb:hover {
        border-color: #bbb;
    }

    .thumb.selected {
        border-color: #ff3b30;
        box-shadow: 0 0 0 2px rgba(255,59,48,.2) inset;
    }

    .canvas-wrap {
        width: 100%;
        aspect-ratio: 1/1.414;
        display: grid;
        place-items: center;
        background: #fff;
        border-radius: 6px;
        overflow: hidden;
    }

    .skel {
        width: 80%;
        height: 80%;
        background: linear-gradient(90deg, #eee 25%, #f3f3f3 37%, #eee 63%);
        animation: shimmer 1.2s infinite;
    }

    @keyframes shimmer {
        0% { background-position: -200px 0 }
        100% { background-position: 200px 0 }
    }

    .img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
    }

    .badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(0,0,0,.7);
        color: #fff;
        font-size: .75rem;
        border-radius: 999px;
        padding: .15rem .5rem;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: .5rem;
    }

    button {
        cursor: pointer;
        border: none;
        border-radius: 6px;
        padding: .55rem .9rem;
    }

    button.ghost {
        background: #eee;
    }

    button.primary {
        background: #111;
        color: #fff;
    }

    button:disabled {
        opacity: .5;
        cursor: not-allowed;
    }
</style>
