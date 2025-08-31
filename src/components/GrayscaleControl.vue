<template>
  <div class="grayscale">
    <button class="toggle" @click="open = !open">
        <span>Grayscale</span>
        <span :class="open ? 'arrow-down' : 'arrow-right'"></span>
    </button>

    <div v-show="open" class="panel">
        <label class="row">
            <span>Intensity</span>
            <input type="range" min="0" max="100" v-model.number="intensity" />
            <span class="value">{{ intensity }}%</span>
        </label>

        <button class="apply-btn" @click="apply">Apply</button>
    </div>
  </div>
</template>

<script setup>
    import { ref } from 'vue'

    const open = ref(false)
    const intensity = ref(100)

    const emit = defineEmits(['apply-grayscale'])

    function apply () {
        emit('apply-grayscale', {
            strength: Math.max(0, Math.min(1, intensity.value / 100))
    })
}
</script>

<style scoped>
    .grayscale {
        margin-top: 1rem;
    }

    .toggle {
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

    .toggle span { 
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

    .arrow-down {
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 8px solid #333;
    }

    .panel {
        padding: 0.5rem;
    }

    .row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 1rem;
    }

    .row span { 
        color: black; 
        font-weight: 600;
    }

    .row input[type="range"] { 
        width: 100%; 
    }

    .value {
        font-variant-numeric: tabular-nums;
        min-width: 3.5ch;
        text-align: right;
        color: black;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
    }

    .apply-btn {
        background: #28a745;
        color: #fff;
        border: none;
        padding: 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
    }
</style>
