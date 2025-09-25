import { ref } from 'vue'

const _pending = ref(null)

export function setPendingFile(file) {
  _pending.value = file || null
}

export function consumePendingFile() {
  const f = _pending.value
  _pending.value = null
  return f
}
