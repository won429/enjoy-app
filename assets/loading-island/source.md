# Loading island motion sources

Motion pixels are extracted from the user-supplied recordings, not redrawn.

- `scan.webp`: first recording (`05-55-49_1.mov`), 4.55–5.15 seconds, 37 frames at 60 fps. Crop: (137,127)–(393,383). Frames 0–26 contain the original scan; frames 27–35 contain the face reveal; frame 36 uses the fully frontal 5.40-second source frame.
- `done.webp`: second recording (`05-57-57_1.mov`), 3.05–4.15 seconds, 67 frames at 60 fps. Crop: (149,127)–(405,383).
- Both atlases: 256 × 256 px per tile, 8 columns. Unrelated screen pixels are masked to black; source glow and motion blur remain.
- Waiting advances scan frames forward with interpolation, continuous 360° azimuth and independent horizontal/vertical perspective tilt. There is no reversed frame playback.
- Completion settles the orbit, reveals and holds the first video's face, dissolves to the second video's open circle, then plays its check drawing.
- When a game is ready, the same panel morphs into the compact baseball score. The actual baseball controller enters its already-open state before the loading surface is removed.
