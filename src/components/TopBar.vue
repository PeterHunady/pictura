<template>
  <header class="topbar" :style="{ height: topGap }">
    <div class="topbar-content" :style="{ paddingRight: rightGap }">
      <img :src="defaultLogo" alt="Logo" class="logo" />
      <div class="spacer"></div>
    </div>

    <div class="actions-fixed" v-if="showActions">
      <button class="icon-btn" title="Undo" @click="$emit('undo')">
        <img class="icon" :src="undoIcon" alt="Undo" />
      </button>
      <button class="icon-btn" title="Reset" @click="$emit('reset')">
        <img class="icon" :src="resetIcon" alt="Reset" />
      </button>
    </div>
  </header>
</template>

<script setup>
  import defaultLogo from '@/assets/logo.png'
  import undoIcon from '@/assets/undo.png'
  import resetIcon from '@/assets/reset.png'

  const props = defineProps({
    rightGap: { type: String, default: 'min(30vw, 300px)' },
    topGap: { type: String, default: '48px' },
    showActions: { type: Boolean, default: true },
  })

</script>

<style scoped>
  .topbar{
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-bottom: 1px solid #e6e6e6;
    z-index: 110;
  }

  .topbar-content{
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0 .75rem;
  }

  .logo{
    height: 70%;
    max-height: 28px;
    display: block;
  }

  .spacer{
    flex: 1 1 auto;
  }

  .actions-fixed{
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: .5rem;
  }

  .icon-btn{ 
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .icon{
    width: 22px;
    height: 22px;
    display: block;
  }

  .icon-btn:hover .icon{
    opacity: .75;
  }
</style>
