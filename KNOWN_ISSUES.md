# Known Issues

1. **Headless Software WebGL Frame Time**: In GPU-less headless Chromium (`SwiftShader`), rasterizing 3D shadows and 1536x864 textures runs on CPU; the renderer automatically detects software WebGL and adjusts pixel ratio to 1.0 to maintain responsiveness.
2. **Sutradhar Card Content Placeholder**: Because `https://github.com/vedant7007/sutradhar` returned HTTP 404 during build verification, its card and detail view intentionally display a "Repository Private / Verification Pending" notice rather than unverified claims.
3. **Offscreen Luminance Readback under Rapid Flight Cancellation**: Exposure calibration runs only when a flight completes (`onComplete`), skipping intermediate interrupted flights to avoid GPU pipeline stalls.
