# Loading island motion sources

Motion pixels are extracted from the user-supplied reference recordings, not redrawn.

- `scan.webp`: first recording (`05-55-49_1.mov`), 4.55–4.983 seconds, 27 frames at 60 fps. Crop: (137,127)–(393,383).
- `done.webp`: second recording (`05-57-57_1.mov`), 3.05–4.15 seconds, 67 frames at 60 fps. Crop: (149,127)–(405,383).
- Both atlases: 256 × 256 px per frame, 8 columns; unrelated screen pixels are masked to black. Source green glow and motion blur are retained.
- Waiting plays the first scan once, then reverses the rotation segment back and forth; completion plays the second recording once through the check hold.
