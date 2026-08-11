import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUI } from '@/store/useUIStore'
import { useTheme } from '@/providers/theme'
import {
  DEFAULTS,
  applyOverrides,
  buildHandoffMarkdown,
  clearPersistedState,
  cloneDefaults,
  composeBoxShadow,
  loadPersistedState,
  persistState,
  removeOverrides,
  type CardStyle,
  type CardStyleEditorState,
  type ThemeKey,
} from './card-style-editor'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function HexTextInput({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(value)

  // Keep the draft in sync when the value changes externally (theme switch, reset, etc.)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      type="text"
      value={draft}
      spellCheck={false}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        if (HEX_RE.test(next)) onCommit(next)
      }}
      onBlur={() => {
        if (!HEX_RE.test(draft)) setDraft(value)
      }}
      className="w-[68px] text-[11px] font-mono bg-transparent border border-outline rounded px-1 py-0.5 text-foreground"
    />
  )
}

function HexRow({ label, hex, onCommit }: { label: string; hex: string; onCommit: (hex: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-[11px] text-foreground-muted">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={hex}
          onChange={(e) => onCommit(e.target.value)}
          aria-label={`${label} color picker`}
          className="w-6 h-6 rounded border border-outline cursor-pointer bg-transparent p-0"
        />
        <HexTextInput value={hex} onCommit={onCommit} />
      </div>
    </div>
  )
}

function SliderNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onCommit: (n: number) => void
}) {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max])

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-foreground-muted">{label}</label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = parseFloat(e.target.value)
            if (!Number.isNaN(n)) onCommit(clamp(n))
          }}
          className="w-[52px] text-[11px] font-mono bg-transparent border border-outline rounded px-1 py-0.5 text-foreground"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onCommit(clamp(parseFloat(e.target.value)))}
        className="w-full"
      />
    </div>
  )
}

