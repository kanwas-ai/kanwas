import { test } from '@japa/runner'
import { asSchema } from 'ai'
import { createNativeTools } from '#agent/tools/native'
import {
  REPOSITION_FILES_DESCRIPTION,
  WRITE_FILE_DESCRIPTION,
  getOpenAIFileToolPathError,
  getRepositionFilesPreview,
  getWriteFilePreview,
  prepareWriteFileDuringStreaming,
  repositionFilesWithHarness,
  writeFileWithHarness,
  normalizeMarkdownSpacingArtifacts,
} from '#agent/tools/native_file_tools'
import type { ToolContext } from '#agent/tools/context'
import { State } from '#agent/state'
import { MockSandboxManager } from '#tests/mocks/sandbox_manager'

function createMockContext(providerName: string): ToolContext {
  const state = new State()
  state.setEventStream({
    emitEvent: () => undefined,
  } as any)

  return {
    state,
    eventStream: { emitEvent: () => undefined } as any,
    llm: {} as any,
    sandboxManager: new MockSandboxManager(),
    agent: { source: 'main' },
    flow: {} as any,
    workspaceDocumentService: {} as any,
    webSearchService: {} as any,
    posthogService: {} as any,
    traceContext: { traceId: 't', sessionId: 's', activeParentSpanId: 'p' },
    traceIdentity: {
      distinctId: 'u',
      workspaceId: 'w',
      organizationId: 'o',
      invocationId: 'i',
      correlationId: 'c',
    },
    providerName: providerName as ToolContext['providerName'],
    supportsNativeTools: providerName === 'anthropic' || providerName === 'openai',
    userId: 'user-1',
    abortSignal: new AbortController().signal,
  }
}

function withContext(ctx: ToolContext) {
  return { toolCallId: 'tc-1', experimental_context: ctx }
}

// ============================================================================
// Provider dispatch
// ============================================================================

test.group('createNativeTools dispatch', () => {
  test('returns bash + str_replace_based_edit_tool for anthropic', ({ assert }) => {
    const ctx = createMockContext('anthropic')
    const tools = createNativeTools(ctx)
    assert.properties(tools, ['bash', 'str_replace_based_edit_tool'])
  })

  test('returns shell + read_file + write_file + reposition_files + edit_file + delete_file for openai (native tools)', ({
    assert,
  }) => {
    const ctx = createMockContext('openai')
    const tools = createNativeTools(ctx)
    assert.properties(tools, ['shell', 'read_file', 'write_file', 'reposition_files', 'edit_file', 'delete_file'])
    assert.notProperty(tools, 'bash')
    assert.notProperty(tools, 'str_replace_based_edit_tool')
  })

  test('returns bash + str_replace_based_edit_tool for unknown providers', ({ assert }) => {
    const ctx = createMockContext('other')
    ctx.supportsNativeTools = false
    const tools = createNativeTools(ctx)
    assert.properties(tools, ['bash', 'str_replace_based_edit_tool'])
  })
})

// ============================================================================
// Standard bash tool (fallback for non-native providers)
// ============================================================================

function createStandardContext(): ToolContext {
  const ctx = createMockContext('other')
  ctx.supportsNativeTools = false
  return ctx
}

test.group('Standard bash tool', () => {
  test('executes a command and returns output', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.execStreaming = async (_cmd, opts) => {
      opts?.onStdout?.('hello world\n')
      return { stdout: 'hello world\n', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.bash.execute({ command: 'echo hello world' }, withContext(ctx))

    assert.include(result, 'hello world')
  })

  test('includes stderr in output', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.execStreaming = async () => {
      return { stdout: 'output', stderr: 'warning: something', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.bash.execute({ command: 'cmd' }, withContext(ctx))

    assert.include(result, 'output')
    assert.include(result, 'warning: something')
  })

  test('shows exit code on failure', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.execStreaming = async () => {
      return { stdout: '', stderr: 'not found', exitCode: 1 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.bash.execute({ command: 'cmd' }, withContext(ctx))

    assert.include(result, 'Exit code: 1')
  })

  test('creates bash timeline items', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.execStreaming = async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })

    const tools = createNativeTools(ctx) as any
    await tools.bash.execute({ command: 'ls' }, withContext(ctx))

    const bashItems = ctx.state.getTimeline().filter((i) => i.type === 'bash')
    assert.equal(bashItems.length, 1)
    assert.equal((bashItems[0] as any).command, 'ls')
    assert.equal((bashItems[0] as any).status, 'completed')
  })
})

// ============================================================================
// OpenAI read_file tool
// ============================================================================

test.group('OpenAI read_file tool', () => {
  test('creates text_editor timeline items for file reads', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.isDirectory = async () => false
    sandbox.readFile = async () => '# A\n# B'

    const tools = createNativeTools(ctx) as any
    const result = await tools.read_file.execute({ path: '/workspace/docs/a.md' }, withContext(ctx))

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    const bashItems = ctx.state.getTimeline().filter((i) => i.type === 'bash')

    assert.include(result, '1: # A')
    assert.equal(editorItems.length, 1)
    assert.equal(bashItems.length, 0)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      path: '/workspace/docs/a.md',
      command: 'view',
      status: 'completed',
    })
  })

  test('always reads the full file even when a view range is provided', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.isDirectory = async () => false
    sandbox.readFile = async () => 'line 1\nline 2\nline 3'

    const tools = createNativeTools(ctx) as any
    const result = await tools.read_file.execute(
      { path: '/workspace/research/note.md', view_range: [1, 1] } as any,
      withContext(ctx)
    )

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.include(result, '1: line 1')
    assert.include(result, '2: line 2')
    assert.include(result, '3: line 3')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      path: '/workspace/research/note.md',
      command: 'view',
      status: 'completed',
    })
    assert.isUndefined((editorItems[0] as any).viewRange)
  })

  test('rejects paths outside /workspace', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const tools = createNativeTools(ctx) as any

    const result = await tools.read_file.execute({ path: '/tmp/note.md' }, withContext(ctx))

    assert.equal(
      result,
      'Error: `read_file` only supports paths inside `/workspace`. Use absolute `/workspace/...` paths.'
    )
    assert.equal(ctx.state.getTimeline().filter((i) => i.type === 'text_editor').length, 0)
  })

  test('keeps shell reads as bash timeline items', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.execStreaming = async (_cmd, opts) => {
      opts?.onStdout?.('# title\n')
      return { stdout: '# title\n', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.shell.execute({ command: 'cat note.md' }, withContext(ctx))

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    const bashItems = ctx.state.getTimeline().filter((i) => i.type === 'bash')

    assert.equal(result, '# title\n')
    assert.equal(editorItems.length, 0)
    assert.equal(bashItems.length, 1)
    assert.deepInclude(bashItems[0], {
      type: 'bash',
      command: 'cat note.md',
      status: 'completed',
    })
  })

  test('persists shell workdir across calls', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const cwdCalls: string[] = []

    sandbox.execStreaming = async (_command, opts) => {
      cwdCalls.push(opts?.cwd ?? '/workspace')
      const stdout = `${opts?.cwd ?? '/workspace'}\n`
      opts?.onStdout?.(stdout)
      return { stdout, stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const firstResult = await tools.shell.execute({ command: 'pwd', workdir: '/workspace/research' }, withContext(ctx))
    const secondResult = await tools.shell.execute({ command: 'pwd' }, { ...withContext(ctx), toolCallId: 'tc-2' })

    assert.deepEqual(cwdCalls, ['/workspace/research', '/workspace/research'])
    assert.equal(firstResult.trim(), '/workspace/research')
    assert.equal(secondResult.trim(), '/workspace/research')

    const bashItems = ctx.state.getTimeline().filter((i) => i.type === 'bash')
    assert.equal(bashItems.length, 2)
    assert.equal(
      bashItems.filter((item: any) => item.command === 'pwd' && item.cwd === '/workspace/research').length,
      2
    )
    assert.isTrue(bashItems.every((item: any) => item.status === 'completed'))
  })

  test('passes shell command strings through verbatim', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let receivedCommand = ''

    sandbox.execStreaming = async (command) => {
      receivedCommand = command
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    await tools.shell.execute({ command: 'bash -lc "mkdir -p /workspace/test-dir"' }, withContext(ctx))

    assert.equal(receivedCommand, 'bash -lc "mkdir -p /workspace/test-dir"')
  })
})

