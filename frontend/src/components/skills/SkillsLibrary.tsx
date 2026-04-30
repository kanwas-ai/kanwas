import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  useSkills,
  useToggleSkill,
  useDeleteSkill,
  useDuplicateSkill,
  useUpdateSkill,
  useCreateSkill,
} from '@/hooks/useSkillsApi'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { parseSkillMd } from 'shared/skills'
import { CATEGORY_META, CATEGORY_ORDER, getSkillCategory, type SkillCategory } from './skill-utils'
import type { Skill } from '@/api/skills'

// Right panel mode: 'view' | 'edit' | 'create'
type RightPanelMode = 'view' | 'edit' | 'create'

// Draft skill for duplicating without saving immediately
interface DraftSkill {
  sourceSkill: Skill
  name: string
  description: string
  body: string
}

// Helper to check if a skill is featured (from metadata)
const isFeaturedSkill = (skill: Skill) => skill.metadata?.featured === true

// Extract humanized title from skill body (first H1 heading) or metadata
function getSkillTitle(skill: Skill): string {
  // Check if title is in metadata
  if (typeof skill.metadata?.title === 'string') {
    return skill.metadata.title
  }
  // Extract from body - look for first H1 heading
  const h1Match = skill.body?.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }
  // Fallback: humanize the name (action-items -> Action Items)
  return skill.name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Extract brief description from skill body (first paragraph after H1) or fall back to metadata description
function getSkillBriefDescription(skill: Skill): string | null {
  // Try to extract from body first - look for first paragraph after H1
  if (skill.body) {
    // Split by lines and find content after the H1
    const lines = skill.body.split('\n')
    let foundH1 = false
    for (const line of lines) {
      if (line.startsWith('# ')) {
        foundH1 = true
        continue
      }
      if (foundH1 && line.trim() && !line.startsWith('#')) {
        return line.trim()
      }
    }
  }
  // Fall back to metadata description
  return skill.description || null
}

type FilterType = 'all' | 'featured' | 'enabled' | SkillCategory

// SVG-based category shapes - craft: square, framework: triangle, workflow: hexagon, custom: circle
function CategoryShape({
  category,
  size = 'sm',
  inverted = false,
}: {
  category: SkillCategory
  size?: 'sm' | 'md'
  inverted?: boolean
}) {
  const colorClass = inverted
    ? 'fill-canvas'
    : {
        craft: 'fill-violet-400',
        framework: 'fill-sky-400',
        workflow: 'fill-teal-400',
        custom: 'fill-pink-400',
      }[category]

  const px = size === 'md' ? 10 : 8

  if (category === 'craft') {
    // Triangle pointing up
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 10 10"
        className="flex-shrink-0 opacity-70"
        style={{ shapeRendering: 'geometricPrecision' }}
      >
        <polygon points="5,1 9,9 1,9" className={colorClass} />
      </svg>
    )
  }

  if (category === 'framework') {
    // Diamond (square rotated 45°)
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 10 10"
        className="flex-shrink-0 opacity-70"
        style={{ shapeRendering: 'geometricPrecision' }}
      >
        <rect x="1.5" y="1.5" width="7" height="7" rx="0.5" transform="rotate(45 5 5)" className={colorClass} />
      </svg>
    )
  }

  if (category === 'workflow') {
    // Pentagon (pointy top)
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 10 10"
        className="flex-shrink-0 opacity-70"
        style={{ shapeRendering: 'geometricPrecision' }}
      >
        <polygon points="5,0.5 9.3,3.6 7.6,8.6 2.4,8.6 0.7,3.6" className={colorClass} />
      </svg>
    )
  }

  // Custom - circle (dot)
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 10 10"
      className="flex-shrink-0 opacity-70"
      style={{ shapeRendering: 'geometricPrecision' }}
    >
      <circle cx="5" cy="5" r="4" className={colorClass} />
    </svg>
  )
}

interface SkillsLibraryProps {
  isOpen: boolean
  onClose: () => void
}

