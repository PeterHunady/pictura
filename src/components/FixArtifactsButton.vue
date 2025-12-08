<template>
  <div class="enhance">
    <button class="enhance-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="enhance-toggle-left">
        <img :src="artifactsIcon" alt="JPEG artifacts" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">JPEG artifacts</span>
      </span>
      <span :class="!isOpen ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <transition
      name="accordion"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @leave="onLeave"
    >
      <div v-show="isOpen" class="slide-wrapper">
        <div class="enhance-list">
          <template v-if="meta">
            <button
              class="highlight-btn ty-body-small bg-lime600"
              @click="$emit('highlight-artifacts', '#00E5FF')"
              title="Highlight JPEG Artifacts"
              aria-label="Highlight JPEG Artifacts"
            >
              Highlight JPEG Artifacts
            </button>

            <button
              class="crop-btn ty-body-small bg-red600"
              @click="$emit('fix-artifacts')"
              title="Remove JPEG Artifacts"
            >
              Remove JPEG Artifacts
            </button>
          </template>

          <p v-else class="no-image">No image loaded.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
  import artifactsIcon from '@/assets/artifacts.svg'

  const props = defineProps({
    meta: Object,
    isOpen: { type: Boolean, default: false }
  })

  const emit = defineEmits(['fix-artifacts', 'highlight-artifacts', 'toggle'])

  const onEnter = (el) => {
    el.style.height = '0px'
    el.style.opacity = '0'

    const target = el.scrollHeight

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.3s ease, opacity 0.3s ease'
      el.style.height = target + 'px'
      el.style.opacity = '1'
    })
  }

  const onAfterEnter = (el) => {
    el.style.height = 'auto'
    el.style.transition = ''
  }

  const onLeave = (el) => {
    el.style.height = el.scrollHeight + 'px'
    el.style.opacity = '1'
    void el.offsetHeight

    el.style.transition = 'height 0.3s ease-out, opacity 0.3s ease-out'
    el.style.height = '0px'
    el.style.opacity = '0'
  }
</script>

<style scoped>
  .enhance {
    margin-top: 1rem;
  }

  .enhance-toggle {
    width: 100%;
    padding: 0.75rem;
    border: none;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .enhance-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-icon {
    width: 20px;
    height: 20px;
    display: block;
  }

  .arrow-right, .arrow-down {
    width: 0;
    height: 0;
    display: inline-block;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  .arrow-right {
    border-left: 8px solid #333; 
  }

  .arrow-down  {
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #333;
  }

  .slide-wrapper {
    overflow: hidden;
  }

  .enhance-list {
    padding: 0.5rem;
    padding-top: 1rem;
    padding-bottom: 1rem;
    display: flex;
    justify-content: flex-start;
    gap: 0.75rem;
  }

  .crop-btn {
    padding: 0.5rem 0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    color: #fff;
  }

  .highlight-btn {
    padding: 0.5rem 0;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    color: #fff;
    border: 1px solid #ddd;
  }

  .no-image {
    padding: 0.5rem;
    font-style: italic;
    color: #666;
  }
</style>