export default function CardStyleEditor() {
  const { cardStyleEditorOpen, setCardStyleEditorOpen } = useUI()
  const { themeMode, setThemeMode } = useTheme()
  const [state, setState] = useState<CardStyleEditorState>(() => loadPersistedState() ?? cloneDefaults())
  const [copied, setCopied] = useState(false)

  const editingTheme: ThemeKey = themeMode === 'dark' ? 'dark' : 'light'
  const current = state[editingTheme]

  const commit = useCallback((next: CardStyleEditorState) => {
    setState(next)
    applyOverrides(next)
    persistState(next)
  }, [])

  const patchCurrent = useCallback(
    (patch: Partial<CardStyle>) => {
      commit({ ...state, [editingTheme]: { ...state[editingTheme], ...patch } })
    },
    [commit, state, editingTheme]
  )

  const patchShadow = useCallback(
    (patch: Partial<CardStyle['shadow']>) => {
      commit({
        ...state,
        [editingTheme]: {
          ...state[editingTheme],
          shadow: { ...state[editingTheme].shadow, ...patch },
        },
      })
    },
    [commit, state, editingTheme]
  )

  const resetTheme = useCallback(() => {
    commit({
      ...state,
      [editingTheme]: JSON.parse(JSON.stringify(DEFAULTS[editingTheme])) as CardStyle,
    })
  }, [commit, state, editingTheme])

  const resetAll = useCallback(() => {
    setState(cloneDefaults())
    removeOverrides()
    clearPersistedState()
  }, [])

  const markdown = useMemo(() => buildHandoffMarkdown(state), [state])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (e) {
      console.error('Failed to copy card style handoff markdown:', e)
    }
  }, [markdown])

  if (!cardStyleEditorOpen) return null

  return (
    <div className="fixed top-16 right-4 z-[150] w-[300px] max-h-[calc(100vh-5rem)] flex flex-col rounded-lg border border-outline bg-canvas text-foreground shadow-xl text-[12px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline shrink-0">
        <span className="font-semibold text-[13px]">Card style editor</span>
        <button
          type="button"
          onClick={() => setCardStyleEditorOpen(false)}
          aria-label="Close card style editor"
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-foreground/10 text-foreground/60 hover:text-foreground leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
        <div className="flex rounded-md border border-outline overflow-hidden text-[11px]">
          {(['light', 'dark'] as ThemeKey[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setThemeMode(t)}
              className={`flex-1 py-1 capitalize transition-colors cursor-pointer ${
                editingTheme === t ? 'bg-foreground/10 font-semibold' : 'hover:bg-foreground/5 text-foreground-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <HexRow label="Background" hex={current.bg} onCommit={(hex) => patchCurrent({ bg: hex })} />

        <SliderNumberField
          label="Corner radius"
          value={current.radius}
          min={0}
          max={40}
          step={1}
          onCommit={(n) => patchCurrent({ radius: n })}
        />
        <SliderNumberField
          label="Border width"
          value={current.borderWidth}
          min={0}
          max={4}
          step={0.5}
          onCommit={(n) => patchCurrent({ borderWidth: n })}
        />

        <div className="flex flex-col gap-1 pt-1 border-t border-outline/60">
          <HexRow
            label="Border color"
            hex={current.borderColor}
            onCommit={(hex) => patchCurrent({ borderColor: hex })}
          />
          <SliderNumberField
            label="Border alpha"
            value={current.borderAlpha}
            min={0}
            max={1}
            step={0.01}
            onCommit={(n) => patchCurrent({ borderAlpha: n })}
          />
        </div>

        <div className="pt-1 border-t border-outline/60">
          <HexRow
            label="Selected accent"
            hex={current.borderAccent}
            onCommit={(hex) => patchCurrent({ borderAccent: hex })}
          />
        </div>

        <div className="pt-1 border-t border-outline/60">
          <SliderNumberField
            label="Card opacity"
            value={current.opacity}
            min={0}
            max={1}
            step={0.01}
            onCommit={(n) => patchCurrent({ opacity: n })}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1 border-t border-outline/60">
          <span className="text-[11px] font-semibold text-foreground-muted">Shadow</span>
          <SliderNumberField
            label="X"
            value={current.shadow.x}
            min={-20}
            max={40}
            step={1}
            onCommit={(n) => patchShadow({ x: n })}
          />
          <SliderNumberField
            label="Y"
            value={current.shadow.y}
            min={-20}
            max={40}
            step={1}
            onCommit={(n) => patchShadow({ y: n })}
          />
          <SliderNumberField
            label="Blur"
            value={current.shadow.blur}
            min={0}
            max={80}
            step={1}
            onCommit={(n) => patchShadow({ blur: n })}
          />
          <SliderNumberField
            label="Spread"
            value={current.shadow.spread}
            min={-20}
            max={20}
            step={1}
            onCommit={(n) => patchShadow({ spread: n })}
          />
          <HexRow label="Shadow color" hex={current.shadow.color} onCommit={(hex) => patchShadow({ color: hex })} />
          <SliderNumberField
            label="Shadow alpha"
            value={current.shadow.alpha}
            min={0}
            max={1}
            step={0.01}
            onCommit={(n) => patchShadow({ alpha: n })}
          />

          <label className="text-[11px] text-foreground-muted mt-1">box-shadow (raw override)</label>
          <textarea
            value={current.shadowRaw}
            onChange={(e) => patchCurrent({ shadowRaw: e.target.value })}
            placeholder={composeBoxShadow(current.shadow)}
            rows={2}
            spellCheck={false}
            className="w-full text-[11px] font-mono bg-transparent border border-outline rounded px-1.5 py-1 text-foreground resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1 border-t border-outline/60">
          <button
            type="button"
            onClick={resetTheme}
            className="flex-1 text-[11px] py-1 rounded border border-outline hover:bg-foreground/5 cursor-pointer"
          >
            Reset theme
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="flex-1 text-[11px] py-1 rounded border border-outline hover:bg-foreground/5 cursor-pointer"
          >
            Reset all
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full text-[12px] py-1.5 rounded bg-foreground text-canvas font-medium hover:opacity-90 cursor-pointer"
        >
          {copied ? 'Copied ✓' : 'Copy for handoff'}
        </button>

        <details className="text-[11px]">
          <summary className="cursor-pointer text-foreground-muted select-none">Handoff values</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] bg-foreground/5 rounded p-2">
            {markdown}
          </pre>
        </details>
      </div>
    </div>
  )
}
