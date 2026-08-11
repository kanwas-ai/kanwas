# PM Operating System Infographic Notes

## Final Title & Subtitle

**Title:** Where PMs Figure Out What to Build

**Subtitle:** Claude Code showed what agentic PM work could look like. Kanwas makes it usable in a browser.

## Layout Rationale

### Structure

- **7 numbered sections** following the brief's recommended content structure
- Each section has: number badge, title, one-line description, visual content
- Flows top-to-bottom like the inspiration but adapted for Kanwas's positioning

### Visual Hierarchy

1. **Brand + Tag** (top row) - establishes credibility without overstatement
2. **Title** (hero size) - uses the existing hero line from the website
3. **Proof chips** (4 chips) - quick scanning of key differentiators
4. **Numbered sections** - progressive depth from shift → context → commands → workflows → workspace → day → team
5. **CTA** - gradient accent box for visual pop
6. **Footer** - soft close with engagement ask

### Dark Blueprint Aesthetic

- Background: `#0a0a0f` with subtle 40px grid overlay
- Cards: `#14141e` with `rgba(255,255,255,0.06)` borders
- Accent: purple-to-blue gradient (`#8b5cf6` → `#3b82f6`)
- Command chips: monospace font (JetBrains Mono) with purple `/` prefix
- Timeline: gradient track with colored dots

### Key Design Decisions

1. **Command chips are prominent** - used JetBrains Mono with `/` in accent color to give them a "runnable" feel

2. **Workflow layer uses a grid layout** - shows input → command → output in a scannable table format. More concrete than just listing commands.

3. **Timeline for PM day** - horizontal flow with gradient track, making the "day in the life" feel like a natural progression rather than a list

4. **Context flow visualization** - scattered inputs on the left, arrow, unified output on the right. Shows the transformation clearly.

5. **No fake metrics** - avoided "70+ commands" or "5x faster" claims. Let the structure and examples speak for themselves.

6. **Team badges are simple** - emoji icons + labels. Didn't overcomplicate since the point is just "shared context"

### Dimensions

- **1080px wide** - standard for LinkedIn
- **~1450px tall** - fits 4:5 ratio for mobile feed optimization
- Self-contained HTML, no external dependencies except Google Fonts

## What's Still Rough / Worth Iterating

1. **Command selection** - currently showing 11 commands. Could refine based on which are actually implemented or most compelling.

2. **Workflow examples** - four examples shown. Could add more or swap for higher-impact use cases if feedback suggests.

3. **Team section** - currently uses emoji icons. Could be replaced with custom icons for a more polished look.

4. **CTA copy** - using "Join the beta" and "Comment 'map'" - could test other hooks.

5. **Typography scale** - optimized for screenshot clarity but may want to test readability on mobile LinkedIn feed.

6. **Proof chips** - currently 4 chips. The brief suggested these specific ones, but could swap based on what resonates most.

7. **Color scheme** - purple/blue gradient works well but could explore warmer accent (amber/rose) if brand evolves.

## Source Files Referenced

- `/website/src/content/main-page/content.tsx` - Hero copy, features, and full Kanwas Thesis article
- `/website/src/components/main-page/MainPageHero.tsx` - Current hero implementation

## Key Messaging Preserved from Source

- "Where PMs figure out what to build" (exact hero line)
- "Stop re-explaining your product to AI" (from hero body)
- "Context compounds" (from features intro)
- "AI teammate that has context" (from feature cards)
- ".md files you own. No vendor lock." (from feature cards)
- "Canvas as a map of your context" (from feature cards)
- The core thesis: superhuman reasoning + specific context = taste-like output
