import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Which deploy this page came from; handy when checking an update took effect.
document.documentElement.dataset.build = __BUILD_ID__

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
