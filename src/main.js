import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.config.errorHandler = (err) => { console.error(err) }
app.use(router).mount('#app')