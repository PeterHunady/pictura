<template>
    <div class="metadata">
        <button class="metadata-toggle" @click="collapsed = !collapsed">
            <span>Properties</span>
            <span :class="collapsed ? 'arrow-right' : 'arrow-down'"></span>
        </button>

        <ul v-show="!collapsed" class="metadata-list" v-if="meta">
            <li><p>Name:</p> {{ meta.name || '—' }}</li>
            <li><p>Type:</p> {{ meta.type || '—' }}</li>
            <li><p>Size:</p> {{ formatSize(meta.size) }}</li>
            <li><p>Dimensions:</p> {{ meta.width }} × {{ meta.height }} px</li>
            <li><p>Last Modified:</p> {{ formatDate(meta.lastModified) }}</li>
        </ul>

        <p v-show="!collapsed" v-else class="no-meta">No image loaded.</p>
    </div>
</template>

<script setup>
    import { ref } from 'vue'
    const props = defineProps({ meta: Object })
    const collapsed = ref(true)

    function formatSize(b) {
        if (!b) {
            return '—'
        }
        
        const kb = b/1024
        return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb/1024).toFixed(1)} MB`
    }

    const formatDate = ts => ts ? new Date(ts).toLocaleString() : '—'
</script>

<style scoped>
    .metadata {
        margin-top: 1rem;
    }

    .metadata-toggle {
        width: 100%;
        padding: 0.7rem;
        background:rgba(0,0,0,0.05);
        border: none;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
    }

    .metadata-toggle span {
        font-size: 24px;
    }

    .metadata-list {
        list-style: none;
        padding: 0.5rem;
        margin: 0;
    }

    .metadata-list li {
        display: flex;
        margin-bottom: 0.3rem;
    }

    .metadata-list li p {
        font-weight: 600;
        margin-right: 0.3rem;
        white-space: nowrap;
    }

    .no-meta {
        padding: 0.5rem;
        font-style: italic;
        color: #666;
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

    li {
        color: black !important;
    }
</style>
