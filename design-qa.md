# Design QA — Drop photo feed

## Scope

- Add a photo-create control to the left side of the member activity tray.
- Offer camera and gallery sources using the same browser file-input pattern as `health.html`.
- Render uploaded photos as a loose, overlapping collage with uploader name and date/time.
- Store the image in a separate Cloudinary folder and the image URL/metadata in Firebase Firestore.

## Source references

- `/Users/park-sungwon/Downloads/스크린샷, 2026-09-17 08.02.40.png`
- `/Users/park-sungwon/Downloads/스크린샷, 2026-09-17 08.04.29.png`

## Implementation evidence

- `/Users/park-sungwon/Documents/ChatGPT/엔조이소셜/enjoy-app/index.html`
- Codex in-app browser local preview: `http://127.0.0.1:4177/index.html`
- Review viewport: 1280 × 720, with the existing 28rem mobile app canvas centered.
- Review state: light theme; temporary in-memory sample posts for layout only; source file contains no mock data.

## Comparison history

### Iteration 1

- P2: photo cards followed a mostly vertical rhythm and did not overlap enough to match the loose reference collage.
- Fix: increased alternating negative vertical margins, varied widths and columns, and adjusted z-index stacking.

### Iteration 2

- The add control matches the reference hierarchy: neutral user silhouette, circular outline, dark plus badge, and a short label.
- Photo cards use six alternating placements, multiple aspect ratios, small rotations, and controlled overlaps.
- Uploader avatar/initial, profile name, and exact Korean date/time remain readable at each card's lower-left edge.
- Camera/gallery bottom sheet is visually consistent with the app's translucent navigation surfaces.

## Fidelity surfaces

- Placement: add control is the first item in the existing member tray; the feed begins directly below the ad slot.
- Sizing: add control matches member-avatar scale; feed cards use responsive column spans rather than a rigid equal grid.
- Typography: existing app weight and compact metadata scale are preserved.
- Color: dark and light theme overrides reuse the current neutral and blue accent palette.
- Borders and depth: rounded photo frames use subtle borders and soft shadows; the picker uses backdrop blur.
- Content: no sample post content is included in the shipped page.

## Interaction checks

- Add control opens the photo-source sheet.
- Close control and backdrop dismiss the sheet.
- Camera and gallery actions are wired to separate image inputs.
- Image validation, 25MB limit, resize/compression, Cloudinary upload, Firestore document creation, live Firestore subscription, loading state, and failure messages are present.
- Browser console review showed no new Drop feature errors. Existing Kakao AdFit visibility and Firebase renovation-permission messages are unrelated to this change.

## Residual integration check

- A real upload was intentionally not submitted during QA because it would create persistent Cloudinary and Firestore data. Production Firestore rules must allow authenticated reads and creates for `drop_posts`.

## Final result

passed
