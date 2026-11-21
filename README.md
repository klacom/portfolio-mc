# Tile World Portfolio

Klarenz Cobie Manrique's portfolio, set inside a side-view pixel world. Each page section is its own biome: an overworld hero, a cave for projects, a crystal cavern for skills, an inferno for the about section, and the void for contact. Every cell has three layers (back, middle and front), and the page text sits between the middle and front layers, so visitors can build behind it, around it, or over it. Your own build is saved in the repository and ships with the site; visitors' edits stay in their own browser.

The original design is in [PORTFOLIO_PLAN.md](PORTFOLIO_PLAN.md); section 13 lists how the build has since changed.

## Before you publish

- Content lives in [src/content/fallback.ts](src/content/fallback.ts), written from the résumé. Check the wording, especially the "open to opportunities" line and the project summaries.
- The résumé download is `public/resume/Klarenz-Cobie-Manrique-Resume.pdf` (its photo was downscaled to keep it small). The page leaves the phone number out, but the PDF includes it.
- Project screenshots are in `public/projects/`. EcoPin has a light and a dark screenshot; the dark one shows when the site is switched to night.
- The contact form works locally once `RESEND_API_KEY` is in `.env.local`. The live site needs the same key in Vercel's environment variables (see [Contact form](#contact-form)); until then it asks visitors to email you directly.

## Your build ships with the site

While `npm run dev` is running, everything you build in build mode is also saved to [src/content/world-build.json](src/content/world-build.json), a moment after each edit (the toolbar shows **Saved to project**). Commit that file and push to `main`: the next deploy shows your build to every visitor. Visitors' own edits sit on top of it in their browser, and their **Reset world** brings back your build, not a blank world.

- Builds you made earlier in a browser are sent to the file the first time you open the dev site in that browser.
- **Reset world** in development also empties the file. Undo it with Git if that was a mistake.
- The deployed site never writes files; the save route only works under `npm run dev`.

## Run it

```powershell
npm install
npm run dev
```

Open http://localhost:3000 and press **Build** in the top bar.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | World rules, persistence, lighting and creature physics unit tests (Vitest) |
| `npm run test:e2e` | Browser flows on desktop and mobile (Playwright; run `npx playwright install chromium` once) |
| `npm run check` | Lint, type check, unit tests, and production build: run before every release |

## Creatures