test.group('OpenAI write_file tool', () => {
  test('includes markdown guidance to avoid backslash-based spacing artifacts', ({ assert }) => {
    assert.include(
      WRITE_FILE_DESCRIPTION,
      'Use normal blank lines for spacing instead of trailing backslashes or standalone `\\` lines'
    )
    assert.include(
      WRITE_FILE_DESCRIPTION,
      'do not create visual spacing with trailing backslashes or standalone `\\` lines'
    )
    assert.include(WRITE_FILE_DESCRIPTION, 'always format the title as `<emoji> <title>`')
    assert.include(WRITE_FILE_DESCRIPTION, '`🧭 Overview`')
    assert.include(WRITE_FILE_DESCRIPTION, 'placement: { mode: "with_file", anchorFilePath }')
  })

  test('includes yaml guidance for text sticky and link node files', ({ assert }) => {
    assert.include(
      WRITE_FILE_DESCRIPTION,
      '.text.yaml` and `.sticky.yaml` should usually be YAML with a `content: |` block'
    )
    assert.include(
      WRITE_FILE_DESCRIPTION,
      '.url.yaml` should be YAML with `url` plus optional `title`, `description`, and `siteName`'
    )
    assert.include(WRITE_FILE_DESCRIPTION, 'displayMode` set to either `preview` or `iframe`')
  })

  test('writes file input through the TypeScript harness', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const written: Record<string, string> = {}
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      written[path] = content
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const result = await writeFileWithHarness(sandbox, {
      path: 'docs/hello.md',
      content: 'Hello\nWorld',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
    })

    assert.deepEqual(result, {
      status: 'success',
      command: 'create',
      path: 'docs/hello.md',
      message: 'File success: docs/hello.md was created.',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
    })
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/hello.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/docs/hello.md', content: 'Hello\nWorld' },
    ])
    assert.equal(written['/workspace/docs/hello.md'], 'Hello\nWorld')
    assert.equal(
      written['/tmp/kanwas-placement/docs/hello.md.json'],
      '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}'
    )
    assert.equal(commands.length, 2)
    assert.include(commands[0], "mkdir -p '/workspace/docs'")
    assert.include(commands[1], "mkdir -p '/tmp/kanwas-placement/docs'")
  })

  test('normalizes markdown spacing artifacts before writing and previewing', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const written: Record<string, string> = {}

    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }
    sandbox.exec = async () => ({ stdout: '', stderr: '', exitCode: 0 })

    const input = {
      path: 'docs/hello.md',
      content: '# Hello\n\\\n\n\n\nWorld\n',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 } as const,
    }

    assert.deepInclude(getWriteFilePreview(input), {
      content: '# Hello\n\nWorld\n',
      lineCount: 3,
    })

    await writeFileWithHarness(sandbox, input)

    assert.equal(written['/workspace/docs/hello.md'], '# Hello\n\nWorld\n')
  })

  test('preserves spacing and backslashes inside markdown code fences', ({ assert }) => {
    const markdown = '# Note\n\\\n\n\n```text\n\\\n\n\ninside\n```\n\n\nDone\n'

    assert.equal(normalizeMarkdownSpacingArtifacts(markdown), '# Note\n\n```text\n\\\n\n\ninside\n```\n\nDone\n')
  })

  test('persists section join/create intents before writing the file', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.exec = async () => ({ stdout: '', stderr: '', exitCode: 0 })

    const result = await writeFileWithHarness(sandbox, {
      path: 'docs/cluster.md',
      content: 'Cluster',
      section: {
        mode: 'create',
        title: 'Cluster',
        layout: 'grid',
        x: 300,
        y: 180,
        columns: 2,
      },
    })

    assert.deepEqual(result.section, {
      mode: 'create',
      title: 'Cluster',
      layout: 'grid',
      x: 300,
      y: 180,
      columns: 2,
    })
    assert.deepEqual(writes[0], {
      path: '/tmp/kanwas-placement/docs/cluster.md.json',
      content: '{"section":{"mode":"create","title":"Cluster","layout":"grid","x":300,"y":180,"columns":2}}',
    })
  })

  test('creates a markdown placeholder during streaming and overwrites it during execute', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const written: Record<string, string> = {}
    const commands: string[] = []
    const existingPaths = new Set<string>()

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      existingPaths.add(path)
      written[path] = content
    }
    sandbox.fileExists = async (path) => existingPaths.has(path)
    sandbox.exec = async (command) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-stream',
      '{"path":"docs/hello.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240},"content":"Hello"}'
    )
    await Promise.resolve()
    await Promise.resolve()

    const result = await writeFileWithHarness(
      sandbox,
      {
        path: 'docs/hello.md',
        content: 'Hello\nWorld',
        section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
      },
      undefined,
      {
        toolCallId: 'tc-stream',
      }
    )

    assert.deepEqual(result, {
      status: 'success',
      command: 'create',
      path: 'docs/hello.md',
      message: 'File success: docs/hello.md was created.',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
    })
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/hello.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/docs/hello.md', content: '' },
      { path: '/workspace/docs/hello.md', content: 'Hello\nWorld' },
    ])
    assert.equal(written['/workspace/docs/hello.md'], 'Hello\nWorld')
    assert.equal(commands.length, 3)
    assert.isTrue(await sandbox.fileExists('/workspace/docs/hello.md'))
  })

  test('persists section intents during streaming bootstrap', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const existingPaths = new Set<string>()
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      existingPaths.add(path)
    }
    sandbox.fileExists = async (path) => existingPaths.has(path)
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":true}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-normalize',
      '{"path":"docs/neighbor.md","section":{"mode":"join","title":"Overview"},"content":"Hello"}'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.include(commands[0], '/sections/wait')
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/neighbor.md.json',
        content: '{"section":{"mode":"join","title":"Overview"}}',
      },
      { path: '/workspace/docs/neighbor.md', content: '' },
    ])
  })

  test('waits for relative create anchors during streaming bootstrap', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const existingPaths = new Set<string>()
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      existingPaths.add(path)
    }
    sandbox.fileExists = async (path) => existingPaths.has(path)
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":true}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-relative-create',
      '{"path":"docs/details.md","section":{"mode":"create","title":"Details","layout":"horizontal","placement":{"mode":"below","anchorSectionTitle":"Overview","gap":80}},"content":"Hello"}'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.include(commands[0], '/sections/wait')
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/details.md.json',
        content:
          '{"section":{"mode":"create","title":"Details","layout":"horizontal","placement":{"mode":"below","anchorSectionTitle":"Overview","gap":80}}}',
      },
      { path: '/workspace/docs/details.md', content: '' },
    ])
  })

  test('waits for file anchors and persists file-anchor section intents', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/file-anchor/resolve')) {
        return {
          stdout: JSON.stringify({
            ok: true,
            exists: true,
            destinationSectionTitle: 'Existing',
            createsSectionTitle: null,
          }),
          stderr: '',
          exitCode: 0,
        }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const result = await writeFileWithHarness(sandbox, {
      path: 'docs/new-file.md',
      content: 'New file',
      section: {
        mode: 'create',
        title: 'Related',
        layout: 'horizontal',
        placement: { mode: 'with_file', anchorFilePath: 'docs/anchor.md' },
      },
    })

    assert.include(commands[1], '/file-anchor/resolve')
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/new-file.md.json',
        content:
          '{"section":{"mode":"create","title":"Related","layout":"horizontal","placement":{"mode":"with_file","anchorFilePath":"docs/anchor.md"}}}',
      },
      { path: '/workspace/docs/new-file.md', content: 'New file' },
    ])
    assert.deepEqual(result.section, {
      mode: 'create',
      title: 'Related',
      layout: 'horizontal',
      placement: { mode: 'with_file', anchorFilePath: 'docs/anchor.md' },
    })
  })

  test('fails file-anchor writes before sidecar write when unsectioned anchor fallback title already exists', async ({
    assert,
  }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/file-anchor/resolve')) {
        return {
          stdout: JSON.stringify({
            ok: false,
            exists: true,
            destinationSectionTitle: null,
            createsSectionTitle: null,
            code: 'section_title_conflict',
            error: 'Section already exists for unsectioned anchor file: Related',
          }),
          stderr: '',
          exitCode: 0,
        }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    await assert.rejects(
      () =>
        writeFileWithHarness(sandbox, {
          path: 'docs/new-file.md',
          content: 'New file',
          section: {
            mode: 'create',
            title: 'Related',
            layout: 'horizontal',
            placement: { mode: 'with_file', anchorFilePath: 'docs/anchor.md' },
          },
        }),
      'Section already exists for unsectioned anchor file: Related'
    )

    assert.deepEqual(writes, [])
    assert.include(commands[1], '/file-anchor/resolve')
    assert.include(commands[1], 'Related')
  })

  test('revalidates a streaming-resolved file anchor during final write execution', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []
    const existingPaths = new Set<string>()
    let resolveCalls = 0

    sandbox.fileExists = async (path) => existingPaths.has(path)
    sandbox.readFile = async () => ''
    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      existingPaths.add(path)
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/file-anchor/resolve')) {
        resolveCalls += 1
        return {
          stdout: JSON.stringify(
            resolveCalls === 1
              ? { ok: true, exists: true, destinationSectionTitle: 'Existing', createsSectionTitle: null }
              : { ok: true, exists: false, destinationSectionTitle: null, createsSectionTitle: null }
          ),
          stderr: '',
          exitCode: 0,
        }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-file-anchor-stale',
      '{"path":"docs/new-file.md","section":{"mode":"create","title":"Related","layout":"horizontal","placement":{"mode":"with_file","anchorFilePath":"docs/anchor.md"}},"content":"New file"}'
    )
    await Promise.resolve()
    await Promise.resolve()

    await assert.rejects(
      () =>
        writeFileWithHarness(
          sandbox,
          {
            path: 'docs/new-file.md',
            content: 'New file',
            section: {
              mode: 'create',
              title: 'Related',
              layout: 'horizontal',
              placement: { mode: 'with_file', anchorFilePath: 'docs/anchor.md' },
            },
          },
          undefined,
          { toolCallId: 'tc-file-anchor-stale' }
        ),
      'File anchor not found after waiting: docs/anchor.md'
    )

    const resolveCommands = commands.filter((command) => command.includes('/file-anchor/resolve'))
    assert.lengthOf(resolveCommands, 2)
    assert.include(resolveCommands[1], '\\"timeoutMs\\":0')
    assert.deepEqual(
      writes.filter((write) => write.path === '/workspace/docs/new-file.md'),
      [{ path: '/workspace/docs/new-file.md', content: '' }]
    )
  })

  test('does not create a streaming placeholder for join when the live section never appears', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.fileExists = async () => false
    sandbox.exec = async (command) => {
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":false}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-join-timeout',
      '{"path":"docs/neighbor.md","section":{"mode":"join","title":"Overview"},"content":"Hello"}'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(writes, [])

    await assert.rejects(
      () =>
        writeFileWithHarness(
          sandbox,
          {
            path: 'docs/neighbor.md',
            content: 'Hello',
            section: { mode: 'join', title: 'Overview' },
          },
          undefined,
          { toolCallId: 'tc-join-timeout' }
        ),
      'Section not found after waiting: Overview'
    )
  })

  test('does not repeatedly wait for the same missing section while write_file input streams', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []
    const streamedInput = '{"path":"docs/neighbor.md","section":{"mode":"join","title":"Overview"},"content":"Hello"}'

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.fileExists = async () => false
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":false}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(sandbox, 'tc-repeated-missing-section', streamedInput)
    prepareWriteFileDuringStreaming(sandbox, 'tc-repeated-missing-section', streamedInput)
    prepareWriteFileDuringStreaming(sandbox, 'tc-repeated-missing-section', streamedInput)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(commands.filter((command) => command.includes('/sections/wait')).length, 1)
    assert.deepEqual(writes, [])

    await assert.rejects(
      () =>
        writeFileWithHarness(
          sandbox,
          {
            path: 'docs/neighbor.md',
            content: 'Hello',
            section: { mode: 'join', title: 'Overview' },
          },
          undefined,
          { toolCallId: 'tc-repeated-missing-section' }
        ),
      'Section not found after waiting: Overview'
    )

    assert.equal(commands.filter((command) => command.includes('/sections/wait')).length, 1)
  })

  test('does not create a streaming placeholder for relative create when the live anchor never appears', async ({
    assert,
  }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.fileExists = async () => false
    sandbox.exec = async (command) => {
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":false}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-relative-create-timeout',
      '{"path":"docs/details.md","section":{"mode":"create","title":"Details","layout":"horizontal","placement":{"mode":"below","anchorSectionTitle":"Overview","gap":80}},"content":"Hello"}'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(writes, [])

    await assert.rejects(
      () =>
        writeFileWithHarness(
          sandbox,
          {
            path: 'docs/details.md',
            content: 'Hello',
            section: {
              mode: 'create',
              title: 'Details',
              layout: 'horizontal',
              placement: { mode: 'below', anchorSectionTitle: 'Overview', gap: 80 },
            },
          },
          undefined,
          { toolCallId: 'tc-relative-create-timeout' }
        ),
      'Section not found after waiting: Overview'
    )
  })

  test('cleans up an empty markdown placeholder if the final write fails', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []
    const existingPaths = new Set<string>()

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      existingPaths.add(path)

      if (path === '/workspace/docs/hello.md' && content === 'Hello\nWorld') {
        throw new Error('disk full')
      }
    }
    sandbox.fileExists = async (path) => existingPaths.has(path)
    sandbox.readFile = async () => ''
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.startsWith('rm -f ')) {
        const quotedPath = command.match(/^rm -f '(.+)'$/)?.[1]
        if (quotedPath) {
          existingPaths.delete(quotedPath)
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    prepareWriteFileDuringStreaming(
      sandbox,
      'tc-fail',
      '{"path":"docs/hello.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240},"content":"Hello"}'
    )
    await Promise.resolve()
    await Promise.resolve()

    await assert.rejects(
      () =>
        writeFileWithHarness(
          sandbox,
          {
            path: 'docs/hello.md',
            content: 'Hello\nWorld',
            section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
          },
          undefined,
          {
            toolCallId: 'tc-fail',
          }
        ),
      'disk full'
    )

    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/hello.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/docs/hello.md', content: '' },
      { path: '/workspace/docs/hello.md', content: 'Hello\nWorld' },
    ])
    assert.isTrue(commands.some((command) => command === "rm -f '/workspace/docs/hello.md'"))
  })

  test('creates files through the OpenAI tool', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []

    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
      written[path] = content
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.write_file.execute(
      {
        path: 'docs/hello.md',
        content: 'Hello\nWorld',
        section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/hello.md was created.')
    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/docs/hello.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/docs/hello.md', content: 'Hello\nWorld' },
    ])
    assert.equal(written['/workspace/docs/hello.md'], 'Hello\nWorld')
    assert.equal(commands.length, 2)
    assert.include(commands[0], "mkdir -p '/workspace/docs'")

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'create',
      path: '/workspace/docs/hello.md',
      animationKey: '/workspace/docs/hello.md',
      markdownBody: 'Hello\nWorld',
      status: 'completed',
    })
  })

  test('fails when the write_file target already exists', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let writeCount = 0
    let commandCount = 0

    sandbox.fileExists = async (path) => path === '/workspace/docs/hello.md'
    sandbox.writeFile = async () => {
      writeCount += 1
    }
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.write_file.execute(
      {
        path: 'docs/hello.md',
        content: '# Hi\nWorld',
        section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
      },
      withContext(ctx)
    )

    assert.equal(
      result,
      'write_file failed because the target file already exists. Use `edit_file` with `replace_entire` to rewrite an existing file, or choose a new relative path.'
    )
    assert.equal(writeCount, 0)
    assert.equal(commandCount, 0)

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'create',
      path: '/workspace/docs/hello.md',
      status: 'failed',
      error: 'File already exists. Use edit_file with replace_entire to rewrite it.',
    })
    assert.equal((editorItems[0] as any).rawError, 'File already exists: docs/hello.md')
  })

  test('rejects write_file paths outside /workspace', async ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const result = await tools.write_file.execute(
      {
        path: '../escape.md',
        content: 'Hello',
        section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
      },
      withContext(ctx)
    )

    assert.equal(
      result,
      'Error: `write_file` only supports relative file paths inside `/workspace`. Use `notes/todo.md`, not `/workspace/notes/todo.md`.'
    )
    assert.equal(ctx.state.getTimeline().filter((i) => i.type === 'text_editor').length, 0)
  })

  test('registers a top-level object schema for structured write_file input', ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const jsonSchema: any = asSchema(tools.write_file.inputSchema).jsonSchema

    assert.equal(jsonSchema.type, 'object')
    assert.deepEqual(jsonSchema.required, ['path', 'section', 'content'])
    const sectionSchemas = jsonSchema.properties.section.anyOf ?? jsonSchema.properties.section.oneOf
    assert.equal(sectionSchemas?.length, 4)
    const absoluteCreateSectionSchema = sectionSchemas?.find(
      (entry: any) => entry.properties?.mode?.const === 'create' && entry.properties?.x && entry.properties?.y
    )
    const relativeCreateSectionSchema = sectionSchemas?.find(
      (entry: any) =>
        entry.properties?.mode?.const === 'create' &&
        entry.properties?.placement?.properties?.mode?.enum?.includes('after')
    )
    const fileAnchoredCreateSectionSchema = sectionSchemas?.find(
      (entry: any) =>
        entry.properties?.mode?.const === 'create' &&
        entry.properties?.placement?.properties?.mode?.const === 'with_file'
    )
    assert.exists(absoluteCreateSectionSchema?.properties?.layout)
    assert.exists(absoluteCreateSectionSchema?.properties?.x)
    assert.exists(absoluteCreateSectionSchema?.properties?.y)
    assert.notExists(absoluteCreateSectionSchema?.properties?.placement)
    assert.exists(relativeCreateSectionSchema?.properties?.layout)
    assert.notExists(relativeCreateSectionSchema?.properties?.x)
    assert.notExists(relativeCreateSectionSchema?.properties?.y)
    assert.exists(relativeCreateSectionSchema?.properties?.placement)
    assert.include(tools.write_file.description, 'omit `gap` to use the default section spacing of `400` pixels')
    assert.include(
      relativeCreateSectionSchema?.properties?.placement?.properties?.gap?.description,
      'default section gap of 400 pixels'
    )
    assert.exists(fileAnchoredCreateSectionSchema?.properties?.layout)
    assert.exists(fileAnchoredCreateSectionSchema?.properties?.placement?.properties?.anchorFilePath)
    assert.include(
      fileAnchoredCreateSectionSchema?.properties?.placement?.properties?.anchorFilePath?.description,
      'Workspace-relative path of the existing anchor file'
    )
    const joinSectionSchema = sectionSchemas?.find((entry: any) => entry.properties?.mode?.const === 'join')
    assert.exists(joinSectionSchema?.properties?.title)
    assert.include(
      jsonSchema.properties.content.description,
      'If the path ends with `.md`, write clean GitHub-flavored Markdown.'
    )
    assert.include(
      jsonSchema.properties.content.description,
      'If the path ends with `.text.yaml` or `.sticky.yaml`, write YAML using `content: |`'
    )
    assert.include(
      jsonSchema.properties.content.description,
      'If the path ends with `.url.yaml`, write YAML with `url`, optional `title`, `description`, and `siteName`, plus `displayMode` set to `preview` or `iframe`.'
    )
  })

  test('fails when section is omitted from write_file', async ({ assert }) => {
    const sandbox = new MockSandboxManager()

    await assert.rejects(
      () =>
        writeFileWithHarness(sandbox, {
          path: 'docs/hello.md',
          content: 'Hello\nWorld',
        } as any),
      'Invalid section: write_file requires a section object.'
    )
  })

  test('accepts section create payloads for write_file', async ({ assert }) => {
    const sandbox = new MockSandboxManager()

    const result = await writeFileWithHarness(sandbox, {
      path: 'docs/hello.md',
      content: 'Hello\nWorld',
      section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
    } as any)

    assert.equal(result.status, 'success')
    assert.deepEqual(result.section, {
      mode: 'create',
      title: 'Overview',
      layout: 'horizontal',
      x: 120,
      y: 240,
    })
  })

  test('accepts relative section create payloads for write_file', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    sandbox.exec = async (command) => {
      if (command.includes('/sections/wait')) {
        return { stdout: '{"ok":true,"exists":true}', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const result = await writeFileWithHarness(sandbox, {
      path: 'docs/hello.md',
      content: 'Hello\nWorld',
      section: {
        mode: 'create',
        title: 'Details',
        layout: 'grid',
        placement: { mode: 'after', anchorSectionTitle: 'Overview', gap: 96 },
        columns: 2,
      },
    } as any)

    assert.equal(result.status, 'success')
    assert.deepEqual(result.section, {
      mode: 'create',
      title: 'Details',
      layout: 'grid',
      placement: { mode: 'after', anchorSectionTitle: 'Overview', gap: 96 },
      columns: 2,
    })
  })
})

