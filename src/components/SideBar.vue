<template>
    <div :class="['sidebar', { collapsed }]">
        <button class="toggle-btn" @click="collapsed = !collapsed">
            <span :class="collapsed ? 'arrow-left' : 'arrow-right'"></span>
        </button>

        <div class="content" v-show="!collapsed">
            <Metadata :meta="meta" />

            <CropControls
                :meta="meta"
                :initial-size="{ width: initialSize.width, height: initialSize.height }"
                @crop="$emit('crop')"
                @preview="$emit('preview-crop', $event)"
                @apply="$emit('resize-crop', $event)"
            />

            <div class="action-btns">
                <button class="icon-btn" @click="$emit('download')" title="Stiahnuť obrázok">
                    <img class="icon" :src="downloadIcon" alt="Download" />
                </button>
                <button class="icon-btn" @click="$emit('clear')" title="Vymazať obrázok">
                    <img class="icon" :src="binIcon" alt="Delete" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, watch } from 'vue'
    import Metadata from './Metadata.vue'
    import CropControls from './CropControls.vue'

    import downloadIcon from '@/assets/download.png'
    import binIcon from '@/assets/bin.png'

    const props = defineProps({
        meta: Object,
        initialSize: Object
    })

    const emit = defineEmits([
        'download',
        'clear',
        'crop',
        'preview-crop',
        'resize-crop'
    ])

    const collapsed = ref(true)

    watch(() => props.meta, m => {
        if (!m) collapsed.value = true
    })
</script>

<style scoped>
    .sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 30vw;
        max-width: 300px;
        background: #fafafa;
        border-left: 1px solid #ddd;
        box-shadow: -2px 0 4px rgba(0,0,0,0.1);
        transition: transform .3s ease;
        z-index: 100;
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

    .arrow-left, .arrow-right {
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
        position: relative;
        padding: 1rem;
        height: 100%;
        overflow-y: auto;
    }

    .action-btns {
        position: absolute;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        gap: 0.5rem;
    }

    .icon-btn {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
    }

    .icon-btn .icon {
        width: 24px;
        height: 24px;
        display: block;
    }
    .icon-btn:hover .icon {
        opacity: 0.7;
    }
</style>
