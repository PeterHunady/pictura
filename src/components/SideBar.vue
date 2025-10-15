<template>
  <div :class="['sidebar', { collapsed }]" :style="{ top: props.topGap }">
    <button class="toggle-btn" @click="collapsed = !collapsed">
      <span :class="collapsed ? 'arrow-left' : 'arrow-right'"></span>
    </button>

    <div class="content" ref="contentRef" v-show="!collapsed">
      <Metadata :meta="meta" />

      <FixArtifactsBtn
        @fix-artifacts="emit('fix-artifacts')"
        @highlight-artifacts="emit('highlight-artifacts', $event)"
      />

      <CropControls
        :meta="meta"
        :initial-size="{ width: initialSize.width, height: initialSize.height }"
        @crop="$emit('crop')"
        @preview="$emit('preview-crop', $event)"
        @apply="$emit('resize-crop', $event)"
      />

      <GrayscaleControl
        @apply-grayscale="emit('apply-grayscale', $event)"
        @preview="emit('preview-grayscale', $event)"
        @end-preview="emit('end-preview-grayscale')"
      />

      <BackgroundColorControl
        v-if="meta"
        :initialColor="initialColor"
        @apply-color="emit('apply-color', $event)"
        @preview-color="emit('preview-color', $event)"
        @end-preview-color="emit('end-preview-color')"
        @remove-background="$emit('remove-background')"
        :bgTransparent="props.bgTransparent"
      />

      <ExportControl
        :suggestedName="exportSuggestedName ?? meta?.name"
        :suggestedType="exportSuggestedType ?? meta?.type"
        :sizeHint="exportBytes"
        :loading="exportLoading"
        @export="emit('export', $event)"
        @request-preview="emit('request-export-preview', $event)"
      />

      <div class="action-btns">
        <button
          class="icon-btn"
          @click="$emit('clear')"
          title="Vymazať obrázok"
        >
          <img class="icon" :src="binIcon" alt="Delete" />
        </button>
      </div>

      <button
        v-if="showScrollArrow"
        class="scroll-arrow-btn"
        @click="scrollAction"
      >
        <img
          class="icon"
          :src="isAtBottom ? arrowUp : arrowDown"
          :alt="isAtBottom ? 'Up' : 'Down'"
        />
      </button>
    </div>
  </div>
</template>

<script setup>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
  import Metadata from './Metadata.vue'
  import CropControls from './CropControls.vue'
  import FixArtifactsBtn from './FixArtifactsButton.vue'
  import BackgroundColorControl from './BackgroundColorControl.vue'
  import GrayscaleControl from './GrayscaleControl.vue'
  import binIcon from '@/assets/bin.png'
  import ExportControl from './ExportControl.vue'
  import arrowUp from '@/assets/arrowUp.png'
  import arrowDown from '@/assets/arrowDown.png'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    meta: Object,
    initialSize: Object,
    initialColor: { type: String, default: '#ffffff' },
    exportBytes: { type: Number, default: null },
    exportLoading: { type: Boolean, default: false },
    exportSuggestedName: { type: String, default: null },
    exportSuggestedType: { type: String, default: null },
    topGap: { type: String, default: '0px' },
    bgTransparent: { type: Boolean, default: false }
  })


  const emit = defineEmits([
    'update:modelValue',
    'download','clear','crop','preview-crop','resize-crop',
    'fix-artifacts','apply-color','highlight-artifacts','apply-grayscale',
    'preview-grayscale','end-preview-grayscale',
    'preview-color','end-preview-color', 'export', 'request-export-preview', 'remove-background'
  ])

  const collapsed = ref(props.modelValue)
  watch(() => props.modelValue, v => (collapsed.value = v))
  watch(collapsed, v => emit('update:modelValue', v))
  watch(() => props.meta, m => { if (!m && window.innerWidth < 768) collapsed.value = true })

  const contentRef = ref(null)
  const isAtBottom = ref(false)
  const showScrollArrow = ref(false)

  const handleScroll = () => {
    const el = contentRef.value
    if (!el) return
    const threshold = 10
    const { scrollTop, scrollHeight, clientHeight } = el
    isAtBottom.value = scrollTop + clientHeight >= scrollHeight - threshold
    showScrollArrow.value = scrollHeight > clientHeight + 5
  }

  const scrollAction = () => {
    const el = contentRef.value
    if (!el) return
    if (isAtBottom.value) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }

  let resizeObserver = null
  let mutationObserver = null

  onMounted(() => {
    const el = contentRef.value
    if (!el) return

    const update = () => nextTick(() => handleScroll())

    handleScroll()
    el.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleScroll)

    resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)

    mutationObserver = new MutationObserver(update)
    mutationObserver.observe(el, { childList: true, subtree: true, attributes: true })

    watch( () => props.meta,
      () => nextTick(() => handleScroll()),
      { deep: true }
    )
  })

  onBeforeUnmount(() => {
    const el = contentRef.value
    if (el) el.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleScroll)
  
    if (resizeObserver) resizeObserver.disconnect()
    if (mutationObserver) mutationObserver.disconnect()
  })

