import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Шрифты грузим JS-импортом (а не @import в index.css): так Vite разрешает
// пакеты @fontsource напрямую, минуя обработку @import Tailwind v4, иначе в
// dev @font-face не подхватывались и тело откатывалось на системный шрифт.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/tektur/500.css'
import '@fontsource/tektur/600.css'
import '@fontsource/tektur/700.css'
import './index.css'
import './admin.css'
import App from './App.jsx'

document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
