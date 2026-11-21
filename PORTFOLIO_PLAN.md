# Two Layer Tile World Portfolio

**Status:** Implemented (first build). See section 13 for where the build differs from this plan.
**Document:** `C:\dev\portfolio\PORTFOLIO_PLAN.md`

## 1. Abstract

Build the portfolio as a **flat, side-view, editable pixel world**, following the visual language of your references.

The scenery consists of square grid cells. Each cell supports exactly two block slots: **background and foreground**. Visitors can place blocks, break the existing terrain, and reshape the world throughout the page. Their changes remain local to their browser.

Your introduction, projects, skills, résumé, and contact information appear in protected, readable panels above the world.

## 2. Goals and Non Goals

**Launch goals**

- Make the tile world the visual foundation of the website.
- Support placement and breaking across the page’s exposed scenery.
- Enforce exactly two depth slots per cell.
- Preserve access to professional content during building.
- Support mouse, touch, and keyboard interaction.
- Provide content editing through Sanity and deployment through Vercel.

**Deferred**

- Multiplayer or shared visitor modifications.
- Character movement, gravity, survival mechanics, and crafting.
- An owner-facing terrain editor.
- Background music and additional biome packs.

## 3. Visual Design and Page Structure

Use **front-facing square pixel tiles**, crisp edges, flat sprites, and layered landscape silhouettes.

The references guide the treatment of terrain, vegetation, characters, and atmosphere. Create original artwork rather than reproducing their characters, logos, or illustrations.

**Visual rules**

- Every editable block occupies one square cell.
- Background blocks use darker, subdued versions of their textures.
- Foreground blocks use full-strength textures.
- An opaque foreground block conceals the background block beneath it.
- Distant scenery can provide atmosphere behind both editable layers.
- Editable layers remain aligned; any parallax applies only to distant scenery.
- Your avatar is a small 2D sprite within the scene.

**Page progression**

| Section | Portfolio content | Surrounding world |
|---|---|---|
| Introduction | Name, IT student headline, introduction, résumé and project links | Open sky, grass, trees, avatar |
| Projects | Featured work and case-study links | Stone shelves and constructed terrain |
| Skills | Web, mobile, backend, and tools | Workshop-like terrain and materials |
| About and exploration | Background, learning, game development and applied AI interests | Vegetation and small environmental discoveries |
| Contact | Email and professional profile links | A simple clearing or home base |

Keep normal vertical scrolling and conventional navigation. Leave exposed terrain bands and clearings between panels so building remains usable on mobile.

Project screenshots retain the pixel-preview reveal interaction. Titles and descriptions always remain readable.

## 4. Proposed Architecture

Use **Next.js App Router, TypeScript, CSS Modules, native Canvas2D, and Sanity**.

| Component | Responsibility |
|---|---|
| Semantic HTML | Content panels, links, navigation, inventory, dialogs, and accessibility |
| Canvas2D renderer | Tile scenery, selection outline, placement preview, and small effects |
| World state module | Placement, breaking, undo, reset, and effective cell state |
| Browser storage | Visitor modifications and preferences |
| Sanity | Professional content and portfolio media |
| Vercel | Builds, previews, and production hosting |

Use one viewport-sized canvas beneath the HTML content. Draw only the visible portions of the world rather than creating a bitmap as tall as the whole document.

Redraw when scrolling, resizing, editing, or changing selection. A permanent game loop is unnecessary.

