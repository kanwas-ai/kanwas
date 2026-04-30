import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import 'streamdown/styles.css'

import '@/index.css'
import App from '@/App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
