// Author: Peter Huňady (xhunadp00)
// File: usePendingFile.js
// Bachelor's Thesis, VUT Brno, 2026

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
