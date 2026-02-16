<template>
  <div :class="['sidebar-wrapper bg-neutral100', { collapsed }]" :style="sidebarStyle">
    <button class="toggle-btn bg-neutral100" @click="collapsed = !collapsed">
      <span :class="collapsed ? 'arrow-left' : 'arrow-right'"></span>
    </button>

    <div class="sidebar-inner bg-neutral100" v-show="!collapsed">
      <div class="content bg-neutral100" ref="contentRef">
      <Metadata
        :meta="meta"
        :isOpen="openTool === 'metadata'"
        @toggle="toggleTool('metadata')"
      />

      <CropControls
        :meta="meta"
        :initial-size="{ width: initialSize.width, height: initialSize.height }"
        :isOpen="openTool === 'crop'"
        @crop="$emit('crop')"
        @preview="$emit('preview-crop', $event)"
        @apply="$emit('resize-crop', $event)"
        @toggle="toggleTool('crop')"
      />

      <BackgroundColorControl
        :meta="meta"
        :initialColor="initialColor"
        :applied-color="appliedBgColor"
        :isOpen="openTool === 'background'"
        @apply-color="emit('apply-color', $event)"
        @preview-color="emit('preview-color', $event)"
        @end-preview-color="emit('end-preview-color')"
        @remove-background="$emit('remove-background')"
        :bgTransparent="props.bgTransparent"
        @toggle="toggleTool('background')"
      />

      <GrayscaleControl
        :meta="meta"
        :isOpen="openTool === 'grayscale'"
        :applied-strength="appliedGrayscaleStrength"
        @apply-grayscale="emit('apply-grayscale', $event)"
        @preview="emit('preview-grayscale', $event)"
        @end-preview="emit('end-preview-grayscale')"
        @toggle="toggleTool('grayscale')"
      />

      <MarkControls
        :meta="meta"
        :isOpen="openTool === 'mark'"
        :thickness="markThickness"
        :color="markColor"
        :shape="markShape"
        @update:thickness="emit('update-mark-thickness', $event)"
        @update:color="emit('update-mark-color', $event)"
        @update:shape="emit('update-mark-shape', $event)"
        @toggle="toggleTool('mark')"
      />

      <BlurControls
        :meta="meta"
        :isOpen="openTool === 'blur'"
        :radius="blurRadius"
        :intensity="blurIntensity"
        @update:radius="emit('update-blur-radius', $event)"
        @update:intensity="emit('update-blur-intensity', $event)"
        @toggle="toggleTool('blur')"
      />

      <FixArtifactsBtn
        :meta="meta"
        :isOpen="openTool === 'artifacts'"
        @fix-artifacts="emit('fix-artifacts')"
        @highlight-artifacts="emit('highlight-artifacts', $event)"
        @toggle="toggleTool('artifacts')"
      />

      <ExportControl
        :suggestedName="exportSuggestedName ?? meta?.name"
        :suggestedType="exportSuggestedType ?? meta?.type"
        :sizeHint="exportBytes"
        :loading="exportLoading"
        :isOpen="openTool === 'export'"
        @export="emit('export', $event)"
        @request-preview="emit('request-export-preview', $event)"
        @toggle="toggleTool('export')"
      />

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
  </div>
</template>