Disable image smoothing and use integer scaling for crisp tile artwork. [Canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [pixel-art rendering](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled).

## 5. Interaction Lifecycle

### Placement and breaking

| Current cell | Place selected material | Break |
|---|---|---|
| Empty | Fill background | No change |
| Background occupied | Fill foreground | Remove background |
| Both occupied | Reject placement and indicate “Full” | Remove foreground, revealing background |

There is no third placement slot. Foreground blocks cannot exist without a background block.

Placement is free within editable cells; it does not require support from adjacent blocks.

### Controls

- Start in normal browsing mode.
- **Build mode** reveals the grid highlight, material palette, and editing tools.
- Select **Place** or **Break**, then click or tap a cell.
- Show a ghost preview identifying the cell and the depth slot that will change.
- Provide **Undo**, **Reset world**, **Sound**, and **Exit build mode** controls.
- Undo restores the previous cell state for actions in the current session.
- Reset restores the published terrain after confirmation.
- Audio starts muted.

Keyboard users focus the world, move a selection with arrow keys, apply the selected tool with Enter, and exit with Escape. Announce coordinates, cell contents, and action results.

On touch devices, scrolling gestures must not place or break blocks. Commit an action only after a tap; cancel it when the gesture becomes a scroll.

## 6. Data Contracts and Interfaces

The central world contract is:

```ts
type Cell = {
  background: BlockId | null;
  foreground: BlockId | null;
};

type CellOverride = {
  sectionId: string;
  x: number;
  y: number;
  cell: Cell;
};
```

Separate:

- **Published world:** authored terrain stored in versioned project data.
- **Visitor overrides:** complete replacement states for modified cells.
- **Protected regions:** current screen areas occupied by content and controls.
- **Preferences:** selected material, sound, and reduced-motion settings.

Persist a schema version and world version alongside overrides.

The CMS contains profile, project, skill-group, and exploration records. Project case studies use `/projects/[slug]`; unknown slugs return a 404.

No public world-editing API or visitor database is required.

## 7. Persistence and Responsive Behavior

**Preserving mined terrain**

An explicitly empty override must remain saved. Otherwise, an original block that a visitor breaks would reappear after reloading.

Calculate each effective cell as:

`Saved override, when present → otherwise published cell`

**Stable coordinates**

- Give each page section a permanent identifier.
- Anchor its grid horizontally at the section center and vertically at its top.
- Use integer cell coordinates rather than screen pixels or percentages.
- Default to **16 × 16 source textures displayed as 48 × 48 CSS-pixel cells**.
- On narrower screens, crop or reveal outer columns without renumbering saved cells.
- Retain modifications that temporarily fall outside the visible section.
- Use the same coordinate transformation for rendering and pointer selection.
- Clip grids to their sections so one action cannot affect overlapping sections.

Recalculate protected regions after layout changes, image loading, and resizing. Existing terrain can remain behind a panel, but cells intersecting protected regions cannot be edited.

An incompatible authored-world redesign increments the world version and resets the visitor’s terrain with a short notice. Ordinary content edits preserve it.

## 8. Content Protection and Privacy

Your selected behavior is:

- Visitors may break **all exposed scenery**, including originally authored blocks.
- Those changes affect only their browser.
- Content panels, navigation, project links, and controls remain protected above both block layers.
- Transparent layout wrappers allow interaction with exposed scenery.
- Entering Build mode does not disable navigation or contact links.

Keep professional content in HTML, outside the canvas, so it retains browser semantics and accessibility. [Canvas accessibility guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas).

Validate saved materials, coordinates, versions, and cell invariants before restoring them. If storage is unavailable, allow temporary editing for that visit.

Keep CMS credentials and deployment-hook URLs out of client code and Git. Upload only media intended for public sharing.

## 9. Operational Readiness and Tests

**World behavior**

- First placement fills background; second fills foreground.
- Third placement is rejected without changing either block.
- Breaking reveals background before emptying the cell.
- Empty-cell breaking safely does nothing.
- Original terrain stays mined after reload.
- Different materials survive placement, breaking, undo, and reload correctly.
- Reset restores the authored world.
- Invalid storage falls back safely.

**Layout and controls**

- The selected cell stays aligned during scrolling and resizing.
- Resizing away and back preserves hidden modifications.
- Content-height changes do not move edits into another section.
- Panel, navigation, and toolbar interactions never edit terrain.
- Mobile scrolling does not trigger editing.
- Mouse, touch, and keyboard produce equivalent changes.

**Portfolio quality**

- Essential content works without the world renderer.
- Reduced motion disables unnecessary scenery movement.
- Project reveals work separately from case-study navigation.
- Check focus visibility, contrast, image descriptions, résumé links, and metadata.
- Test at 360px, 768px, and 1920px widths and on a real touch device.
- Profile scrolling and editing before adding rendering dependencies.

Use Vitest for world-state rules and Playwright for browser flows. Run linting, type checking, tests, and a production build before release.

## 10. Alternatives Considered

| Alternative | Decision |
|---|---|
| Raised or isometric voxel scenery | Replaced by flat side-view tiles |
| Two isolated playground areas | Replaced by editable scenery throughout the page |
| One HTML element per tile | Prefer Canvas2D for the world and HTML for content |
| Full game engine | Defer until features require physics or a larger game system |
| World objects as the only content navigation | Use readable embedded panels, as selected |

## 11. Required Content and Asset Kit

**Original artwork**

| Asset | Initial requirement |
|---|---|
| Tile atlas | Six placeable materials: grass, dirt, stone, wood, leaves, and sand |
| Depth treatment | Subdued background rendering for each material |
| Scenery | Sky and distant forest/hill silhouettes |
| Decorations | Small plants, flowers, vines, and scene details |
| Avatar | Original side-view 2D sprite; optional idle frames |
| Interaction graphics | Grid selection, placement ghost, brief breaking effect |
| Interface | Material icons, tool states, inventory frames |
| Typography | Licensed pixel display font and readable body font |
| Audio | Optional selection, placement, breaking, and interface sounds |
| Project media | Real screenshots and derived pixel previews |
| Sharing | Favicon and social preview image |

Decorations are artwork, not additional placeable block-depth slots. Keep asset sources and licenses recorded.

**Professional content**

- Display name, introduction, biography, résumé, and contact links.
- Target three featured projects with your contribution, decisions, screenshots, technologies, and results.
- Accurate skill groups.
- Real game-development or applied-AI experiments, where available.

**Services and setup**

- GitHub repository, supported Node.js environment, and lockfile.
- Vercel project.
- Sanity project and authenticated hosted Studio.
- Private publishing webhook.
- Optional custom domain.

Use original art and licensed audio rather than extracted game files. [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines).

## 12. Delivery Sequence and Defaults

| Milestone | Deliverable | Exit condition |
|---|---|---|
| Revised design | Flat side-view layout showing panels and the two-slot model | Visual direction matches the references |
| World prototype | One section with placement, breaking, protection, and reset | Core cell rules pass |
| Persistence and responsiveness | Local overrides, stable section coordinates, touch and keyboard controls | Reload and resize scenarios pass |
| Complete portfolio | All sections, original artwork, case studies, and Sanity editing | Professional content is complete and usable |
| Deployment | Vercel hosting, publishing integration, and operating instructions | Browser checks, publishing, and rollback verified |

Retain Sanity for **content editing only**. Publishing, updating, unpublishing, or deleting content triggers a Vercel rebuild; drafts stay unpublished. Failed builds retain the current deployment. [Sanity webhooks](https://www.sanity.io/docs/content-lake/webhooks), [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks).

Defaults remain: hiring-manager audience, local visitor changes, original artwork, free tiers where eligible, normal vertical scrolling, muted sound, and optional reduced motion. The website’s defining interaction is now the **whole-page, two-slot tile world**.

## 13. Implementation Notes

Where the first build differs from the plan above, and why.

| Plan | Build | Reason |
|---|---|---|
| Anchor each grid vertically at the section top | Anchor at the top of the section's ground band; rows above the ground are negative | Authored terrain sits at the bottom of each section. Anchoring there keeps terrain and saved edits in place when the panel above changes height (fonts, text edits, narrow screens). Sections still clip their own grids. |
| 48 × 48 CSS-pixel cells | 16 texels × an integer device-pixel scale (`round(3 × devicePixelRatio)`), exposed as `--cell` | Keeps pixel art crisp at 125% and 150% display scaling, where a fixed 48 px cell would need fractional texels. Cells are exactly 48 px at 100%, 200%, and 300%. |
| Six placeable materials | Six in the palette, plus two authored-only blocks (log, stone bricks) for trees and constructed terrain | Trunks and shelves read better with their own textures. Saved data accepts all eight. |
| Sound, Undo, Reset, Exit in the toolbar | Undo and Exit stay on the bar; Sound, Motion, and Reset world sit under **More** | The toolbar fits in two rows at 360 px. |
| Sanity client | Build-time GROQ over Sanity's HTTP API (no SDK); Studio lives in `studio/` | Fewer dependencies; drafts are never fetched. A failing Sanity request fails the build so the current deployment stays live. |
| Licensed audio | Sounds synthesised with the Web Audio API | Nothing to license; still muted by default. |

Content in `src/content/fallback.ts` and the illustrations in `public/projects/` are placeholders to replace before release.

### Later changes (November 2026)

| Plan | Build now | Reason |
|---|---|---|
| Two slots per cell (background, foreground), foreground needs background | Three independent layers: back, middle, front; text sits between middle and front | Visitors can decorate the background, build cards behind text, or cover text from the front. |
| Place/Break tool buttons | Left click breaks the closest block, right click places in the chosen layer; touch uses a Place/Break switch plus Scroll/Paint | Faster building; mirrors familiar block-game controls. |
| Panels behind the hero text and navigation | No backgrounds there; text has a soft halo instead | Visitors can build their own card or bar. Other sections keep biome-coloured panels. |
| One editable scenery style | A biome per section: overworld, cave, crystal cavern, inferno, void | Each section feels like a different place to explore. |
| No creatures | Interactive creatures per section, plus a mini version of the owner in the cottage; they can be picked up, thrown and carried between sections, and go home on their own | The owner asked for life the visitor can play with. All designs are original (pig-folk and shadow walkers instead of any game's characters). |
| Day/night not planned | A Night toggle turns the sky in ten 50 ms steps (half a second) | Requested; changes frame by frame like a fast-forwarded day. |
| Six placeable materials | About 75 blocks in seven groups, all painted in code | More variety for building. Third-party Minecraft texture packs were not used: their art is Minecraft's, and their terms don't allow publishing them on a website. |
| Edits only in each visitor's browser | The owner's build is saved to `src/content/world-build.json` during development and ships with the site; visitors edit on top of it | Building on the live page becomes the way to design the page. |
| Email link only | An on-page contact form, sent through Resend, with the email address as a fallback | Visitors can write without leaving the page. |
| Ambient motion off under reduced motion | Small ambient animations play by default; a header pause button stops them and is remembered | The owner's system reports reduced motion, so the animations were never visible; the pause button meets WCAG 2.2.2. |
| Hard edges between sections | Mixed-rock bands and blended darkness where sections meet | Sections read as one continuous world. |
| Plain case study pages | Each case study stands in its own buildable world, coloured after the project's screenshots | Case studies feel like part of the same world, and each project's identity shows. |
| About: one panel with a bio and three cards inside | Three separate tablets, no bio paragraph, more space between them and above the bridge | Easier to scan; nothing reads as a box inside a box. |
| Sounds synthesised live with oscillators | Sound effects designed offline in layers (transient, FM or voice body, reverb tail), mastered, and shipped as Opus with WAV fallbacks | They sound finished rather than like test beeps; still muted by default and downloaded only when turned on. |
| Creature sounds as loud as the block sounds | Creature sounds redesigned softer and darker with several takes each; the ones they make on their own play at half volume, rarely, at most one every 1.5 s | The first designs were too loud and busy, especially the fairies' chimes and the shades' warps. |
