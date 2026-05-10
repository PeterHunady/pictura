<template>
  <div class="backdrop" @click.self="$emit('cancel')">
    <div class="modal">
      <div class="hdr">
        <h3 class="ty-title-large">Choose a page</h3>
        <div class="hint ty-body-medium">{{ pages }} pages</div>
      </div>

      <div class="grid">
        <button
          v-for="p in pages"
          :key="p"
          class="thumb"
          :class="{ selected: selectedPage === p }"
          @click="selectedPage = p"
        >

          <div class="canvas-wrap">
            <canvas v-if="!pageThumbnails[p]" class="skel"></canvas>
            <img v-else class="img" :src="pageThumbnails[p]" :alt="`Page ${p}`" draggable="false" />
          </div>

          <span class="badge ty-body-small">#{{ p }}</span>
        </button>
      </div>

      <div class="actions">
        <button class="ghost ty-body-small" @click="$emit('cancel')">Cancel</button>
        <button class="primary ty-body-small" :disabled="!selectedPage" @click="confirm">Select</button>
      </div>
    </div>
  </div>
</template>

<script setup>
    import { ref, watch, onMounted } from 'vue'
    import * as pdfjsLib from 'pdfjs-dist'
    import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

    const props = defineProps({
        src: { type: String, required: true },
        pages: { type: Number, required: true },
        modelValue: { type: Number, default: 1 },
        thumbWidth: { type: Number, default: 160 }
    })

    const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])
    const { getDocument } = pdfjsLib
    const selectedPage = ref(props.modelValue || 1)
    const pageThumbnails = ref({})

    async function renderPageThumbnails () {
        pageThumbnails.value = {}
        
        try {
            const pdf = await getDocument({ url: props.src }).promise
            const count = Math.max(1, Math.min(props.pages, pdf.numPages))

            for (let p = 1; p <= count; p++) {
                const page = await pdf.getPage(p)
                const defaultViewport = page.getViewport({ scale: 1 })
                const scale = props.thumbWidth / defaultViewport.width
                const exportViewport = page.getViewport({ scale })
                const canvas = document.createElement('canvas')

                canvas.width = Math.max(1, Math.round(exportViewport.width))
                canvas.height = Math.max(1, Math.round(exportViewport.height))
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: exportViewport }).promise
                pageThumbnails.value = { ...pageThumbnails.value, [p]: canvas.toDataURL('image/png') }
            }
        }catch (e) {
            console.error('Thumb render failed:', e)
        }
    }

    function confirm () {
        if (!selectedPage.value) {
            return
        }
        emit('confirm', selectedPage.value)
    }

    watch(() => props.modelValue, v => { selectedPage.value = v || 1 })
    watch(selectedPage, v => emit('update:modelValue', v))
    onMounted(renderPageThumbnails)
    watch(() => props.src, renderPageThumbnails)
    watch(() => props.pages, renderPageThumbnails)
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