test.group('OpenAI reposition_files tool', () => {
  test('includes section guidance for existing files', ({ assert }) => {
    assert.include(REPOSITION_FILES_DESCRIPTION, 'edit canvas sections')
    assert.include(REPOSITION_FILES_DESCRIPTION, 'use section IDs from that file')
    assert.include(REPOSITION_FILES_DESCRIPTION, '`{ type: "update_section", sectionId, title?, layout?, columns? }`')
    assert.include(REPOSITION_FILES_DESCRIPTION, 'do not create a temporary section just to change layout')
    assert.include(
      REPOSITION_FILES_DESCRIPTION,
      '`{ type: "create_section", title, layout, columns?, location, paths }`'
    )
    assert.include(REPOSITION_FILES_DESCRIPTION, '`{ mode: "position", x, y }`')
    assert.include(REPOSITION_FILES_DESCRIPTION, 'anchorSectionId')
    assert.include(REPOSITION_FILES_DESCRIPTION, '`🧭 Overview`')
    assert.include(REPOSITION_FILES_DESCRIPTION, 'Top-level `canvas` is required once per tool call')
    assert.include(REPOSITION_FILES_DESCRIPTION, 'do not put `canvas` inside individual change objects')
    assert.notInclude(REPOSITION_FILES_DESCRIPTION, 'position | placement')
  })

  test('extracts typed reposition paths for execute timeline rendering', ({ assert }) => {
    const preview = getRepositionFilesPreview({
      canvas: 'docs',
      changes: [
        { type: 'move_files', sectionId: 'section-1', paths: ['docs/one.md'] },
        { type: 'update_section', sectionId: 'section-1', layout: 'grid' },
      ],
    })

    assert.deepEqual(preview, {
      paths: ['docs/one.md', 'docs'],
      count: 2,
    })
  })

  test('registers typed ID-based section schemas for reposition_files', ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const jsonSchema: any = asSchema(tools.reposition_files.inputSchema).jsonSchema
    assert.exists(jsonSchema.properties.canvas)
    const changeSchemas = jsonSchema.properties.changes.items.anyOf ?? jsonSchema.properties.changes.items.oneOf
    const updateSchema = changeSchemas.find((entry: any) => entry.properties?.type?.const === 'update_section')
    const moveSchema = changeSchemas.find((entry: any) => entry.properties?.type?.const === 'move_files')
    const createSchema = changeSchemas.find((entry: any) => entry.properties?.type?.const === 'create_section')

    assert.notExists(updateSchema?.properties?.canvas)
    assert.exists(updateSchema?.properties?.sectionId)
    assert.exists(updateSchema?.properties?.layout)
    assert.notExists(moveSchema?.properties?.canvas)
    assert.exists(moveSchema?.properties?.sectionId)
    assert.exists(moveSchema?.properties?.paths)
    assert.notExists(createSchema?.properties?.canvas)
    assert.exists(createSchema?.properties?.location)
    assert.notExists(createSchema?.properties?.position)
    assert.notExists(createSchema?.properties?.placement)
    assert.exists(createSchema?.properties?.paths)
    assert.notExists(changeSchemas.find((entry: any) => entry.properties?.type?.const === 'move_file'))
    assert.notExists(changeSchemas.find((entry: any) => entry.properties?.type?.const === 'rename_section'))
  })

  test('routes ID-based layout changes through the live-state section apply endpoint', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    const commands: string[] = []

    sandbox.fileExists = async () => true
    sandbox.isDirectory = async (path) => path === '/workspace/docs'
    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/apply')) {
        return { stdout: JSON.stringify({ ok: true, paths: [] }), stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const result = await repositionFilesWithHarness(sandbox, {
      canvas: 'docs',
      changes: [{ type: 'update_section', sectionId: 'section-1', layout: 'grid', columns: 3 }],
    })

    assert.deepEqual(result, {
      status: 'success',
      paths: ['docs'],
      message: 'Applied 1 section change.',
    })
    assert.lengthOf(commands, 1)
    assert.include(commands[0], '/sections/apply')
    assert.include(commands[0], '\\"canvasPath\\":\\"docs\\"')
    assert.include(commands[0], '\\"sectionId\\":\\"section-1\\"')
    assert.include(commands[0], '\\"layout\\":\\"grid\\"')
    assert.notInclude(commands[0], '\\"canvas\\":\\"docs\\"')
  })

  test('routes create_section with absolute location through the live-state section apply endpoint', async ({
    assert,
  }) => {
    const sandbox = new MockSandboxManager()
    const commands: string[] = []

    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/apply')) {
        return { stdout: JSON.stringify({ ok: true, paths: ['docs/one.md'] }), stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const result = await repositionFilesWithHarness(sandbox, {
      canvas: 'docs',
      changes: [
        {
          type: 'create_section',
          title: 'Checklist',
          layout: 'grid',
          columns: 2,
          location: { mode: 'position', x: 100, y: 200 },
          paths: ['docs/one.md'],
        },
      ],
    })

    assert.deepEqual(result, {
      status: 'success',
      paths: ['docs/one.md'],
      message: 'Applied 1 section change.',
    })
    assert.lengthOf(commands, 1)
    assert.include(commands[0], '/sections/apply')
    assert.include(commands[0], '\\"location\\":{\\"mode\\":\\"position\\",\\"x\\":100,\\"y\\":200}')
  })

  test('routes create_section with relative location through the live-state section apply endpoint', async ({
    assert,
  }) => {
    const sandbox = new MockSandboxManager()
    const commands: string[] = []

    sandbox.exec = async (command) => {
      commands.push(command)
      if (command.includes('/sections/apply')) {
        return { stdout: JSON.stringify({ ok: true, paths: ['docs/one.md'] }), stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    await repositionFilesWithHarness(sandbox, {
      canvas: 'docs',
      changes: [
        {
          type: 'create_section',
          title: 'Checklist',
          layout: 'horizontal',
          location: { mode: 'after', anchorSectionId: 'section-1', gap: 400 },
          paths: ['docs/one.md'],
        },
      ],
    })

    assert.lengthOf(commands, 1)
    assert.include(commands[0], '/sections/apply')
    assert.include(
      commands[0],
      '\\"location\\":{\\"mode\\":\\"after\\",\\"anchorSectionId\\":\\"section-1\\",\\"gap\\":400}'
    )
  })

  test('stores rawError on failed reposition_files timeline items', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.fileExists = async () => true
    sandbox.isDirectory = async (path) => path === '/workspace/docs'
    sandbox.exec = async (command) => {
      if (command.includes('/sections/apply')) {
        return { stdout: '', stderr: JSON.stringify({ ok: false, error: 'Section not found: section-1' }), exitCode: 1 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      { canvas: 'docs', changes: [{ type: 'update_section', sectionId: 'section-1', layout: 'grid' }] },
      withContext(ctx)
    )

    const item = ctx.state.getTimeline().find((timelineItem) => timelineItem.type === 'reposition_files')
    assert.equal(item?.status, 'failed')
    assert.equal(item?.rawError, 'Section not found: section-1')
    assert.include(result, 'Section not found')
  })

  test('creates a failed reposition_files timeline item for invalid paths before section apply', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let commandCount = 0
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      {
        canvas: 'docs',
        changes: [
          {
            type: 'move_files',
            sectionId: 'section-1',
            paths: ['/workspace/docs/one.md'],
          },
        ],
      },
      withContext(ctx)
    )

    assert.include(result, '`reposition_files` only supports relative file paths inside `/workspace`')
    assert.equal(commandCount, 0)

    const item = ctx.state.getTimeline().find((timelineItem) => timelineItem.type === 'reposition_files')
    assert.equal(item?.status, 'failed')
    assert.equal(item?.rawError, getOpenAIFileToolPathError('reposition_files'))
  })

  test('rejects legacy create_section position placement fields before section apply', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let commandCount = 0
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      {
        canvas: 'docs',
        changes: [
          {
            type: 'create_section',
            title: 'Two placements',
            layout: 'horizontal',
            position: { x: 100, y: 200 },
            placement: { mode: 'after', anchorSectionId: 'section-1' },
            paths: ['docs/one.md'],
          },
        ],
      },
      withContext(ctx)
    )

    assert.include(result, 'create_section now requires location')
    assert.equal(commandCount, 0)

    const item = ctx.state.getTimeline().find((timelineItem) => timelineItem.type === 'reposition_files')
    assert.equal(item?.status, 'failed')
    assert.equal(
      item?.rawError,
      'Invalid section: create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.'
    )
  })

  test('rejects legacy reposition changes before calling the live-state endpoint', async ({ assert }) => {
    const sandbox = new MockSandboxManager()
    let commandCount = 0
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    await assert.rejects(
      () =>
        repositionFilesWithHarness(sandbox, {
          canvas: 'docs',
          changes: [
            {
              type: 'move_file',
              path: 'docs/hello.md',
              section: { mode: 'join', title: 'Overview' },
            },
          ],
        } as any),
      'Invalid section: unsupported reposition change type: move_file'
    )
    assert.equal(commandCount, 0)
  })

  test('rejects missing top-level canvas before calling the live-state endpoint', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let commandCount = 0
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      {
        changes: [{ type: 'update_section', sectionId: 'section-1', layout: 'grid' }],
      },
      withContext(ctx)
    )

    assert.include(
      result,
      'reposition_files requires top-level canvas. Use the active canvas path, for example "inspiration-tips".'
    )
    assert.equal(commandCount, 0)

    const item = ctx.state.getTimeline().find((timelineItem) => timelineItem.type === 'reposition_files')
    assert.equal(item?.status, 'failed')
    assert.equal(
      item?.rawError,
      'Invalid section: reposition_files requires top-level canvas. Use the active canvas path, for example "inspiration-tips".'
    )
  })

  test('rejects legacy per-change canvas before calling the live-state endpoint', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let commandCount = 0
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      {
        canvas: 'docs',
        changes: [{ type: 'move_files', canvas: 'docs', sectionId: 'section-1', paths: ['docs/one.md'] }],
      },
      withContext(ctx)
    )

    assert.include(
      result,
      'reposition_files now uses one top-level canvas. Move canvas to the tool input and remove canvas from individual changes.'
    )
    assert.equal(commandCount, 0)

    const item = ctx.state.getTimeline().find((timelineItem) => timelineItem.type === 'reposition_files')
    assert.equal(item?.status, 'failed')
    assert.equal(
      item?.rawError,
      'Invalid section: reposition_files now uses one top-level canvas. Move canvas to the tool input and remove canvas from individual changes.'
    )
  })

  test('creates reposition_files timeline items for tool execution', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.exec = async (command) => {
      if (command.includes('/sections/apply')) {
        return { stdout: JSON.stringify({ ok: true, paths: [] }), stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.reposition_files.execute(
      {
        canvas: 'docs',
        changes: [
          {
            type: 'update_section',
            sectionId: 'section-1',
            layout: 'grid',
          },
        ],
      },
      withContext(ctx)
    )

    assert.equal(result, 'Applied 1 section change.')

    const items = ctx.state.getTimeline().filter((item) => item.type === 'reposition_files')
    assert.equal(items.length, 1)
    assert.deepInclude(items[0], {
      type: 'reposition_files',
      paths: ['docs'],
      status: 'completed',
    })
  })
})

