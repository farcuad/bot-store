import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.tsx'
import 'glass-alert-animation/styles'
import { GlassAlertProvider } from 'glass-alert-animation'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GlassAlertProvider>
          <App />
        </GlassAlertProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