Every section has its own: sheep and pigs in the overworld, bats and green slimes in the cave, glowing fairies in the crystal cavern (each lights its surroundings in its own colour), hoglings in the inferno that stop to chat, and tall shades in the void that drift and blink from spot to spot. A mini version of the owner lives in the cottage: bouncy by day, asleep in bed at night (the cottage is at the hero's right edge, so it shows on wide screens; on narrow ones he wanders the meadow).

- **Click or tap** a creature and it says something. **Hold or drag** to pick it up; flick to throw. Carry it to the top or bottom of the screen and the page scrolls, so it can be dropped in another section, where it looks around puzzled.
- They jump one-block steps, avoid drops and liquids, float in water, leap out of lava smouldering, and can't be hurt. Anything that falls out of the world, or has been away from home for about two minutes, pops back home.
- Speech bubbles use a 3×5 pixel font drawn at texel scale. Now and then a creature lets slip a secret about the owner (the mini version most often).
- When a visitor sends a message through the contact form, the creatures on screen shout them out by the first name they typed. The name is kept in memory only and forgotten on reload; the site never looks up who a visitor is.
- Fairies fly in front of everything, front-layer blocks included.
- Sounds play only when **Sound** is on (build mode, **More**). Creature sounds come from where the creature is: quieter toward the screen's edges, panned left or right, and silent once it's well out of view. See [Sound effects](#sound-effects).
- All creatures are original designs drawn in code. The hoglings and shades are this site's own takes on pig-folk and shadow walkers, not copies of any game's characters.
- Pausing animation freezes them, apart from finishing a fall. They aren't interactive in build mode, so clicks there always build.

## Sound effects

Every sound (placing and breaking blocks, the toolbar click, each creature's voice, splashes, sizzles, landings) is designed by [tools/sounds/make_sounds.py](tools/sounds/make_sounds.py) and saved to `public/sounds`. Each is built in three layers: a short noise or click transient for the attack; a body of FM tones with non-integer ratios, detuned voices, filtered noise, or (for creatures) a small vowel synthesiser; and a reverb tail sized to where the sound lives. Each is then mastered with Spotify's pedalboard (compression, light saturation, a roll-off above 12-15 kHz, a -1 dBFS peak). Every sound has two to four takes, played in turn, and every play drifts slightly in pitch, so repeats don't sound identical.

- **Creature sounds are kept in the background.** They're softer and darker than the block sounds (no bright highs, small dry rooms, short tails) and sit 9-13 dB under them. Sounds a creature makes on its own (chatting, hopping, a shade blinking away) play at half that, only now and then, and never more than one every 1.5 seconds. Clicking or picking up a creature gets a clear reply.
- Fairies hum soft glass-harp notes on a pentatonic scale. Shades murmur through closed lips when they talk, and their teleport is a short, dark puff of air. Hoglings chat in low grunts and only squeal when picked up.

- The site loads the small Opus copies (`.ogg`, about 440 KB in all) where the browser plays Opus, and the 44.1 kHz, 16-bit WAV masters elsewhere. Nothing downloads until **Sound** is turned on.
- The script also writes [src/world/sound-manifest.json](src/world/sound-manifest.json): which files belong to each sound, and a gain that evens out how loud they feel. Playback adds a limiter so many sounds at once never clip.
- To change a sound, edit its function in the script and run it again (seeds are fixed, so unchanged sounds come out identical):

  ```powershell
  python -m pip install numpy scipy pedalboard
  python tools/sounds/make_sounds.py
  ```

  It needs `ffmpeg` on the PATH for the Opus copies.

## Case studies

Each case study page is a world of its own, coloured after the project's screenshots: a city park for EcoPin, mossy asteroids in a nebula for Plooy, a purple grove with amber lights for Tanggolin. Visitors can build there too, and your builds there are saved to `world-build.json` like the home page's.

## How the world works

| Piece | Where |
|---|---|
| Blocks (about 75), layers and which blocks emit light | [src/world/blocks.ts](src/world/blocks.ts) |
| Three-layer cell rules (place, break) | [src/world/cell.ts](src/world/cell.ts) |
| The saved build, visitor edits, undo, reset, storage validation | [src/world/state.ts](src/world/state.ts) |
| Reading and writing the saved build | [src/content/build.ts](src/content/build.ts), [src/app/api/world-build/route.ts](src/app/api/world-build/route.ts) |
| The five biomes, their builds, decorations, and the mixed-rock seams between them | [src/world/regions.ts](src/world/regions.ts) |
| Per-cell light: sunlight, torches, lava, crystals | [src/world/lighting.ts](src/world/lighting.ts) |
| Textures painted in code, decorations, animation frames (lava, water, flames, swaying plants) | [src/world/textures.ts](src/world/textures.ts) |
| Day and night clock | [src/world/sky.ts](src/world/sky.ts) |
| Renderer: chunks, lighting bake, animated blocks, glints, wind, particles, glows | [src/world/renderer.ts](src/world/renderer.ts) |
| Creatures: sprites, physics, behaviour, speech bubbles | [src/world/creatures.ts](src/world/creatures.ts) |
| Mouse, touch and keyboard input | [src/world/WorldCanvas.tsx](src/world/WorldCanvas.tsx) |
| Sound design (offline) and playback | [tools/sounds/make_sounds.py](tools/sounds/make_sounds.py), [src/world/sound.ts](src/world/sound.ts) |

- **Place (right click, tap, Enter):** puts the selected block in the chosen layer, unless that layer is already taken.
- **Break (left click, hold a finger, Delete):** removes the closest block: front, then middle, then back.
- **Layers:** back blocks are dimmer and hazier; middle blocks sit behind the text; front blocks cover the text and cast a shadow. Middle and front blocks stop light; back walls don't.
- **Coordinates:** each section's grid starts at its ground band's top edge and horizontal centre. Underground ceilings hang from the section's top row, so they follow the layout.
- **Saving:** a cell is the visitor's edit if there is one, otherwise your saved build, otherwise the generated terrain. Visitor edits go to `localStorage` as complete three-layer cell states, so mined terrain stays mined. Saved data is validated before it is restored.
- **Seams:** where two sections meet, the last rows of one and the first rows of the next mix in each other's rock, and the darkness colour blends, so there is no straight line between biomes.
- **Redesigning the terrain:** an incompatible change to `regions.ts` must bump `WORLD_VERSION`; visitors' old edits are then cleared with a short notice.

Controls in build mode: left click breaks, right click places, and holding either button paints across cells. `B`, `M`, `F` choose the layer, `1`–`9` the hotbar slot, `E` opens all blocks, `Ctrl+Z` undoes, `Esc` exits. On touch screens, tap places (or breaks, with the Break tool), holding a finger breaks, and **Paint** lets a finger drag across cells instead of scrolling. Keyboard users can Tab to the world and use the arrow keys, Enter and Delete.

### Performance

The world is drawn at pixel-art resolution (one canvas pixel per texel) and the browser scales it up, so a 1440×900 screen fills a 480×300 canvas and a phone about 136×277. Terrain is cached in 16×16-cell chunks with lighting baked in; a chunk is redrawn only when something near it changes, and chunks just off screen are prepared during idle time. Animated things (flowing lava, rippling water, flickering flames, swaying plants, glints on ores and crystals, falling leaves, wind trails, twinkling and shooting stars) are listed per chunk when it bakes and drawn on top each frame, at up to 30 frames per second, 20 on slow devices, and not at all when the tab is hidden. The pause button in the header stops all of it and is remembered.

## Contact form

The form posts to [src/app/api/contact/route.ts](src/app/api/contact/route.ts), which sends the message to you with [Resend](https://resend.com) and sets reply-to to the visitor, so you can answer straight from your inbox. It checks every field on the server, ignores obvious bots (a hidden field and a minimum time on the page), and allows five messages per sender every ten minutes.

1. Create a free Resend account **with the email address that should receive messages**, and create an API key. For the live site, a key with **Sending access** only is enough and safer than a full-access one.
2. Add `RESEND_API_KEY` to `.env.local` for local testing (the dev server picks up changes on its own) and to Vercel's environment variables (Project → Settings → Environment Variables, for Production and Preview) for the live site, then redeploy. Keep it secret: it never goes in code or in Git.
3. Optional: `CONTACT_TO_EMAIL` (defaults to the profile email) and `CONTACT_FROM_EMAIL` (defaults to `Portfolio <onboarding@resend.dev>`). That shared sender only delivers to the email your Resend account signed up with. To send from your own address, or to any inbox, verify a domain in Resend (Domains → Add domain, then add the DNS records it lists) and set `CONTACT_FROM_EMAIL`, for example `Portfolio <hello@yourdomain.com>`.

Without a key, the form says it isn't connected yet and offers your email address instead. If a message doesn't arrive, the server log (the `npm run dev` terminal, or Vercel's function logs) has a line starting `Contact form:` with Resend's reason. The usual one is the shared sender writing to an address other than your Resend account's. Messages from the shared sender can land in spam or Promotions the first time; mark one as not spam.

## Content from Sanity (optional)

The site reads published content from Sanity at build time when `NEXT_PUBLIC_SANITY_PROJECT_ID` is set; otherwise it uses the sample content.

1. Create a project at [sanity.io/manage](https://www.sanity.io/manage).
2. Studio: copy `studio/.env.example` to `studio/.env` and fill in the project ID, then:
   ```powershell
   cd studio
   npm install
   npm run dev
   ```
   Publish one **Profile**, then your projects, skill groups, and exploration items. `npm run deploy` hosts the Studio at a `*.sanity.studio` address that requires a Sanity login.
3. Site: copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET`.
4. In the Sanity project's **API → CORS origins**, nothing is needed for the site (it fetches at build time), but add `http://localhost:3333` for local Studio use.

Drafts never appear on the site. If Sanity can't be reached during a build, the build fails on purpose, so the current deployment keeps serving.

## Deploy on Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js).
   The repository's `vercel.json` explicitly selects Next.js and its default output directory. Keep the Root Directory at the repository root. The "Other" preset serves only `public/`, which makes the home page and API routes return 404 even when the build succeeds.
2. Add the environment variables from `.env.example` in **Project → Settings → Environment Variables**.
3. Create a deploy hook in **Settings → Git → Deploy Hooks** (branch `main`). Keep the URL private: anyone with it can trigger builds.
4. In Sanity's **API → Webhooks**, add a webhook that POSTs to that deploy hook URL on create, update, and delete for the `profile`, `project`, `skillGroup`, and `exploration` types, with the filter `!(_id in path("drafts.**"))`.

Publishing, updating, unpublishing, or deleting content then rebuilds the site. A failed build leaves the live deployment untouched; roll back from **Deployments → Promote to Production** on any earlier build.

## Assets and licences

- Block textures, decorations, creatures and animations are generated in code for this project, and the sound effects are synthesised by this project's own script (no game files, texture packs, sample libraries or extracted assets). Project screenshots are the owner's own.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible), both under the SIL Open Font License, served through `next/font`.
- The look is inspired by block-building games but uses original artwork; see the [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) before adding anything derived from that game.
