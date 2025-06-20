<template>
    <div class="resize-fields" v-if="meta">
        <div class="input-row">
            <div class="input-group">
                <label for="width-input">Width</label>
                <input id="width-input" type="number" v-model.number="w" :min="1" :max="meta.width"/>
            </div>
            <div class="input-group">
                <label for="height-input">Height</label>
                <input id="height-input" type="number" v-model.number="h" :min="1" :max="meta.height"/>
            </div>
        </div>

        <div class="button-row">
            <button class="crop-btn" @click="emit('crop')">
                Crop to Content
            </button>
            <button class="apply-btn" @click="onApply">
                Apply
            </button>
        </div>
    </div>
</template>

<script setup>
    import { ref, watch } from 'vue'

    const props = defineProps({
        meta: Object,
        initialSize: Object
    })
    const emit = defineEmits(['crop','preview','apply'])

    const w = ref(0)
    const h = ref(0)

    watch(
        () => props.meta,
        m => {
          w.value = m?.width  ? Math.round(m.width)  : 0
          h.value = m?.height ? Math.round(m.height) : 0
        },
        { immediate: true }
    )

    watch(
        () => [props.initialSize.width, props.initialSize.height],
        ([nw, nh]) => {
          if (nw > 0 && nh > 0) {
            w.value = Math.round(Math.min(nw, props.meta.width))
            h.value = Math.round(Math.min(nh, props.meta.height))
          }
        },
        { immediate: true }
    )

    watch(
        [w, h],
        ([nw, nh]) => {
          if (nw > 0 && nh > 0) {
            emit('preview', { width: nw, height: nh })
          }
        }
    )

    function onApply() {
        if (w.value > 0 && h.value > 0) {
          emit('apply', { width: w.value, height: h.value })
        }
    }
</script>

<style scoped>
    .resize-fields {
        width: 100%;
        margin: 1rem 0;
    }

    .input-row {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    .input-group {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .input-group label {
        margin-bottom: 0.25rem;
        font-weight: 600;
    }
    .input-group input {
        width: 100%;
        padding: 0.3rem;
        box-sizing: border-box;
    }

    .button-row {
        display: flex;
        gap: 1rem;
    }
    .button-row button {
        flex: 1;
        padding: 0.6rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
    }

    .crop-btn {
        background: #007bff;
        color: #fff;
    }
    .crop-btn:hover {
        background: #0056b3;
    }
    .apply-btn {
        background: #28a745;
        color: #fff;
    }
    .apply-btn:hover {
        background: #218838;
    }
</style>
