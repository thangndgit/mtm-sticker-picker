import { useEffect, useState } from 'react'
import Picker from './components/Picker'
import Settings from './components/Settings'
import './App.css'

/**
 * App component - Router chính để hiển thị Picker hoặc Settings
 * dựa trên hash trong URL.
 * - #picker -> Hiển thị Picker component (popup)
 * - Không có hash hoặc #settings -> Hiển thị Settings component
 */
function App() {
  const [currentView, setCurrentView] = useState<'picker' | 'settings'>('settings')

  useEffect(() => {
    // Kiểm tra hash trong URL để xác định view
    const hash = window.location.hash
    if (hash === '#picker') {
      setCurrentView('picker')
    } else {
      setCurrentView('settings')
    }

    // Lắng nghe thay đổi hash
    const handleHashChange = () => {
      const newHash = window.location.hash
      if (newHash === '#picker') {
        setCurrentView('picker')
      } else {
        setCurrentView('settings')
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  return (
    <>
      {currentView === 'picker' ? <Picker /> : <Settings />}
    </>
  )
}

export default App