test.group('OpenAI edit_file tool', () => {
  test('describes preserving markdown backslashes and line breaks exactly', ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const jsonSchema: any = asSchema(tools.edit_file.inputSchema).jsonSchema

    assert.include(
      tools.edit_file.description,
      'do not add, remove, or duplicate trailing backslashes or standalone `\\` lines just to create spacing'
    )
    assert.include(jsonSchema.properties.old_text.description, 'including whitespace, backslashes, and line breaks')
    assert.include(jsonSchema.properties.anchor_text.description, 'including whitespace, backslashes, and line breaks')
    assert.include(
      jsonSchema.properties.new_text.description,
      'do not introduce extra trailing backslashes or standalone `\\` lines'
    )
  })

  test('includes yaml guidance for text sticky and link node files', ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const jsonSchema: any = asSchema(tools.edit_file.inputSchema).jsonSchema

    assert.include(
      tools.edit_file.description,
      '.text.yaml` and `.sticky.yaml` should usually be YAML with a `content: |` block'
    )
    assert.include(
      tools.edit_file.description,
      '.url.yaml` should be YAML with `url` plus optional `title`, `description`, and `siteName`'
    )
    assert.include(tools.edit_file.description, 'displayMode` set to either `preview` or `iframe`')
    assert.include(
      jsonSchema.properties.new_text.description,
      'If the path ends with `.text.yaml` or `.sticky.yaml`, write YAML using `content: |`'
    )
    assert.include(
      jsonSchema.properties.new_text.description,
      'If the path ends with `.url.yaml`, write YAML with `url`, optional `title`, `description`, and `siteName`, plus `displayMode` set to `preview` or `iframe`.'
    )
  })

  test('registers a top-level object schema for OpenAI', ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const jsonSchema: any = asSchema(tools.edit_file.inputSchema).jsonSchema

    assert.equal(jsonSchema.type, 'object')
    assert.deepEqual(jsonSchema.required, ['path', 'mode', 'new_text'])
    assert.deepEqual(jsonSchema.properties.mode.enum, ['replace_exact', 'insert_after', 'replace_entire'])
    assert.notExists(jsonSchema.properties.placement)
  })

  test('replace_exact updates files through the OpenAI tool', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}
    sandbox.fileExists = async (path) => path === '/workspace/docs/hello.md'
    sandbox.readFile = async (path) => {
      assert.equal(path, '/workspace/docs/hello.md')
      return '# Hello\nWorld'
    }
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/hello.md',
        mode: 'replace_exact',
        old_text: 'World',
        new_text: 'Everyone',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/hello.md was edited.')
    assert.equal(written['/workspace/docs/hello.md'], '# Hello\nEveryone')

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'str_replace',
      path: '/workspace/docs/hello.md',
      status: 'completed',
    })
  })

  test('insert_after inserts new text through the OpenAI tool', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}
    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async (path) => {
      assert.equal(path, '/workspace/docs/todos.md')
      return '# Todos\n\n* one\n* three\n'
    }
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'insert_after',
        anchor_text: '* one\n',
        new_text: '* two\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.md was edited.')
    assert.equal(written['/workspace/docs/todos.md'], '# Todos\n\n* one\n* two\n* three\n')

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'insert',
      path: '/workspace/docs/todos.md',
      status: 'completed',
    })
  })

  test('replace_entire rewrites an existing file through the OpenAI tool', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async (path) => {
      assert.equal(path, '/workspace/docs/todos.md')
      return '# Todos\n\n* one\n'
    }
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'replace_entire',
        new_text: '# Todos\n\n* rewritten\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.md was rewritten.')
    assert.equal(written['/workspace/docs/todos.md'], '# Todos\n\n* rewritten\n')

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'str_replace',
      path: '/workspace/docs/todos.md',
      status: 'completed',
    })
  })

  test('replace_entire removes markdown spacer artifacts without touching fenced code', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async () => '# Todos\n\n* one\n'
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'replace_entire',
        new_text: '# Todos\n\\\n\n\n```text\n\\\n\n\ninside\n```\n\n\n* rewritten\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.md was rewritten.')
    assert.equal(written['/workspace/docs/todos.md'], '# Todos\n\n```text\n\\\n\n\ninside\n```\n\n* rewritten\n')
  })

  test('insert_after cleans existing and inserted markdown spacer artifacts', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async () => '# Todos\n\\\n\n* one\n* three\n'
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'insert_after',
        anchor_text: '* one\n',
        new_text: '\n\\\n\n* two\n\n\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.md was edited.')
    assert.equal(written['/workspace/docs/todos.md'], '# Todos\n\n* one\n\n* two\n\n* three\n')
  })

  test('does not normalize yaml edit contents', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.text.yaml'
    sandbox.readFile = async () => 'content: |\n  old\n'
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.text.yaml',
        mode: 'replace_entire',
        new_text: 'content: |\n  one\n  \\\n\n\n  two\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.text.yaml was rewritten.')
    assert.equal(written['/workspace/docs/todos.text.yaml'], 'content: |\n  one\n  \\\n\n\n  two\n')
  })

  test('does not create a placement sidecar during edit_file writes', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const writes: Array<{ path: string; content: string }> = []
    const commands: string[] = []

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async () => '# Todos\n\n* one\n'
    sandbox.writeFile = async (path, content) => {
      writes.push({ path, content })
    }
    sandbox.exec = async (command) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'replace_entire',
        new_text: '# Todos\n\n* moved\n',
      },
      withContext(ctx)
    )

    assert.equal(result, 'File success: docs/todos.md was rewritten.')
    assert.deepEqual(writes, [{ path: '/workspace/docs/todos.md', content: '# Todos\n\n* moved\n' }])
    assert.deepEqual(commands, [])
  })

  test('fails when replace_exact cannot find the current text', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let writeCount = 0
    const originalFileContent = '# Todos\n\n* one\n* two\n* three\n'

    sandbox.fileExists = async (path) => path === '/workspace/docs/todos.md'
    sandbox.readFile = async (path) => {
      assert.equal(path, '/workspace/docs/todos.md')
      return originalFileContent
    }
    sandbox.writeFile = async () => {
      writeCount += 1
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/todos.md',
        mode: 'replace_exact',
        old_text: '- two',
        new_text: '* two updated',
      },
      withContext(ctx)
    )

    assert.equal(
      result,
      'edit_file replace_exact failed because `old_text` does not match the current file. Read the file again, copy the exact current text, and retry with a smaller unique match.'
    )
    assert.equal(writeCount, 0)

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'str_replace',
      path: '/workspace/docs/todos.md',
      status: 'failed',
      error: 'Could not edit the file because the exact target text was not found. Read the file again and retry.',
    })
    assert.equal((editorItems[0] as any).rawError, 'Exact match not found.')
    assert.equal((editorItems[0] as any).originalFileContent, originalFileContent)
  })

  test('rejects replace_exact calls without old_text before executing', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let readCount = 0

    sandbox.readFile = async () => {
      readCount += 1
      return '# Hello\nWorld'
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: 'docs/hello.md',
        mode: 'replace_exact',
        new_text: 'Everyone',
      },
      withContext(ctx)
    )

    assert.equal(result, 'Error: `edit_file` with `replace_exact` requires a non-empty `old_text` value.')
    assert.equal(readCount, 0)
    assert.equal(ctx.state.getTimeline().filter((i) => i.type === 'text_editor').length, 0)
  })

  test('rejects edit_file paths outside /workspace', async ({ assert }) => {
    const ctx = createMockContext('openai')

    const tools = createNativeTools(ctx) as any
    const result = await tools.edit_file.execute(
      {
        path: '../escape.md',
        mode: 'replace_exact',
        old_text: 'Hello',
        new_text: 'Hi',
      },
      withContext(ctx)
    )

    assert.equal(
      result,
      'Error: `edit_file` only supports relative file paths inside `/workspace`. Use `notes/todo.md`, not `/workspace/notes/todo.md`.'
    )
    assert.equal(ctx.state.getTimeline().filter((i) => i.type === 'text_editor').length, 0)
  })
})

