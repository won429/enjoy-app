# Loading island motion sources

All green motion pixels come from the user-supplied iPhone recordings. No synthetic CSS 3D rotation is applied to the recording.

- `scan.webp`: 61 consecutive frames at 60 fps from first recording (`05-55-49_1.mov`), 4.50–5.50 seconds. Crop (137,127)–(393,383), 256 × 256 px per tile, 8 columns. Includes the complete rotating-face reveal through the fully frontal hold.
- `done.webp`: 67 frames at 60 fps from second recording (`05-57-57_1.mov`), 3.05–4.15 seconds. Crop (149,127)–(405,383), 256 × 256 px per tile, 8 columns. This existing atlas is unchanged.
- Pending synchronization uses original native orbit frames 0–30 from `done.webp`, with a short blend between matching circular poses at the loop seam. There is no reversed playback and no extra perspective rotation.
- When data is ready, finish at native orbit frame 21, blend forward into the matching first-recording face sequence (30–60), hold the frontal face, then use the original second-recording circle/check sequence (30–66).
- One damped spring drives the surface's width, height, corner radius and vertical offset, preserving velocity when targets change. Baseball replaces the check in the same surface, with matching final pill dimensions, outline and shadow.

Research references (observed only; no remote video assets copied):

- Actual iPhone approval footage: https://www.youtube.com/watch?v=ymtRAdfF23c&t=40s (HEO Tech Tips, Faceid Approving chapter).
- Apple Live Activities layout-transition guidance: https://developer.apple.com/design/human-interface-guidelines/live-activities
- Apple continuous spring velocity guidance: https://developer.apple.com/documentation/SwiftUI/Animation
