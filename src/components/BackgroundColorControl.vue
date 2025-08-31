<template>
  <div class="background-color-control">
    <button class="control-toggle" @click="collapsed = !collapsed">
      <span>Background Color</span>
      <span :class="collapsed ? 'arrow-right' : 'arrow-down'"></span>
    </button>

    <div v-show="!collapsed" class="control-panel">
      <div class="field">
        <label for="bg-color-input">Hex Color</label>

        <input
          id="bg-color-input"
          type="text"
          v-model="color"
          placeholder="#ffffff"
        />

        <div
          class="color-box"
          :style="{ backgroundColor: color }"
          @click="openPicker">
        </div>

        <input
          ref="picker"
          type="color"
          v-model="color"
          class="native-picker"
        />
      </div>

      <button class="apply-btn" @click="applyColor">
        Apply
      </button>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, watch } from 'vue'

  const props = defineProps({
    initialColor: {
      type: String,
      default: '#ffffff'
    }
  })

  const emit = defineEmits(['apply-color'])
  const collapsed = ref(true)
  const color = ref(props.initialColor)
  const picker = ref(null)

  function openPicker() {
    if (picker.value) picker.value.click()
  }

  function applyColor() {
    emit('apply-color', color.value)
  }

  onMounted(() => { color.value = props.initialColor})

  watch(() => props.initialColor, newVal => { color.value = newVal})
</script>

<style scoped>
  .background-color-control {
    margin-top: 1rem;
  }

  .control-toggle {
    width: 100%;
    padding: 0.7rem;
    background: rgba(0, 0, 0, 0.05);
    border: none;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .control-toggle span {
    font-size: 24px;
  }

  .control-panel {
    padding: 0.5rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .field label {
    font-weight: 600;
    white-space: nowrap;
  }

  .field input[type="text"] {
    flex: 1;
    padding: 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .color-box {
    width: 24px;
    height: 24px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .native-picker {
    display: none;
  }

  .apply-btn {
    padding: 0.6rem 1rem;
    border: none;
    background: #007bff;
    color: white;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
  }

  .apply-btn {
    background: #28a745;
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

  .arrow-down {
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #333;
  }

  label{
    color: black;
  }
</style>
