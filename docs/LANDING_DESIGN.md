# Wake Consumer Landing Page — Design Brief

Last updated: 2026-04-07

---

## What This Page Is

A brand page, not a product page. No feature lists, no screenshots, no "how it works", no pricing. The goal is to make someone feel something and understand who Wake is and what kind of person belongs here.

---

## The Core Constraint

**Intentional exclusion.** The page is not for everyone, and that's correct. Someone who doesn't recognize themselves in it should leave. The right person should feel like they found something that was made for them.

---

## The Feeling

The page should make someone feel **desire** — they want to be in this world, they want to know the people in it. Combined with a **visual shock** that comes from the structure and register being completely unlike anything they've ever seen for a fitness product. Not weird for weird's sake. Inspirational. Different.

The shock is structural and visual — not from the copy. Someone lands expecting a gym app and gets something cinematic and editorial they've never associated with training.

**"I want my page to have a soul."** That's the exact standard. Whoop has good design but lacks soul. Letterboxd has soul. MSCHF has soul. The difference is whether it feels like a real person/culture made it or whether it feels assembled.

---

## Visual vs. Copy Balance

Wants the page to be **as visual as possible**. Images first. But: *"a good copy is the best thing you can do; a bad copy is literally the worst."* So copy is not optional — it's just that bad copy is worse than no copy. The standard is high. Every word has to earn its place or it shouldn't be there.

---

## The Voice

Like a friend telling you about Wake. Not the brand speaking. Not an athlete speaking. A person who genuinely loves something and wants you to know about it without being a salesperson about it. Warm, slightly informal, excited but not overselling.

**In Spanish.** Primary audience is Colombian. The cadence should feel natural, not translated.

**"If you know you know"** — that's the style explicitly named. The page assumes a certain kind of person and speaks to them directly. Everyone else can leave.

**What the voice is NOT:**
- Marketing speak
- Short choppy fragments ending in a period after every clause
- "It's not X, it's Y" contrast structures
- Setting up a narrative scenario ("imagine you...")
- Anything that sounds like someone sat down to write brand copy

**On the "indictment" copy approach (scene 2 in the early proposal):** The intention was right — disruptive, controversial, names something real. But the specific message/execution was wrong. The message needs to be found; the disruption and controversy are the right energy to aim for. This is still unresolved.

**Hook direction:** *"Hay gente que simplemente entrena diferente."* — this direction works. Casual confidence, doesn't explain itself. The word *simplemente* is doing important work: effortless, natural, not forced. The rest of the voice needs to live in this same register.

---

## Page Structure

Not a traditional landing page. No hero → features → CTA → cards → footer structure. A **journey** — like scrolling through an identity, not a funnel. No CTA above the fold. The CTA is earned at the end.

Text appears tied to scroll progress. Sections feel like scenes. You don't feel like you're reading a page. You feel like someone is talking to you as you move through it.

**Animation richness:** Tons of animations throughout the scroll. Custom UI components. Everything is not what you expect. There's a thrill to exploring it — at any moment something unexpected can appear. The Landon Norris page is the closest reference for this feeling: complex scroll interactions, custom cursor behavior, every section has its own visual language.

### Scenes (in order)

**01 — Hero**
Full viewport. Image from the bank (single image, changes on load or over time). No CTA. One short line of copy in the hook register. The visual effect on the hero is the first thing that creates the shock — see hero technical spec below.

**02 — Scroll Text**
Lines appear as you scroll through them, one at a time, activated by scroll position. Fade when past. No images. The text is the visual. Placeholder copy currently — voice not locked yet.

**03 — Image Flood**
A section (or multiple) where the volume of the brand is felt through images. Three options are being tested simultaneously:
- **03A Marquee:** Three rows of images scrolling at different speeds and directions. Continuous motion. You feel the breadth of the brand without processing any single image.
- **03B Flash:** Images flash in rapid sequence triggered by scroll entry. Starts slow, accelerates, then decelerates to hold the last image. Like a film reel or a memory.
- **03C Combined:** Marquee rows blurred in the background (low opacity), flash plays over the top. The flash resolves to one image while the marquee continues behind.

Decision on which option (or combination) is pending — testing all three.

**04 — Athlete Scene**
Full viewport. One athlete. Their image is the canvas. Content TBD — athlete voice/quotes are uncertain. Will revisit once image flood decision is made. Not a profile, not a card. You feel like you walked into their world.

**05 — Close**
One line. Then the action. Minimal. Copy and CTA text TBD.

---

## Hero — Technical Spec

**WebGL two-layer depth effect.** Two image layers, mouse tracking creates a reveal.