test.group('OpenAI delete_file tool', () => {
  test('deletes files through the OpenAI tool', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const commands: string[] = []

    sandbox.fileExists = async (path) => path === '/workspace/docs/old.md'
    sandbox.exec = async (command) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.delete_file.execute({ path: 'docs/old.md' }, withContext(ctx))

    assert.equal(result, 'File success: docs/old.md was deleted.')
    assert.deepEqual(commands, ["rm -f '/workspace/docs/old.md'"])

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'delete',
      path: '/workspace/docs/old.md',
      status: 'completed',
    })
  })

  test('fails when delete_file target does not exist', async ({ assert }) => {
    const ctx = createMockContext('openai')
    const sandbox = ctx.sandboxManager as MockSandboxManager
    let commandCount = 0

    sandbox.fileExists = async () => false
    sandbox.exec = async () => {
      commandCount += 1
      return { stdout: '', stderr: '', exitCode: 0 }
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.delete_file.execute({ path: 'docs/missing.md' }, withContext(ctx))

    assert.equal(
      result,
      'delete_file failed because the target file was not found. Read the workspace to confirm the correct relative path inside /workspace, then retry.'
    )
    assert.equal(commandCount, 0)

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.deepInclude(editorItems[0], {
      type: 'text_editor',
      command: 'delete',
      path: '/workspace/docs/missing.md',
      status: 'failed',
      error: 'File could not be deleted because it was not found. Check the path and retry.',
    })
    assert.equal((editorItems[0] as any).rawError, 'File not found: docs/missing.md')
  })
})