</script>

<style scoped>
  .sidebar {
    position: fixed;
    width: 30vw; max-width: 300px;
    background: #fafafa;
    border-left: 1px solid #ddd;
    box-shadow: -2px 0 4px rgba(0,0,0,.1);
    transition: transform .3s ease;
    z-index: 100;
    box-sizing: border-box;
    right: 0; bottom: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
  }

  .sidebar.collapsed {
    transform: translateX(calc(100% - 30px));
  }

  .toggle-btn {
    position: absolute;
    left: -30px;
    top: 50%;
    transform: translateY(-50%);
    width: 30px;
    height: 60px;
    border: 1px solid #ddd;
    border-right: none;
    border-radius: 4px 0 0 4px;
    background: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .arrow-left,.arrow-right {
    width: 0;
    height: 0;
    display: inline-block;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
  }

  .arrow-left {
    border-right: 8px solid #333;
  }

  .arrow-right {
    border-left: 8px solid #333;
  }

  .content {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: .75rem;
    padding: 1rem 1.25rem 1rem 1rem;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-gutter: stable both-edges;
  }

  .icon-btn {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .icon-btn .icon {
    width: 24px;
    height: 24px;
    display: block;
  }

  .icon-btn:hover .icon {
    opacity: .7;
  }

  :deep(.metadata),
  :deep(.resize),
  :deep(.enhance),
  :deep(.grayscale),
  :deep(.background-color-control),
  :deep(.export),
  :deep(.export-control) {
    background: #fff;
    border: 1px solid #e6e6e6;
    border-radius: 12px;
    box-shadow: 0 1px 0 rgba(0,0,0,.03);
    background-clip: padding-box;
  }

  :deep(.metadata > .metadata-toggle),
  :deep(.resize > .resize-toggle),
  :deep(.enhance > .enhance-toggle),
  :deep(.grayscale > .toggle),
  :deep(.background-color-control > .control-toggle),
  :deep(.export > .export-toggle),
  :deep(.export-control > .export-toggle) {
    background: #f3f4f6;
    border: 0;
    border-bottom: 1px solid #ececec;
    padding: .7rem .75rem;
    font-weight: 700;
    text-align: left;
  }

  :deep(.metadata > .metadata-list),
  :deep(.resize > .resize-list),
  :deep(.enhance > .enhance-list),
  :deep(.grayscale > .panel),
  :deep(.background-color-control > .control-panel),
  :deep(.export > .export-panel),
  :deep(.export-control > .export-panel) {
    padding: .75rem;
    background: #fff;
  }

  :deep(.background-color-control .field input[type="text"]),
  :deep(.resize .input-row .input-group),
  :deep(.grayscale .row input[type="range"]),
  :deep(.enhance .enhance-list),
  :deep(.resize .resize-list),
  :deep(.grayscale .panel),
  :deep(.metadata .metadata-list),
  :deep(.export .export-row),
  :deep(.export-control .export-row) {
    min-width: 0;
  }

  :deep(.apply-btn), :deep(.crop-btn) {
    border-radius: 6px;
    font-weight: 600;
  }
  
  :deep(.highlight-btn) {
    border-radius: 6px;
    border: 1px solid #ddd;
    background: #eee;
  }

  :deep(.highlight-btn:hover) {
    background: #e6e6e6;
  }

  .action-btns{
    margin-top: auto;
    display: flex;
    justify-content: flex-end;
    gap: .5rem;
    padding-top: .5rem;
    border-top: 1px solid #e6e6e6;
    background: transparent;
  }

  .scroll-arrow-btn {
    position: fixed;
    bottom: 45px;
    align-self: flex-end;
    right: 0px;
    width: 36px;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    background: none;
    border: none;
    z-index: 10;
  }

  .scroll-arrow-btn .icon {
    width: 20px;
    height: 25px;
  }

</style>
