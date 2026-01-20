<template>
  <div class="metadata">
    <button class="metadata-toggle bg-neutral200 bg-hover-neutral100" @click="emit('toggle')">
      <span class="metadata-toggle-left">
        <img :src="propertiesIcon" alt="Properties" class="toggle-icon" />
        <span class="toggle-label ty-title-medium">Properties</span>
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
        <ul class="metadata-list ty-body-medium" v-if="meta">
          <li><p>Name:</p> {{ meta.name || '—' }}</li>
          <li><p>Type:</p> {{ meta.type || '—' }}</li>
          <li><p>Size:</p> {{ formatSize(meta.size) }}</li>
          <li><p>Dimensions:</p> {{ meta.width }} × {{ meta.height }} px</li>
          <li><p>Last Modified:</p> {{ formatDate(meta.lastModified) }}</li>
        </ul>

        <p v-else class="no-meta">No image loaded.</p>
      </div>
    </transition>
  </div>
</template>

<script setup>
    import propertiesIcon from '@/assets/properties.svg'

    const props = defineProps({
        meta: Object,
        isOpen: { type: Boolean, default: false }
    })

    const emit = defineEmits(['toggle'])

    function formatSize(b) {
        if (!b) {
            return '—'
        }
        
        const kb = b / 1024
        return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`
    }

    const formatDate = ts => ts ? new Date(ts).toLocaleString() : '—'

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
  .metadata {
    margin-top: 1rem;
  }

  .metadata-toggle {
    width: 100%;
    padding: 0.7rem;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .metadata-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-icon {
    width: 20px;
    height: 20px;
    display: block;
  }

  .slide-wrapper {
    overflow: hidden;
  }

  .metadata-list {
    list-style: none;
    margin: 0;
    padding: 1rem 0.75rem;
  }

  .metadata-list li {
    display: flex;
    margin-bottom: 0.3rem;
  }

  .metadata-list li p {
    font-weight: 500;
    margin-right: 0.3rem;
    white-space: nowrap;
  }

  .no-meta {
    padding: 1.4rem;
    font-style: italic;
    color: #666;
  }

  .arrow-right,
  .arrow-down {
    width: 0;
    height: 0;
    display: inline-block;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  .arrow-right {
    border-left: 8px solid #333;
  }

  .arrow-down {
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #333;
  }

  li {
    color: black !important;
  }
</style>
