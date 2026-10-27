# Homepage hero slider

The server Hero supplies three stitched 3-piece outfit slides to the isolated
client carousel. The values strip stays below it.

| Number | Outfit | Desktop and mobile portrait |
| --- | --- | --- |
| 01 | Noor | `noor-192.webp`, `noor-384.webp` |
| 02 | Meher | `meher-192.webp`, `meher-384.webp` |
| 03 | Gulnaar | `gulnaar-192.webp`, `gulnaar-384.webp` |

All slides use the headline **Your everyday. Beautifully dressed.** and the
same supporting text and Shop 3-Piece link. Each has its own descriptive alt
text. Every configured source exists locally; no slide uses the shared collage.

## Playback

The active slide advances every seven seconds after its image is ready.
Pause cancels rotation and any pending transition; Play resumes immediately,
including while the pointer or keyboard focus stays on the playback button.
Number controls, arrows and swipes preserve the selected playback setting.
Previous/Next wrap between 01 and 03. Slow or failed images cannot replace a
newer requested slide; failures retain the previous image and stop rotation.

Hidden tabs and offscreen heroes suspend the timer. Keyboard focus pauses
rotation until explicit Play. Reduced motion starts paused and removes visual
transitions; explicit Play remains available. Hover alone does not stop autoplay.

## Presentation and assets

Desktop portraits sit on the right with a soft mask into the plum background,
leaving room for the headline. Mobile portraits fill the hero with a dark
gradient supporting the copy. Headlines use local Cormorant Garamond; support
text and controls use DM Sans. Controls keep 44px targets, visible focus states,
selected-number indicators, and normal document flow. Inactive slides are inert.

The existing 384px-wide sample portraits remain design-preview imagery.
Replace them with client-approved high-resolution originals before launch;
update each desktop/mobile pair in `model/slides.ts` using actual dimensions.
Only the first slide loads with high priority; other images load on request.

## Validation

Node tests protect three distinct sources, common copy, playback intent,
pending-image cancellation, rapid navigation, wrapping, visibility and errors.
Browser checks verify actual image changes, timed autoplay, Pause/Play,
number controls, arrows, keyboard access, mobile layout and reduced motion.