<script setup>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
  import Metadata from './Metadata.vue'
  import CropControls from './CropControls.vue'
  import MarkControls from './MarkControls.vue'
  import BlurControls from './BlurControls.vue'
  import FixArtifactsBtn from './FixArtifactsButton.vue'
  import BackgroundColorControl from './BackgroundColorControl.vue'
  import GrayscaleControl from './GrayscaleControl.vue'
  import ExportControl from './ExportControl.vue'
  import arrowUp from '@/assets/arrowUp.svg'
  import arrowDown from '@/assets/arrowDown.svg'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    meta: Object,
    initialSize: Object,
    initialColor: { type: String, default: '#ffffff' },
    activeTool: { type: String, default: null },
    blurRadius: { type: Number, default: 28 },
    blurIntensity: { type: Number, default: 10 },
    markThickness: { type: Number, default: 4 },
    markColor: { type: String, default: '#ff0000' },
    markShape: { type: String, default: 'rect' },
    exportBytes: { type: Number, default: null },
    exportLoading: { type: Boolean, default: false },
    exportSuggestedName: { type: String, default: null },
    exportSuggestedType: { type: String, default: null },
    topGap: { type: String, default: '0px' },
    bgTransparent: { type: Boolean, default: false },
    appliedGrayscaleStrength: { type: Number, default: null },
    appliedBgColor: { type: String, default: null }
  })


  const emit = defineEmits([
    'update:modelValue',
    'download','clear','crop','preview-crop','resize-crop',
    'fix-artifacts','apply-color','highlight-artifacts','apply-grayscale',
    'preview-grayscale','end-preview-grayscale',
    'preview-color','end-preview-color', 'export', 'request-export-preview', 'remove-background'
    ,'set-active-tool','update-blur-radius','update-blur-intensity'
    ,'update-mark-thickness','update-mark-color','update-mark-shape'
  ])

  const sidebarStyle = computed(() => {
    const top = (props.topGap && String(props.topGap).trim()) ? props.topGap : '0px'
    return {
      top,
      height: `calc(100vh - ${top})`
    }
  })

  const collapsed = ref(props.modelValue)
  watch(() => props.modelValue, v => (collapsed.value = v))
  watch(collapsed, v => {
    emit('update:modelValue', v)

    if (v) {
      openTool.value = null
      emit('set-active-tool', null)
    }
  })
  watch(() => props.meta, m => { if (!m && window.innerWidth < 768) collapsed.value = true })

  const openTool = ref(null)

  watch(() => props.activeTool, (t) => {
    if (openTool.value === 'blur' && t !== 'blur') openTool.value = null
    if (openTool.value === 'mark' && t !== 'mark') openTool.value = null
  })

  const toggleTool = (toolName) => {
    if (openTool.value === toolName) {
      openTool.value = null
    } else {
      openTool.value = toolName
    }

    const isLiveTool = openTool.value === 'blur' || openTool.value === 'mark'
    emit('set-active-tool', isLiveTool ? openTool.value : null)
  }

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
  .sidebar-wrapper {
    position: fixed;
    width: 30vw; max-width: 300px;
    transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
    z-index: 100;
    box-sizing: border-box;
    right: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
  }

  .sidebar-wrapper.collapsed {
    transform: translateX(calc(100% - 30px));
  }

  .sidebar-inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid #ddd;
    box-shadow: -2px 0 4px rgba(0,0,0,.1);
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
    flex: 1;
    min-height: 0;
    min-width: 0;
    padding: 1rem 1.25rem 1rem 1rem;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
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
  :deep(.blur-controls),
  :deep(.mark-controls),
  :deep(.background-color-control),
  :deep(.export),
  :deep(.export-control) {
    background: #fff;
    border: 1px solid #DDD;
    border-radius: 12px;
    box-shadow: 1px 2px 3px rgba(0,0,0,.4);
    background-clip: padding-box;
    overflow: hidden;
    box-sizing: border-box;
    margin-bottom: 1.75rem;
  }

  :deep(.metadata:last-child),
  :deep(.resize:last-child),
  :deep(.enhance:last-child),
  :deep(.grayscale:last-child),
  :deep(.blur-controls:last-child),
  :deep(.mark-controls:last-child),
  :deep(.background-color-control:last-child),
  :deep(.export:last-child),
  :deep(.export-control:last-child) {
    margin-bottom: 0;
  }

  :deep(.metadata > .metadata-toggle),
  :deep(.resize > .resize-toggle),
  :deep(.enhance > .enhance-toggle),
  :deep(.grayscale > .toggle),
  :deep(.blur-controls > .control-toggle),
  :deep(.mark-controls > .control-toggle),
  :deep(.background-color-control > .control-toggle),
  :deep(.export > .export-toggle),
  :deep(.export-control > .export-toggle) {
    border: 0;
    box-shadow: 0 1px 0 rgba(0,0,0,.03);
    padding: .7rem .75rem;
    font-weight: 700;
    text-align: left;
    box-sizing: border-box;
  }

  :deep(.metadata > .metadata-list),
  :deep(.resize > .resize-list),
  :deep(.enhance > .enhance-list),
  :deep(.grayscale > .panel),
  :deep(.blur-controls > .control-panel),
  :deep(.mark-controls > .control-panel),
  :deep(.background-color-control > .control-panel),
  :deep(.export > .export-panel),
  :deep(.export-control > .export-panel) {
    padding: .75rem;
    background: #fff;
  }

  :deep(.background-color-control .field input[type="text"]),
  :deep(.resize .input-row .input-group),
  :deep(.grayscale .row input[type="range"]),
  :deep(.blur-controls .row input[type="range"]),
  :deep(.mark-controls .row input[type="range"]),
  :deep(.enhance .enhance-list),
  :deep(.resize .resize-list),
  :deep(.grayscale .panel),
  :deep(.blur-controls .control-panel),
  :deep(.mark-controls .control-panel),
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
