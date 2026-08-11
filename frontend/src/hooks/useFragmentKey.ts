import { useMemo } from 'react'
import * as Y from 'yjs'

let fragmentKeyCounter = 0
const fragmentKeys = new WeakMap<Y.XmlFragment, string>()

export function useFragmentKey(fragment: Y.XmlFragment): string {
  return useMemo(() => {
    let key = fragmentKeys.get(fragment)
    if (!key) {
      key = `fragment-${++fragmentKeyCounter}`
      fragmentKeys.set(fragment, key)
    }

    return key
  }, [fragment])
}
