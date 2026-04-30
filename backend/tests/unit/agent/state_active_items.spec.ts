import { test } from '@japa/runner'
import { State } from '#agent/index'

test.group('state active item cleanup', () => {
  test('marks active tool items failed during interruption cleanup', ({ assert }) => {
    const state = new State()

    const textEditorId = state.addTimelineItem(
      {
        type: 'text_editor',
        command: 'create',
        path: '/workspace/research.md',
        status: 'executing',
        timestamp: Date.now(),
      },
      'text_editor_started'
    )

    const bashId = state.addTimelineItem(
      {
        type: 'bash',
        command: 'ls',
        cwd: '/workspace',
        status: 'completed',
        timestamp: Date.now(),
      },
      'bash_completed'
    )

    const repositionFilesId = state.addTimelineItem(
      {
        type: 'reposition_files',
        paths: ['/workspace/research.md'],
        status: 'executing',
        timestamp: Date.now(),
      },
      'reposition_files_started'
    )

    const changed = state.failActiveToolItems('Execution stopped by user')

    assert.isTrue(changed)

    assert.deepInclude(state.findTimelineItem(textEditorId), {
      id: textEditorId,
      type: 'text_editor',
      status: 'failed',
      error: 'Execution stopped by user',
    })

    assert.deepInclude(state.findTimelineItem(repositionFilesId), {
      id: repositionFilesId,
      type: 'reposition_files',
      status: 'failed',
      error: 'Execution stopped by user',
    })

    assert.deepInclude(state.findTimelineItem(bashId), {
      id: bashId,
      type: 'bash',
      status: 'completed',
    })
  })
})
