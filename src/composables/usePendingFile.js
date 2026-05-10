import { ref } from 'vue'

const pending = ref(null)

export function setPendingFile(file) {
  pending.value = file || null
}

export function consumePendingFile() {
  const file = pending.value
  pending.value = null
  return file
}