// ============================================================================
// Standard text editor tool (fallback for non-native providers)
// ============================================================================

test.group('Standard text editor tool', () => {
  test('views a file with line numbers', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.fileExists = async () => true
    sandbox.isDirectory = async () => false
    sandbox.readFile = async () => '# Hello\nWorld'

    const tools = createNativeTools(ctx) as any
    const result = await tools.str_replace_based_edit_tool.execute(
      { command: 'view', path: '/workspace/test.md' },
      withContext(ctx)
    )

    assert.include(result, '1: # Hello')
    assert.include(result, '2: World')
  })

  test('creates a new file', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}
    sandbox.fileExists = async () => false
    sandbox.isDirectory = async () => false
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.str_replace_based_edit_tool.execute(
      { command: 'create', path: '/workspace/test.md', file_text: '# Hello\nWorld' },
      withContext(ctx)
    )

    assert.include(result, 'created successfully')
    assert.equal(written['/workspace/test.md'], '# Hello\nWorld')
  })

  test('replaces text in a file', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    const written: Record<string, string> = {}
    sandbox.fileExists = async () => true
    sandbox.isDirectory = async () => false
    sandbox.readFile = async () => '# Hello\nWorld'
    sandbox.writeFile = async (path, content) => {
      written[path] = content
    }

    const tools = createNativeTools(ctx) as any
    const result = await tools.str_replace_based_edit_tool.execute(
      { command: 'str_replace', path: '/workspace/test.md', old_str: 'World', new_str: 'Everyone' },
      withContext(ctx)
    )

    assert.include(result, 'Successfully replaced')
    assert.equal(written['/workspace/test.md'], '# Hello\nEveryone')
  })

  test('rejects paths outside /workspace', async ({ assert }) => {
    const ctx = createStandardContext()

    const tools = createNativeTools(ctx) as any
    const result = await tools.str_replace_based_edit_tool.execute(
      { command: 'view', path: '/etc/passwd' },
      withContext(ctx)
    )

    assert.include(result, '/workspace')
  })

  test('creates text_editor timeline items', async ({ assert }) => {
    const ctx = createStandardContext()
    const sandbox = ctx.sandboxManager as MockSandboxManager
    sandbox.fileExists = async () => true
    sandbox.isDirectory = async () => false
    sandbox.readFile = async () => '# Old\nContent'
    sandbox.writeFile = async () => {}

    const tools = createNativeTools(ctx) as any
    await tools.str_replace_based_edit_tool.execute(
      { command: 'str_replace', path: '/workspace/test.md', old_str: 'Old', new_str: 'New' },
      withContext(ctx)
    )

    const editorItems = ctx.state.getTimeline().filter((i) => i.type === 'text_editor')
    assert.equal(editorItems.length, 1)
    assert.equal((editorItems[0] as any).command, 'str_replace')
    assert.equal((editorItems[0] as any).path, '/workspace/test.md')
  })
})
