import { useEffect, useRef, type EffectCallback } from 'react'

export const useMount = (effect: EffectCallback) => {
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) {
      console.log('useMount: Component mounted')
      return effect()
    }

    mounted.current = true

    return () => {}
  }, [mounted, effect])
}
