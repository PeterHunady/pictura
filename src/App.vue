<!--
  Author: Peter Huňady (xhunadp00)
  File: App.vue
  Bachelor's Thesis, VUT Brno, 2026
-->

<template>
  <div id="mobile-block">
    <p>This application is not available on mobile devices.<br>Please open it on a desktop or laptop.</p>
  </div>
  <RouterView />
</template>

<script setup>

</script>

<style>
  html, body, #app {
    margin: 0;
    height: 100%;
  }

  #mobile-block {
    display: none;
  }

  @media (max-width: 500px) {
    #mobile-block {
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      z-index: 9999;
      text-align: center;
      padding: 2rem;
      box-sizing: border-box;
    }

    #mobile-block p {
      color: #000000;
      font-size: 1.1rem;
      line-height: 1.6;
    }
  }
</style>