<template>
  <div
    class="dropField"
    @dragover.prevent
    @dragenter.prevent
    @drop.prevent="handleDrop"
    @click="openFilePicker"
  >
    <p v-if="!preview">Click or drag and drop an image here</p>

    <div v-else class="preview-container">
      <img
        ref="previewImage"
        :src="preview"
        alt="Preview"
        draggable="false"
        class="preview-img"
      />
    </div>

    <input
      type="file"
      ref="fileInput"
      accept="image/png, image/jpeg, image/jpg, image/svg+xml"
      style="display: none"
      @change="handleFileChange"
    />
  </div>

  <div v-if="isFullscreen" class="fullscreen-modal" @click="closeFullscreen">
    <div class="fullscreen-container" @click.stop>
      <button class="close-btn" @click="closeFullscreen">×</button>
      <div class="zoom-controls">
        <button @click="zoomIn" class="zoom-btn">+</button>
        <button @click="zoomOut" class="zoom-btn">−</button>
        <button @click="resetZoom" class="zoom-btn">⌂</button>
      </div>
      <div
        class="image-container"
        ref="imageContainer"
        @mousedown="startDrag"
        @wheel.prevent="handleWheel"
      >
        <img
          :src="preview"
          alt="Fullscreen preview"
          ref="fullscreenImage"
          :style="imageStyle"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'
import panzoom from 'panzoom'

const preview      = ref(null)
const fileInput    = ref(null)
const previewImage = ref(null)
let previewPan     = null

const isFullscreen     = ref(false)
const fullscreenImage  = ref(null)
const imageContainer   = ref(null)

const zoom        = ref(1)
const panX        = ref(0)
const panY        = ref(0)
const isDragging  = ref(false)
const dragStart   = ref({ x: 0, y: 0 })
const panStart    = ref({ x: 0, y: 0 })

const imageStyle = computed(() => ({
  transform: `scale(${zoom.value}) translate(${panX.value}px, ${panY.value}px)`,
  transformOrigin: 'center center',
  transition: isDragging.value ? 'none' : 'transform 0.2s ease',
  cursor: isDragging.value ? 'grabbing' : 'grab'
}))

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileChange(e) {
  const file = e.target.files[0]
  if (file) processImage(file)
}

function handleDrop(e) {
  e.preventDefault()
  if (e.dataTransfer.files.length) {
    const file = Array.from(e.dataTransfer.files).find(f =>
      f.type.startsWith('image/')
    )
    if (file) return processImage(file)
  }
  Array.from(e.dataTransfer.items).forEach(item => {
    if (item.kind === 'string') {
      item.getAsString(str => {
        if (isImageUrl(str)) loadFromUrl(str)
        else tryExtractUrl(str)
      })
    }
  })
}

function isImageUrl(url) {
  return /\.(jpe?g|png|gif|svg)(\?.*)?$/i.test(url)
}

function tryExtractUrl(html) {
  const imgMatch = /<img[^>]+src="?([^"\s>]+)"?/i.exec(html)
  if (imgMatch) return loadFromUrl(imgMatch[1])
  const urlMatch = /(https?:\/\/\S+\.(?:jpe?g|png|gif|svg)(\?\S*)?)/i.exec(html)
  if (urlMatch) return loadFromUrl(urlMatch[1])
}

async function loadFromUrl(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    processImage(blob)
  } catch {
    alert('Failed to load image from URL.')
  }
}

function processImage(fileOrBlob) {
  const reader = new FileReader()
  reader.onload = e => {
    preview.value = e.target.result
    nextTick(() => {
      if (previewPan) previewPan.dispose()
      previewPan = panzoom(previewImage.value, {
        maxZoom: 5,
        minZoom: 0.5,
        bounds: true,
        boundsPadding: 0.1
      })
    })
  }
  reader.readAsDataURL(fileOrBlob)
}

function openFullscreen() {
  isFullscreen.value = true
  resetZoom()
  document.body.style.overflow = 'hidden'
}

function closeFullscreen() {
  isFullscreen.value = false
  document.body.style.overflow = 'auto'
}

function zoomIn() { zoom.value = Math.min(zoom.value * 1.25, 5) }
function zoomOut(){ zoom.value = Math.max(zoom.value / 1.25, 0.1) }
function resetZoom(){
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function handleWheel(e) {
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.min(Math.max(zoom.value * factor, 0.1), 5)
}

function startDrag(e) {
  if (zoom.value <= 1) return
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  panStart.value  = { x: panX.value, y: panY.value }
  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
}

function handleDrag(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  panX.value = panStart.value.x + dx / zoom.value
  panY.value = panStart.value.y + dy / zoom.value
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

function handleKeydown(e) {
  if (!isFullscreen.value) return
  switch (e.key) {
    case 'Escape': closeFullscreen(); break
    case '+': case '=': e.preventDefault(); zoomIn(); break
    case '-': e.preventDefault(); zoomOut(); break
    case '0': e.preventDefault(); resetZoom(); break
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'auto'
})
</script>

<style scoped>
.dropField {
  width: 100vw;
  height: 100vh;
  border: 2px dashed #ccc;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.3s;
}
.dropField:hover {
  border-color: #888;
}

.preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  will-change: transform;
}

.fullscreen-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.9);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 30px;
  background: rgba(255,255,255,0.2);
  border: none;
  color: #fff;
  font-size: 40px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  cursor: pointer;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close-btn:hover {
  background: rgba(255,255,255,0.3);
}

.zoom-controls {
  position: absolute;
  bottom: 30px;
  right: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1001;
}
.zoom-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: #fff;
  font-size: 20px;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}
.zoom-btn:hover {
  background: rgba(255,255,255,0.3);
}

.image-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.image-container img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
}
</style>
