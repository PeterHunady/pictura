<template>
  <div class="enhance">
    <button class="enhance-toggle" @click="collapsed = !collapsed">
      <span>Enhance Quality</span>
      <span :class="collapsed ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <div v-show="!collapsed" class="enhance-list">
      <button
        class="highlight-btn"
        @click="$emit('highlight-artifacts', '#00E5FF')"
        title="Highlight JPEG Artifacts"
        aria-label="Highlight JPEG Artifacts"
      >
        Highlight JPEG Artifacts
      </button>

      <button
        class="crop-btn"
        @click="$emit('fix-artifacts')"
        title="Remove JPEG Artifacts"
      >
        Remove JPEG Artifacts
      </button>
    </div>
  </div>
</template>

<script setup>
  import { ref } from 'vue'

  const collapsed = ref(true)

  defineEmits(['fix-artifacts', 'highlight-artifacts'])
</script>

<style scoped>
  .enhance {
    margin-top: 1rem;
  }

  .enhance-toggle {
    width: 100%;
    padding: 0.7rem;
    background: rgba(0,0,0,0.05);
    border: none;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .enhance-toggle span { 
    font-size: 24px; 
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

  .enhance-list {
    padding: 0.5rem;
    display: flex;
    justify-content: flex-start;
    gap: 1rem;
  }

  .crop-btn {
    padding: 0.6rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    background: #007bff;
    color: #fff;
  }

  .crop-btn:hover { 
    background: #0056b3; 
  }

  .highlight-btn {
    padding: 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    background: #eee;
    color: #111;
    border: 1px solid #ddd;
  }

  .highlight-btn:hover {
    background: #e6e6e6;
  }
</style>