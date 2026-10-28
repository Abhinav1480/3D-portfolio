# Architectural & Design Decisions Log

**D-01: Single Palette Source of Truth (`src/config/palette.ts`)**
All sRGB hex colors and CSS rgba tokens live exclusively in `src/config/palette.ts`.
Zero hex color literals appear in any other `.ts`, `.tsx`, or `.css` file.

**D-02: Mathematically Derived Camera Stops & Collision Clearance (`src/config/cameraStops.ts`)**
Screen stops are computed directly from world normal and `d = max(H/(2*tan(fov/2)), W/(2*tan(fov/2)*aspect)) / 0.8`.
Desk chair is positioned at `(-1.2, 0, -1.35)` with low-profile back (`0.84m`) so all 4 monitor stops have 100% unobstructed 5-ray visibility and zero blocking-collider penetration.

**D-03: Single-Texture Canvas Displays (`src/screens/ScreenTexture.ts`)**
Each screen renders a 1536x864 `CanvasTexture` (`SRGBColorSpace`, anisotropy 8, mipmaps enabled) used simultaneously from afar and when focused.
Textures redraw only on page change, hover region change, toast feedback, or the 0.8s reveal animation (capped at 30 fps), never per frame.

**D-04: One Smoother (Lenis) + One Camera Owner (`src/camera/CameraRig.tsx`)**
Lenis (`lerp: 0.07`, `wheelMultiplier: 0.85`, `smoothWheel: true`, `syncTouch: false`) drives a single `scrollProgressRef` via GSAP ScrollTrigger.
`CameraRig` samples 2000-point precomputed centripetal Catmull-Rom LUTs in `useFrame` with preallocated `Vector3`/`Quaternion` instances and C1-continuous PCHIP pacing.

**D-05: Static Night Lighting & One-Time Exposure Calibration (`src/scene/Lights.tsx`)**
Five static lights (Ambient, Hemisphere, Moon Directional with 2048 shadow map, 2 warm lamp PointLights, 1 monitor SpotLight backglow) with zero animation or bloom.
After load and after each flight settles, a 64x36 offscreen render target samples average luminance and tweens `toneMappingExposure` within `[0.6, 1.1]` toward `0.35` over `0.6s`.

**D-06: Verified Repository Content & Unreachable Repo Handling (`src/data/content.ts`)**
`ExamOS`, `SIH (ORCA)`, and `Clinic Desk` were verified directly against their public GitHub repositories and live deployments.
`vedant7007/sutradhar` returned HTTP 404; per Section 10 & D6, zero details were invented and its status is logged in `NEEDS_FROM_ME.md`.