- **Front layer:** Athlete in their world. Natural, present. The person.
- **Back layer:** Same energy, different side — training, intensity, motion. The athlete.
- Moving the mouse reveals the back layer at the cursor position through an organic, noise-distorted circular mask.
- **The water/smoke effect:** Ambient noise distortion runs on the front layer at all times — the image surface feels like water or smoke even when the mouse is still. When you move the mouse, ripples radiate outward from the cursor.
- **Reveal behavior:** The back layer is **only visible while the mouse is actively moving.** 120ms after the mouse stops, the reveal fades back to zero. The front layer (with its ambient distortion) is always what you see at rest.
- Custom circular cursor visible only over the hero section.

**Concept:** Same logic as Lando Norris's hero — face (front) → helmet (back). For Wake: person (front) → athlete (back). The two sides of a Wake person. Moving the mouse is literally revealing the other side of who they are. That's the brand in one gesture.

---

## Image Bank

Not one hardcoded hero image. A pool of images — athletes, setting shots, anything brand-relevant, anything that feels like Wake — chosen by the Wake team. The page draws from this bank. **Some sections show one image. Some sections show a ton at once.** This rhythm between single-image focus and image-flood is intentional and structural, not random. The bank is populated with real Wake content over time.

---

## What the Page Is NOT

- A traditional hero + CTA structure
- Feature-forward
- Screenshot-based
- "How it works" flow
- Priced or compared to anything
- A page that explains Wake to people who don't get it
- Corporate
- Polished for the sake of polish

---

## Reference Brands

**MSCHF** — "If you know you know" energy. They don't explain themselves to anyone. Every subpage has its own vibe — each one is filled with personality, each one owns its concept. Exploring their site is a thrill: you never know what's going to appear when you click a link. The weirdness of their concepts feels great. The entire brand is a vibe. This is the energy of: either you get it or you don't, and they don't care either way. The disruption isn't a message — it's a total commitment to being themselves.

**Rapha** — The **identity**, not the storefront. Their page is a storefront and that doesn't apply. But their brand identity is the gold standard of sport-as-identity. They don't sell cycling gear, they sell belonging to the most serious cycling culture in the world. The copy reads like it was written by someone inside that world, not a marketing department.

**Loewe** — Visual register reference. Zero copy. Very present as a brand without saying a word. Everything earns its place. *"If I were to have a clothing brand, that's the style I would go for."* Not the personal aesthetic for Wake, but the visual confidence and presence is admired. Implementing the zero-copy principle in places.

**Letterboxd** — Voice register. Feels written by someone who genuinely loves what they're doing, not a marketer who was briefed on it. *"It's not made by a marketer. That's the exact feel I like and I would like to go for in my brand."* Doesn't personally connect with the subject matter (films) but the authenticity of the voice is exactly the target.

**Landon Norris site (landonorris.com)** — Structure and interaction reference. No traditional CTAs. The scroll is a journey through an identity. Heavy custom animations throughout — complex custom UI components, everything is not what you expect. The mouse parallax hero: face (front layer) → helmet (back layer revealed on mouse move) through a "moving finger through water / smoke" displacement effect. The thrill of the Landon site: at any moment something unexpected appears. Loves the dev work specifically — technical craftsmanship is part of the experience.

**Linear / Cursor** — Reference for the **creator landing page** and **developer landing page** — not this consumer page. Linear speaks directly to devs. Cursor shows an interactive product preview you can actually use. Wants that interactive product demo on the creator page specifically.

**Whoop** — Good design, cinematic, athletic. Some page features make you feel bought into the brand. But lacks soul compared to the others. Reference for visual quality level, not for character.

---

## Decisions Still Open

- **Image flood:** Which option (03A, 03B, 03C, or combination) — pending testing.
- **Athlete scene content:** What exactly lives in that scene beyond a name and photo. Quotes uncertain.
- **Scroll text copy:** Lines are placeholder. Voice direction is clear but specific copy is not locked.
- **Close copy:** Line and CTA text TBD.
- **Real image bank:** Currently using Unsplash placeholders. Needs real Wake images.
- **Hero images:** Front and back layer images need to be real athlete photos.

---

## Technical

- Built as `/design` route in `apps/landing` (Vite + React 18)
- Will replace the `/` route when ready — rename component and swap route
- Three.js for WebGL hero shader
- Intersection Observer for scroll text and entrance animations
- No external animation libraries — vanilla JS + CSS
- CSS animations use Wake design system easings: `cubic-bezier(0.22, 1, 0.36, 1)` (spring)
- Font: Montserrat
- Canvas: `#1a1a1a`
