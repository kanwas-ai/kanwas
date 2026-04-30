import { Component, type ReactNode } from 'react'

interface BlockNoteEditorErrorBoundaryProps {
  children: ReactNode
  fragmentKey: string
}

interface BlockNoteEditorErrorBoundaryState {
  hasError: boolean
  lastFragmentKey: string
}

export class BlockNoteEditorErrorBoundary extends Component<
  BlockNoteEditorErrorBoundaryProps,
  BlockNoteEditorErrorBoundaryState
> {
  constructor(props: BlockNoteEditorErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, lastFragmentKey: props.fragmentKey }
  }

  static getDerivedStateFromError(): Partial<BlockNoteEditorErrorBoundaryState> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(
    props: BlockNoteEditorErrorBoundaryProps,
    state: BlockNoteEditorErrorBoundaryState
  ): Partial<BlockNoteEditorErrorBoundaryState> | null {
    if (props.fragmentKey !== state.lastFragmentKey) {
      return { hasError: false, lastFragmentKey: props.fragmentKey }
    }

    return null
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[BlockNoteNode] Editor error caught, will remount:', error.message)
    console.debug('[BlockNoteNode] Error details:', { error, info })
  }

  componentDidUpdate(_prevProps: BlockNoteEditorErrorBoundaryProps, prevState: BlockNoteEditorErrorBoundaryState) {
    if (this.state.hasError && !prevState.hasError) {
      setTimeout(() => {
        this.setState({ hasError: false })
      }, 50)
    }
  }

  render() {
    if (this.state.hasError) {
      return null
    }

    return this.props.children
  }
}