export function SkillsLibrary({ isOpen, onClose }: SkillsLibraryProps) {
  const { data: skills, isLoading } = useSkills()
  const toggleSkill = useToggleSkill()
  const deleteSkill = useDeleteSkill()
  const duplicateSkill = useDuplicateSkill()
  const updateSkill = useUpdateSkill()
  const createSkill = useCreateSkill()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('featured')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('view')
  const [togglingSkillId, setTogglingSkillId] = useState<string | null>(null)
  const [draftSkill, setDraftSkill] = useState<DraftSkill | null>(null)
  const [glowWarningForSkillId, setGlowWarningForSkillId] = useState<string | null>(null)
  // Snapshot of enabled skill IDs when "enabled" filter was activated
  const [enabledFilterSnapshot, setEnabledFilterSnapshot] = useState<Set<string> | null>(null)

  // Resizable split pane
  const [splitPosition, setSplitPosition] = useState(50) // percentage
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newPosition = ((e.clientX - rect.left) / rect.width) * 100
    // Clamp between 30% and 70%
    setSplitPosition(Math.min(70, Math.max(30, newPosition)))
  }, [])

  const handleDividerDoubleClick = useCallback(() => {
    setSplitPosition(50)
  }, [])

  // Only attach mouse listeners when modal is open
  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Clean up any stuck state
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isOpen, handleMouseMove, handleMouseUp])

  // Filter skills
  const { filteredSkills, featuredSkills } = useMemo(() => {
    if (!skills) return { filteredSkills: [], featuredSkills: [] }

    // Apply search filter
    let filtered = skills
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = skills.filter(
        (s) => s.name.toLowerCase().includes(query) || (s.description && s.description.toLowerCase().includes(query))
      )
    }

    // Apply category/type filter
    if (activeFilter === 'featured') {
      filtered = filtered.filter((s) => isFeaturedSkill(s))
    } else if (activeFilter === 'enabled') {
      // Use snapshot if available, otherwise fall back to current enabled state
      if (enabledFilterSnapshot) {
        filtered = filtered.filter((s) => enabledFilterSnapshot.has(s.id))
      } else {
        filtered = filtered.filter((s) => s.enabled)
      }
    } else if (activeFilter !== 'all') {
      filtered = filtered.filter((s) => getSkillCategory(s) === activeFilter)
    }

    // Get featured skills (always from full list, for the featured section)
    const featured = skills.filter((s) => isFeaturedSkill(s))

    return { filteredSkills: filtered, featuredSkills: featured }
  }, [skills, searchQuery, activeFilter, enabledFilterSnapshot])

  const enabledCount = useMemo(() => skills?.filter((s) => s.enabled).length ?? 0, [skills])
  const totalCount = skills?.length ?? 0

  // Category counts for filter pills
  const categoryCounts = useMemo(() => {
    if (!skills) return {} as Record<SkillCategory, number>
    const counts = {} as Record<SkillCategory, number>
    for (const cat of CATEGORY_ORDER) {
      counts[cat] = skills.filter((s) => getSkillCategory(s) === cat).length
    }
    return counts
  }, [skills])

  // Compute which system skills are "shadowed" by custom skills with the same name
  // A shadowed system skill cannot be enabled while its custom counterpart exists
  const shadowedSystemSkillIds = useMemo(() => {
    if (!skills) return new Set<string>()
    const customSkillNames = new Set(skills.filter((s) => !s.isSystem).map((s) => s.name))
    return new Set(skills.filter((s) => s.isSystem && customSkillNames.has(s.name)).map((s) => s.id))
  }, [skills])

  const handleFilterChange = (filter: FilterType) => {
    // When switching to "enabled" filter, snapshot the currently enabled skills
    if (filter === 'enabled' && activeFilter !== 'enabled' && skills) {
      setEnabledFilterSnapshot(new Set(skills.filter((s) => s.enabled).map((s) => s.id)))
    } else if (filter !== 'enabled') {
      // Clear snapshot when switching away from "enabled"
      setEnabledFilterSnapshot(null)
    }
    setActiveFilter(filter)
  }

  const handleToggle = async (skill: Skill, enabled: boolean) => {
    // Check if trying to enable a shadowed system skill - trigger warning glow
    if (enabled && skill.isSystem && shadowedSystemSkillIds.has(skill.id)) {
      setGlowWarningForSkillId(skill.id)
      // Clear glow after animation completes
      setTimeout(() => setGlowWarningForSkillId(null), 1200)
      return
    }

    setTogglingSkillId(skill.id)
    try {
      await toggleSkill.mutateAsync({ id: skill.id, enabled })
    } finally {
      setTogglingSkillId(null)
    }
  }

  const handleDelete = async () => {
    if (!selectedSkill) return
    // Find the next skill to select after deletion
    const currentIndex = filteredSkills.findIndex((s) => s.id === selectedSkill.id)
    const nextSkill = filteredSkills[currentIndex + 1] || filteredSkills[currentIndex - 1] || null
    await deleteSkill.mutateAsync(selectedSkill.id)
    setSelectedSkill(nextSkill)
  }

  const handleDuplicate = async (skill: Skill) => {
    if (skill.isSystem) {
      // For system skills, create a draft without calling API
      // The draft will be saved when user clicks "Save"
      setDraftSkill({
        sourceSkill: skill,
        name: skill.name, // Same name initially - user should change it
        description: skill.description,
        body: skill.body,
      })
      setSelectedSkill(null)
      setRightPanelMode('create')
    } else {
      // For custom skills, call API to duplicate
      const newSkill = await duplicateSkill.mutateAsync(skill.id)
      setSelectedSkill(newSkill)
      setRightPanelMode('edit')
    }
  }

  const handleEdit = (skill: Skill) => {
    if (skill.isSystem) {
      // System skills can only be "Duplicate and Edit"
      handleDuplicate(skill)
    } else {
      setRightPanelMode('edit')
    }
  }

  const handleCreate = () => {
    setSelectedSkill(null)
    setDraftSkill(null) // Clear any draft from duplication
    setRightPanelMode('create')
    setActiveFilter('custom') // Show custom skills when creating
  }

  const handleEditorSave = async (data: {
    name: string
    description: string
    body: string
    metadata?: Record<string, unknown>
  }) => {
    // Identify skills that need side-effect changes (but don't apply yet)
    const collidingCustomSkill = skills?.find((s) => !s.isSystem && s.name === data.name && s.id !== selectedSkill?.id)
    const shadowedSystemSkill = skills?.find((s) => s.isSystem && s.name === data.name && s.enabled)

    // First, do the main create/update operation
    // If this fails, the error bubbles up and side effects won't run
    let savedSkill: Skill | null = null
    if (rightPanelMode === 'create') {
      savedSkill = await createSkill.mutateAsync(data)
      setDraftSkill(null) // Clear draft after successful save
    } else if (rightPanelMode === 'edit' && selectedSkill) {
      savedSkill = await updateSkill.mutateAsync({ id: selectedSkill.id, input: data })
    }

    // Only after successful save, apply side effects (best-effort, don't fail the save)
    try {
      // If colliding with a custom skill, rename the old one with a unique suffix
      if (collidingCustomSkill) {
        const timestamp = Date.now().toString(36) // Short timestamp
        const baseName = collidingCustomSkill.name.slice(0, 50) // Leave room for suffix
        await updateSkill.mutateAsync({
          id: collidingCustomSkill.id,
          input: { name: `${baseName}-old-${timestamp}` },
        })
      }

      // Disable the shadowed system skill
      if (shadowedSystemSkill) {
        await toggleSkill.mutateAsync({ id: shadowedSystemSkill.id, enabled: false })
      }
    } catch {
      // Side effects failed but main save succeeded - that's okay
      console.warn('Side effects failed after skill save, continuing anyway')
    }

    // Navigate to the saved skill
    if (savedSkill) {
      setSelectedSkill(savedSkill)
      // Ensure custom filter is active so the skill is visible
      setActiveFilter('custom')
    }
    setRightPanelMode('view')
  }

  const handleEditorCancel = useCallback(() => {
    setRightPanelMode('view')
    setDraftSkill(null) // Clear any draft
  }, [])

  // Handle ESC key - close editor or modal (don't deselect skills)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (rightPanelMode !== 'view') {
          handleEditorCancel()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, rightPanelMode, handleEditorCancel])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setActiveFilter('featured')
      setSelectedSkill(null)
      setRightPanelMode('view')
      setEnabledFilterSnapshot(null)
      setDraftSkill(null)
      setGlowWarningForSkillId(null)
    }
  }, [isOpen])

  // Auto-select first skill only when there's no selection at all
  // Only in view mode - don't interrupt create/edit
  useEffect(() => {
    if (!isOpen || filteredSkills.length === 0 || rightPanelMode !== 'view') return

    // Only auto-select if there's no selection
    // Don't override existing selection (it might be a newly created skill not yet in cache)
    if (selectedSkill) return

    setSelectedSkill(filteredSkills[0])
  }, [isOpen, filteredSkills, selectedSkill, rightPanelMode])

  // Update selected skill data when skills change (e.g., after toggle)
  useEffect(() => {
    if (selectedSkill && skills) {
      const updated = skills.find((s) => s.id === selectedSkill.id)
      if (updated) {
        setSelectedSkill(updated)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when skills list or selected ID changes
  }, [skills, selectedSkill?.id])

  if (!isOpen) return null

  // Get filter pill style based on category
  const getFilterPillStyle = (isActive: boolean) => {
    if (isActive) {
      return 'bg-foreground text-canvas font-medium'
    }
    return 'bg-block-highlight/50 text-foreground-muted hover:bg-block-highlight hover:text-foreground'
  }

  const filtersRow1: { key: FilterType; label: string; count?: number; icon?: string }[] = [
    { key: 'featured', label: 'Featured', count: featuredSkills.length, icon: 'fa-star' },
    { key: 'all', label: 'All', count: totalCount },
    { key: 'enabled', label: 'Enabled', count: enabledCount },
  ]

  const filtersRow2: { key: FilterType; label: string; count?: number; icon?: string }[] = CATEGORY_ORDER.map(
    (cat) => ({
      key: cat as FilterType,
      label: CATEGORY_META[cat].label,
      count: categoryCounts[cat],
    })
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-canvas rounded-lg border border-outline shadow-2xl flex flex-col w-[90vw] h-[85vh] max-w-[1400px] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-bolt text-foreground-muted" />
              <h1 className="text-lg font-semibold text-foreground">Skills</h1>
            </div>
            <span className="text-sm text-foreground-muted/60">—</span>
            <span className="text-sm text-foreground-muted/60">Extend the agent with specialized behaviors</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="inverted"
              onClick={handleCreate}
              icon="fa-solid fa-plus"
              disabled={rightPanelMode !== 'view'}
            >
              Create
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close" className="w-10 h-10">
              <i className="fa-solid fa-xmark text-foreground-muted text-lg" />
            </Button>
          </div>
        </header>

        {/* Main content */}
        <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left panel - Skills list */}
          <div className="flex flex-col min-w-0" style={{ width: `${splitPosition}%` }}>
            {/* Search and filters */}
            <div className="px-6 py-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-md bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground placeholder:text-foreground-muted"
                />
              </div>

              {/* Filter pills - two rows */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {filtersRow1.map((filter) => {
                    const isActive = activeFilter === filter.key
                    return (
                      <button
                        key={filter.key}
                        onClick={() => handleFilterChange(filter.key)}
                        className={`
                            px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5
                            ${getFilterPillStyle(isActive)}
                          `}
                      >
                        {filter.icon && <i className={`fa-solid ${filter.icon} text-[12px]`} />}
                        {filter.label}
                        {filter.count !== undefined && (
                          <span
                            className={`tabular-nums min-w-[1.25rem] text-right ${isActive ? 'opacity-70' : 'opacity-60'}`}
                          >
                            {filter.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {filtersRow2.map((filter) => {
                    const isActive = activeFilter === filter.key
                    const category = filter.key as SkillCategory
                    return (
                      <button
                        key={filter.key}
                        onClick={() => handleFilterChange(filter.key)}
                        className={`
                            px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5
                            ${getFilterPillStyle(isActive)}
                          `}
                      >
                        <CategoryShape category={category} inverted={isActive} />
                        {filter.label}
                        {filter.count !== undefined && (
                          <span
                            className={`tabular-nums min-w-[1.25rem] text-right ${isActive ? 'opacity-70' : 'opacity-60'}`}
                          >
                            {filter.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Skills content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <i className="fa-solid fa-spinner fa-spin text-xl text-foreground-muted" />
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
                  {searchQuery ? (
                    <>
                      <i className="fa-solid fa-search text-3xl mb-3 opacity-50" />
                      <p className="text-sm">No skills match "{searchQuery}"</p>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-bolt text-3xl mb-3 opacity-50" />
                      <p className="text-sm">No skills in this category</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSkills.map((skill) => (
                    <SkillListRow
                      key={skill.id}
                      skill={skill}
                      isSelected={selectedSkill?.id === skill.id}
                      isFeatured={isFeaturedSkill(skill)}
                      isToggling={togglingSkillId === skill.id}
                      isShadowed={shadowedSystemSkillIds.has(skill.id)}
                      onSelect={() => setSelectedSkill(skill)}
                      onToggle={(enabled) => handleToggle(skill, enabled)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resizable divider */}
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDividerDoubleClick}
            className="w-1 bg-outline hover:bg-foreground/30 cursor-col-resize flex-shrink-0 transition-colors"
          />

          {/* Right panel - Detail/Edit/Create view */}
          <div className="flex flex-col bg-block-highlight/20" style={{ width: `${100 - splitPosition}%` }}>
            {rightPanelMode === 'create' ? (
              <SkillEditPanel
                skill={null}
                draftSkill={draftSkill}
                onSave={handleEditorSave}
                onCancel={handleEditorCancel}
                isSaving={createSkill.isPending}
              />
            ) : rightPanelMode === 'edit' && selectedSkill ? (
              <SkillEditPanel
                skill={selectedSkill}
                onSave={handleEditorSave}
                onCancel={handleEditorCancel}
                isSaving={updateSkill.isPending}
              />
            ) : selectedSkill ? (
              <SkillDetailPanel
                skill={selectedSkill}
                isShadowed={shadowedSystemSkillIds.has(selectedSkill.id)}
                isGlowing={glowWarningForSkillId === selectedSkill.id}
                onEdit={() => handleEdit(selectedSkill)}
                onDuplicate={() => handleDuplicate(selectedSkill)}
                onDelete={handleDelete}
                isDeleting={deleteSkill.isPending}
                isDuplicating={duplicateSkill.isPending}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-foreground-muted p-6">
                <i className="fa-solid fa-hand-pointer text-3xl mb-3 opacity-30" />
                <p className="text-sm text-center">Select a skill to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// List row component - improved with more space
interface SkillCardProps {
  skill: Skill
  isSelected: boolean
  isFeatured?: boolean
  isToggling: boolean
  isShadowed?: boolean
  onSelect: () => void
  onToggle: (enabled: boolean) => void
}

function SkillListRow({ skill, isSelected, isFeatured, isToggling, isShadowed, onSelect, onToggle }: SkillCardProps) {
  const category = getSkillCategory(skill)
  const title = getSkillTitle(skill)
  const briefDescription = getSkillBriefDescription(skill)

  return (
    <div
      onClick={onSelect}
      className={`
        flex items-start gap-3 px-4 py-4 rounded-xl cursor-pointer transition-all duration-150
        ${
          isSelected
            ? 'bg-block-highlight border border-foreground/10'
            : 'border border-transparent hover:bg-block-highlight/40 hover:border-outline/30'
        }
      `}
    >
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <CategoryShape category={category} />
          <span className={`font-medium text-foreground ${isShadowed ? 'opacity-50' : ''}`}>{title}</span>
          {isFeatured && <i className="fa-solid fa-star text-foreground-muted/40 text-[12px] flex-shrink-0" />}
          <span className="text-[11px] font-mono text-foreground-muted/70">/{skill.name}</span>
          {isShadowed && (
            <i
              className="fa-solid fa-triangle-exclamation text-amber-400 text-[12px]"
              title="Shadowed by custom skill"
            />
          )}
        </div>
        {briefDescription && (
          <p
            className={`text-sm text-foreground-muted leading-relaxed line-clamp-2 ${!skill.enabled || isShadowed ? 'opacity-50' : ''}`}
          >
            {briefDescription}
          </p>
        )}
      </div>

      {/* Toggle - subtle box with check or X, always gray background */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle(!skill.enabled)
        }}
        disabled={isToggling}
        title={isShadowed && !skill.enabled ? 'Cannot enable: shadowed by custom skill' : undefined}
        className={`
          w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer flex-shrink-0 mt-0.5
          border bg-foreground-muted/5 border-foreground-muted/20 hover:border-foreground-muted/30
          ${skill.enabled ? 'text-status-success' : 'text-foreground-muted/40'}
          ${isToggling ? 'opacity-50' : ''}
          ${isShadowed && !skill.enabled ? 'opacity-30 cursor-not-allowed' : ''}
        `}
        aria-label={skill.enabled ? 'Disable' : 'Enable'}
      >
        <i className={`fa-solid ${skill.enabled ? 'fa-check' : 'fa-xmark'} text-[12px]`} />
      </button>
    </div>
  )
}

// Detail panel component
interface SkillDetailPanelProps {
  skill: Skill
  isShadowed?: boolean
  isGlowing?: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  isDeleting: boolean
  isDuplicating: boolean
}

function SkillDetailPanel({
  skill,
  isShadowed,
  isGlowing,
  onEdit,
  onDuplicate,
  onDelete,
  isDeleting,
  isDuplicating,
}: SkillDetailPanelProps) {
  const category = getSkillCategory(skill)
  const isFeatured = isFeaturedSkill(skill)
  const title = getSkillTitle(skill)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Get markdown body without the H1 title, split into first paragraph (highlighted) and rest (muted)
  const bodyWithoutH1 = skill.body?.replace(/^#\s+.+\n*/, '') || ''

  // Extract first paragraph and the rest
  const firstParaMatch = bodyWithoutH1.match(/^([^\n]+(?:\n(?!\n)[^\n]+)*)/)
  const firstParagraph = firstParaMatch?.[1]?.trim() || ''
  const restOfBody = firstParagraph ? bodyWithoutH1.slice(firstParaMatch![0].length).replace(/^\n+/, '') : bodyWithoutH1

  // Reset delete confirmation when skill changes
  useEffect(() => {
    setConfirmDelete(false)
  }, [skill.id])

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete()
    } else {
      setConfirmDelete(true)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Shadowed warning banner - sticks to top */}
      {isShadowed && (
        <div className="px-4 py-2.5 bg-amber-500/10 flex items-center gap-2 text-amber-400 text-sm">
          <i className={`fa-solid fa-triangle-exclamation ${isGlowing ? 'animate-warning-glow' : ''}`} />
          <span className={isGlowing ? 'animate-warning-glow' : ''}>
            This skill is shadowed by a custom skill with the same name
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-5 border-b border-outline">
        <div className="flex items-center gap-2">
          <CategoryShape category={category} size="md" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {isFeatured && <i className="fa-solid fa-star text-foreground-muted/40 text-[12px]" />}
          <span className="text-xs font-mono text-foreground-muted/70">/{skill.name}</span>
        </div>
      </div>

      {/* Content - First paragraph highlighted, rest muted */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {firstParagraph && <p className="text-sm text-foreground leading-relaxed mb-4">{firstParagraph}</p>}
        {restOfBody && (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground-muted">
            {restOfBody}
          </pre>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 border-t border-outline">
        {skill.isSystem ? (
          <Button variant="secondary" onClick={onEdit} icon="fa-solid fa-copy" className="w-full">
            Duplicate and Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onEdit} icon="fa-solid fa-pen" className="flex-1 basis-0">
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={onDuplicate}
              disabled={isDuplicating}
              isLoading={isDuplicating}
              icon={isDuplicating ? undefined : 'fa-solid fa-copy'}
              className="flex-1 basis-0"
            >
              Duplicate
            </Button>
            <Button
              variant={confirmDelete ? 'danger' : 'secondary'}
              onClick={handleDeleteClick}
              disabled={isDeleting}
              isLoading={isDeleting}
              icon={isDeleting ? undefined : 'fa-solid fa-trash'}
              className="flex-1 basis-0"
            >
              {isDeleting ? 'Deleting...' : confirmDelete ? 'Confirm?' : 'Delete'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Edit/Create panel component (inline in right panel)
interface SkillEditPanelProps {
  skill: Skill | null // null = create mode
  draftSkill?: DraftSkill | null // Pre-filled data from duplicating a system skill
  onSave: (data: {
    name: string
    description: string
    body: string
    metadata?: Record<string, unknown>
  }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}

function SkillEditPanel({ skill, draftSkill, onSave, onCancel, isSaving }: SkillEditPanelProps) {
  const isEditing = !!skill
  const isDuplicatingSystem = !skill && !!draftSkill
  const [mode, setMode] = useState<'form' | 'import'>('form')

  // Form state - use draftSkill values if available (duplicating system skill), otherwise skill values
  const [name, setName] = useState(draftSkill?.name ?? skill?.name ?? '')
  const [description, setDescription] = useState(draftSkill?.description ?? skill?.description ?? '')
  const [body, setBody] = useState(draftSkill?.body ?? skill?.body ?? '')
  // Imported metadata (fields other than name/description from SKILL.md import)
  const [importedMetadata, setImportedMetadata] = useState<Record<string, unknown> | null>(null)

  // Import state
  const [importContent, setImportContent] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  // Reset form when skill or draftSkill changes
  useEffect(() => {
    setName(draftSkill?.name ?? skill?.name ?? '')
    setDescription(draftSkill?.description ?? skill?.description ?? '')
    setBody(draftSkill?.body ?? skill?.body ?? '')
    setImportedMetadata(null) // Clear imported metadata on skill change
    setMode('form')
    setImportContent('')
    setImportError(null)
  }, [skill, draftSkill])

  const validateName = (value: string) => {
    if (!value.trim()) return 'Name is required'
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
      return 'Must be lowercase with hyphens (e.g., my-skill)'
    }
    if (value.length > 64) return 'Must be 64 characters or less'
    return undefined
  }

  const validateDescription = (value: string) => {
    if (!value.trim()) return 'Description is required'
    if (value.length > 1024) return 'Must be 1024 characters or less'
    return undefined
  }

  const validateBody = (value: string) => {
    if (!value.trim()) return 'Instructions are required'
    return undefined
  }

  // Run validation when all fields have content (linter mode)
  const allFieldsHaveContent = name.trim() !== '' && description.trim() !== '' && body.trim() !== ''
  const linterErrors = useMemo(() => {
    if (!allFieldsHaveContent) return null
    const errors: string[] = []
    const nameError = validateName(name)
    const descError = validateDescription(description)
    const bodyError = validateBody(body)
    if (nameError) errors.push(nameError)
    if (descError) errors.push(descError)
    if (bodyError) errors.push(bodyError)
    return errors.length > 0 ? errors : null
  }, [allFieldsHaveContent, name, description, body])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Final validation check
    if (linterErrors && linterErrors.length > 0) return
    if (!allFieldsHaveContent) return
    // Merge imported metadata with existing skill metadata (if editing)
    const metadata = {
      ...(skill?.metadata ?? {}),
      ...(importedMetadata ?? {}),
    }
    // Only pass metadata if there's something other than what's in name/description
    const hasExtraMetadata = Object.keys(metadata).some((k) => k !== 'name' && k !== 'description')
    await onSave({ name, description, body, metadata: hasExtraMetadata ? metadata : undefined })
  }

  const handleImportParse = useCallback(() => {
    if (!importContent.trim()) {
      setImportError('Paste SKILL.md content above')
      return
    }

    const result = parseSkillMd(importContent)
    if (result.success) {
      // Extract name and description for form fields
      setName(result.skill.metadata.name)
      setDescription(result.skill.metadata.description ?? '')
      setBody(result.skill.body)
      // Preserve all other metadata (license, featured, compatibility, allowed-tools, etc.)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { name: _n, description: _d, ...restMetadata } = result.skill.metadata
      if (Object.keys(restMetadata).length > 0) {
        setImportedMetadata(restMetadata as Record<string, unknown>)
      }
      setMode('form')
      setImportContent('')
      setImportError(null)
    } else {
      setImportError(result.error)
    }
  }, [importContent])

  // Get header text based on mode
  const getHeaderTitle = () => {
    if (isEditing) return 'Edit Skill'
    if (isDuplicatingSystem) return 'Duplicate Skill'
    return 'Create Skill'
  }

  const getHeaderSubtitle = () => {
    if (isEditing) return 'Modify the skill configuration'
    if (isDuplicatingSystem) return `Creating a copy of "${draftSkill?.sourceSkill.name}"`
    return 'Create a new custom skill'
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-outline">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{getHeaderTitle()}</h2>
          <p className="text-sm text-foreground-muted mt-0.5">{getHeaderSubtitle()}</p>
        </div>

        {/* Mode tabs (only for create, not for duplicating) */}
        {!isEditing && !isDuplicatingSystem && (
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setMode('form')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                mode === 'form'
                  ? 'bg-foreground text-canvas font-medium'
                  : 'text-foreground-muted hover:text-foreground hover:bg-block-highlight'
              }`}
            >
              Form
            </button>
            <button
              onClick={() => setMode('import')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                mode === 'import'
                  ? 'bg-foreground text-canvas font-medium'
                  : 'text-foreground-muted hover:text-foreground hover:bg-block-highlight'
              }`}
            >
              Import SKILL.md
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {mode === 'form' ? (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Fixed height fields */}
          <div className="px-6 pt-5 space-y-4 flex-shrink-0">
            {/* Name field */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Skill Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }}
                className="w-full px-3 py-2 text-sm rounded-md bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground font-mono"
                placeholder="my-skill-name"
              />
              <p className="mt-1 text-xs text-foreground-muted">
                Invoke with <span className="font-mono text-foreground-muted/70">/{name || 'skill-name'}</span>
              </p>
            </div>

            {/* Description field - 2 lines */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-md bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground resize-none"
                placeholder="A brief description of what this skill does"
              />
            </div>
          </div>

          {/* Instructions field - takes remaining space */}
          <div className="flex-1 flex flex-col min-h-0 px-6 py-4">
            <label className="block text-sm font-medium text-foreground mb-1.5 flex-shrink-0">Instructions</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="flex-1 w-full px-3 py-2 text-sm rounded-md bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground font-mono resize-none leading-relaxed"
              placeholder="# My Skill

Instructions for the AI when this skill is activated..."
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-outline flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Linter warning */}
              {linterErrors && (
                <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center gap-2 text-amber-400 text-sm">
                  <i className="fa-solid fa-triangle-exclamation" />
                  <span>{linterErrors[0]}</span>
                </div>
              )}
              {!linterErrors && <div className="flex-1" />}
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="inverted"
                disabled={isSaving || !allFieldsHaveContent || linterErrors !== null}
                isLoading={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        /* Import mode */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-sm text-foreground-muted mb-3">Paste the contents of a SKILL.md file to import it.</p>
            <textarea
              value={importContent}
              onChange={(e) => {
                setImportContent(e.target.value)
                setImportError(null)
              }}
              className="w-full min-h-[300px] px-3 py-2 text-sm rounded-md bg-block-highlight/50 border border-outline focus:border-foreground/30 focus:outline-none text-foreground font-mono resize-none leading-relaxed"
              placeholder={`---
name: my-skill
description: What this skill does
---

# My Skill

Instructions for the AI...`}
            />
            {importError && (
              <div className="mt-3 px-3 py-2 bg-status-error/10 border border-status-error/20 text-sm text-status-error">
                <i className="fa-solid fa-xmark mr-2" />
                {importError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-outline flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="inverted"
              onClick={handleImportParse}
              disabled={!importContent.trim()}
              icon="fa-solid fa-file-import"
            >
              Parse & Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
