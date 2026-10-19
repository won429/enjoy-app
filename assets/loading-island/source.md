# Loading island motion sources

The pending orbit is a measured 3D reconstruction of the supplied native iPhone footage, not footage from Apple and not an exact system asset. Face recognition and the final check still use the original user-supplied recording pixels.

- `scan.webp`: 61 consecutive frames at 60 fps from first recording (`05-55-49_1.mov`), 4.50–5.50 seconds. Crop (137,127)–(393,383), 256 × 256 px per tile, 8 columns. Includes the rotating-face reveal through the fully frontal hold.
- `done.webp`: 67 frames at 60 fps from second recording (`05-57-57_1.mov`), 3.05–4.15 seconds. Crop (149,127)–(405,383), 256 × 256 px per tile, 8 columns. Existing atlas unchanged.
- `orbit.webp`: 180 frames at 60 fps over a three-second common period, 128 × 128 px tiles, 8 columns. Generator: `artifacts/loading-island/motion-research/build-orbit.py`.
- The two rings are independent: primary rotates clockwise once per 1.5 s; secondary rotates counterclockwise once per 1 s. Each uses its own fixed oblique axis and plane tilt. Neither plane reverses its direction or rocks within an angular range; the pair is not a rigid body.
- The former compound Euler normal `[sin(a)*cos(a), cos(a), sin(a)**2]` caused apparent backtracking. Its replacement keeps each projected bearing monotonic through full turns. Independent rates/directions are preserved rather than locking the planes together.
- Volume, depth lighting, green material and wrapped shutter are retained. Frames interpolate across 179→0 without any held or reversed frame.
- `verify-direction.py` follows two isolated rendered layers generated with the exact same normals, density and lighting as the composite. A single principal axis of a superimposed independent pair is not a valid per-ring direction test. Over 30 common loops (5,400 transitions per ring), both have zero reversals. Relative plane orientation varies, rejecting a rigid-body regression. These diagnostic layers are not production dependencies.
- When data arrives, continue to the next primary turn boundary, then blend the moving orbit into native face frames 30–60 over 90 ms, hold the frontal face, and use the original native circle/check frames 30–66.
- One damped spring drives the surface geometry and preserves velocity into the baseball handoff.

## Observed source and research

- Actual iPhone footage, HEO Tech Tips, Faceid Approving at 0:40–0:43: https://www.youtube.com/watch?v=ymtRAdfF23c&t=40s . Viewed in the browser, paused and frame-stepped; screenshot `artifacts/loading-island/motion-research/youtube-native.png`. No remote video downloaded or copied into the app.
- Primary user recording: `/Users/park-sungwon/Downloads/ScreenRecording_10-18-2026 05-55-49_1.mov`, native frames 9–29 of the 4.50–5.50 s segment. These distinguish a soft moving volume from a thin ellipse and show the transition from oblique to edge-on and upright poses.
- Loopspeed's own reconstruction write-up and source: https://blog.loopspeed.co.uk/face-id-rebuild . Used to research torus volume rendering, independent multi-axis rotations and soft scattering. Its code was inspected for the method; no library or runtime code from the project was copied into the app. The new renderer is a standalone NumPy ray integrator that pre-renders a small WebP atlas, requiring no WebGL support at runtime.

## Scope and limits

The original recordings show short successful authentications, not an indefinitely scanning native session. The endless continuation is therefore a reconstruction based on those observed shapes and motion, not a claim that Apple uses the exact same axes or timing; the fixed-axis path is an intentional response to the user’s requirement for one-way visible rotation. Native face/check footage remains unchanged. Browser comparisons at identical 61px canvas size are saved in `artifacts/loading-island/motion-research/`.

## Playback speed update (20261019-11)

User-approved independent motion is unchanged. Runtime ORBIT_MS is now 1250 instead of 1500, a 20% playback-speed increase. Primary turn: 1.25 s; secondary: 0.8333 s. Atlas unchanged (version 20261019-10). Lifecycle and seam sampling tests pass at the new rate; browser preview refreshed. For this speed-only update, upload index.html and loading-island.js; orbit.webp need not be reuploaded if version 10 is already deployed.
