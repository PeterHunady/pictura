<template>
    <div class="page">
        <TopBar
            :top-gap="topGap"
            :show-actions="false"
        />

        <main class="hero" :style="{ marginTop: topGap }">
            <section class="intro">
                <h1 class="ty-headline-medium">Quick image & PDF tweaks!</h1>
                <p class="ty-body-medium">
                    A simple browser tool for preparing images, screenshots, and PDF pages for academic documents.
                    Crop, clean, highlight, adjust, and export your files in just a few steps.
                </p>
                <p class="ty-body-medium">
                    Everything runs locally in your browser, so your files stay private and never leave your device.
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
                    <strong>Add an image or PDF</strong>
                    <span>Drop, click, or paste with Ctrl/Cmd + V</span>
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
    import { ref, onMounted, onUnmounted } from 'vue'
    import { useRouter } from 'vue-router'
    import TopBar from '@/components/Topbar.vue'
    import { setPendingFile } from '@/composables/usePendingFile'

    const router = useRouter()
    const topGap = '48px'
    const fileInput = ref(null)

    function openPicker(){
        fileInput.value?.click()
    }

    function pickFile(files){
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
        handleFile(pickFile(e.target.files || []))
        e.target.value = ''
    }

    function onDrop(e){
        handleFile(pickFile(e.dataTransfer?.files || []))
    }

    function onPaste(e){
        const items = e.clipboardData?.items || []
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile()
                if (file) {
                    handleFile(file)
                    e.preventDefault()
                    break
                }
            }
        }
    }

    onMounted(() => {
        document.addEventListener('paste', onPaste)
    })

    onUnmounted(() => {
        document.removeEventListener('paste', onPaste)
    })
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

    .dz-inner span{
        color: #666;
    }
</style>
