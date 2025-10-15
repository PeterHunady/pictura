<template>
    <div class="page">
        <TopBar
            :right-gap="rightGap"
            :top-gap="topGap"
            :show-actions="false"
        />

        <main class="hero" :style="{ marginTop: topGap }">
            <section class="intro">
                <h1>Quick image & PDF tweaks!</h1>
                <p>
                    Drop or select a photo, screenshot, or PDF to change the background color, convert to grayscale,
                    crop or crop-to-content, then export to PNG, JPG, or PDF — right in your browser.
                </p>
                <p>
                    Live preview, precise on-canvas controls, and private local processing
                    (your files never leave your device).
                </p>
            </section>

            <section
                class="dropzone"
                @click="openPicker"
                @dragover.prevent
                @dragenter.prevent
                @drop.prevent="onDrop"
            >
                <div class="dz-inner">
                    <strong>Drop file here</strong>
                    <span>or click to select (PNG, JPG, PDF)</span>
                </div>

                <input
                    ref="fileInput"
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    @change="onPick"
                />
            </section>
        </main>
    </div>
</template>

<script setup>
    import { ref, computed } from 'vue'
    import { useRouter } from 'vue-router'
    import TopBar from '@/components/TopBar.vue'
    import { setPendingFile } from '@/composables/usePendingFile'

    const router = useRouter()
    const sidebarCollapsed = ref(false)
    const rightGap = computed(() => (sidebarCollapsed.value ? '30px' : 'min(30vw, 300px)'))
    const topGap   = computed(() => (sidebarCollapsed.value ? '48px' : '38px'))
    const fileInput = ref(null)

    function openPicker(){
        fileInput.value?.click()
    }

    function pickFirstValid(files){
        return [...files].find(f => f.type.startsWith('image/') || f.type === 'application/pdf') || null
    }

    function handleFile(file){
        if (!file) {
            return
        }

        setPendingFile(file)
        router.push({ name: 'editor' })
    }

    function onPick(e){
        handleFile(pickFirstValid(e.target.files || []))
        e.target.value = ''
    }

    function onDrop(e){
        handleFile(pickFirstValid(e.dataTransfer?.files || []))
    }
</script>

<style scoped>
    .page {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #fff;
    }

    .hero {
        height: calc(100vh - 0px);
        display: grid;
        place-items: center;
        padding: 24px;
    }

    .intro {
        max-width: 860px;
        text-align: center;
        margin-bottom: 24px;
        padding: 0 16px;
    }

    .intro h1 {
        margin: 0 0 20px;
        font-size: 28px;
        line-height: 1.2;
        color: #444;
    }

    .intro p  {
        margin: 0;
        color: #444;
    }

    .dropzone{
        width: min(680px, 96vw);
        aspect-ratio: 16/9;
        border: 2px dashed #cfcfcf;
        border-radius: 14px;
        background: #fafafa;
        display: grid;
        place-items: center;
        cursor: pointer; 
        transition: .15s border-color ease, .15s background ease;
    }

    .dropzone:hover{
        border-color: #aaa;
        background: #f7f7f7;
    }

    .dz-inner{
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: #333;
    }

    .dz-inner strong{
        font-size: 16px;
    }

    .dz-inner span{
        font-size: 13px;
        color: #666;
    }
</style>
