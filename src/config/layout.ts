// Room layout dimensions, coordinates, screen definitions, tour camera stops, and tagged colliders (Parts 2, 3, 4)

export type ScreenId = 'about' | 'skills' | 'projects' | 'experience' | 'contact';

export type TourStopId =
  | 'overview'
  | 'about'
  | 'projects'
  | 'experience'
  | 'certificates'
  | 'contact';

export interface TourCameraStopConfig {
  id: TourStopId;
  stopIndex: number;
  label: string;
  locationName: string;
  subtitle: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  screenId?: ScreenId;
  /** World-space width and height of the framed subject for viewport-aware framing adjustments */
  subjectSize: [number, number];
  /** Outward surface normal of the framed subject in world space */
  subjectNormal: [number, number, number];
  /** Up vector of the framed subject in world space */
  subjectUp: [number, number, number];
}

export interface ScreenSpec {
  id: ScreenId;
  stopIndex: number;
  label: string;
  locationName: string;
  center: [number, number, number];
  /** Euler YXZ angles [pitchX, yawY, rollZ] in radians (zero horizon roll) */
  rotation: [number, number, number];
  /** World display width and height in meters */
  width: number;
  height: number;
}

export interface ColliderBox {
  id: string;
  type: 'box' | 'cylinder' | 'sphere';
  center: [number, number, number];
  /** For box: [width, height, depth]. For cylinder/sphere: [radius, height, radius] */
  size: [number, number, number];
  blocking: boolean;
  ignoreForCamera: boolean;
  targetScreen?: ScreenId;
}

const DEG2RAD = Math.PI / 180;

export const ROOM_DIMENSIONS = {
  floorMinX: -3.5,
  floorMaxX: 4.5,
  floorMinZ: -3.0,
  floorMaxZ: 3.0,
  wallThickness: 0.25,
  wallHeight: 3.0,
  plinthThickness: 0.35,
  plinthMargin: 0.35,
} as const;

// Five interactive portfolio screens in the 3D room:
// 1. Laptop ('about', tour stop 1)
// 2..4. Three 27-inch monitors on the desk ('skills', 'projects', 'experience')
// 5. Smartphone on the coffee table ('contact', tour stop 5)
export const SCREEN_SPECS: readonly ScreenSpec[] = [
  {
    id: 'about',
    stopIndex: 1,
    label: 'About',
    locationName: 'About (Laptop)',
    center: [-2.75, 0.91, -2.40],
    rotation: [-7 * DEG2RAD, 12 * DEG2RAD, 0],
    width: 0.36,
    height: 0.22,
  },
  {
    id: 'skills',
    stopIndex: 1,
    label: 'Skills',
    locationName: 'Skills (Monitor 1)',
    center: [-1.72, 1.06, -2.65],
    rotation: [-7 * DEG2RAD, 6 * DEG2RAD, 0],
    width: 0.60,
    height: 0.34,
  },
  {
    id: 'projects',
    stopIndex: 2,
    label: 'Projects',
    locationName: 'Projects (Monitor 2)',
    center: [-1.06, 1.06, -2.65],
    rotation: [-7 * DEG2RAD, 0, 0],
    width: 0.60,
    height: 0.34,
  },
  {
    id: 'experience',
    stopIndex: 3,
    label: 'Experience & Roles',
    locationName: 'Experience & Roles (Monitor 3)',
    center: [-0.40, 1.06, -2.65],
    rotation: [-7 * DEG2RAD, -6 * DEG2RAD, 0],
    width: 0.60,
    height: 0.34,
  },
  {
    id: 'contact',
    stopIndex: 5,
    label: 'Contact',
    locationName: 'Contact (Phone)',
    center: [-1.36, 0.532, 1.14],
    rotation: [-25 * DEG2RAD, 24 * DEG2RAD, 0],
    width: 0.098,
    height: 0.214,
  },
] as const;

/**
 * All 6 tour camera stops defined in src/config/layout.ts using a single configuration
 * entry per location ({ id, position: [x, y, z], target: [x, y, z], fov }):
 * 1. Overview (stop 0) — the room as a whole (center [0.35, 0.45, 0.0])
 * 2. About (stop 1) — the existing laptop (center [-2.75, 0.91, -2.40], normal [0.2063, 0.1219, 0.9708], d = 0.45 m)
 * 3. Projects (stop 2) — Monitor 2 (center [-1.06, 1.06, -2.65], normal [0, 0.1219, 0.9925], d = 0.66 m)
 * 4. Experience & Roles (stop 3) — Monitor 3 (center [-0.40, 1.06, -2.65], normal [-0.1037, 0.1219, 0.9871], d = 0.66 m)
 * 5. Certificates (stop 4) — the floating certificate shelf & CERTIFICATES wall heading (center [1.60, 1.54, -2.76], normal [0, 0, 1], d = 1.32 m)
 * 6. Contact (stop 5) — the existing phone on the coffee table (center [-1.36, 0.532, 1.14], normal [0.3686, 0.4226, 0.8279], d = 0.42 m)
 */
export const TOUR_CAMERA_STOPS: readonly TourCameraStopConfig[] = [
  {
    id: 'overview',
    stopIndex: 0,
    label: 'Overview',
    locationName: 'Overview (Room)',
    subtitle: 'Cozy night workspace & interactive multi-monitor desk',
    position: [3.385, 2.37, 8.84],
    target: [0.35, 0.45, 0.0],
    fov: 45,
    subjectSize: [8.7, 3.35],
    subjectNormal: [0.32, 0.21, 0.92],
    subjectUp: [0, 1, 0],
  },
  {
    id: 'about',
    stopIndex: 1,
    label: 'About',
    locationName: 'About (Laptop)',
    subtitle: 'Full-Stack Developer, UI Engineer & B.Tech CSE Student at VJIT',
    position: [-2.657, 0.965, -1.963],
    target: [-2.75, 0.91, -2.40],
    fov: 45,
    screenId: 'about',
    subjectSize: [0.388, 0.248],
    subjectNormal: [0.2063, 0.1219, 0.9708],
    subjectUp: [-0.0254, 0.9925, -0.1192],
  },
  {
    id: 'projects',
    stopIndex: 2,
    label: 'Projects',
    locationName: 'Projects (Monitor 2)',
    subtitle: 'ExamOS, ORCA, Clinic Desk & StockPilot',
    position: [-1.06, 1.14, -1.995],
    target: [-1.06, 1.06, -2.65],
    fov: 45,
    screenId: 'projects',
    subjectSize: [0.628, 0.368],
    subjectNormal: [0.0, 0.1219, 0.9925],
    subjectUp: [0.0, 0.9925, -0.1219],
  },
  {
    id: 'experience',
    stopIndex: 3,
    label: 'Experience & Roles',
    locationName: 'Experience & Roles (Monitor 3)',
    subtitle: 'InAmigos Foundation Internship, Communities & Hackathons',
    position: [-0.468, 1.14, -1.999],
    target: [-0.40, 1.06, -2.65],
    fov: 45,
    screenId: 'experience',
    subjectSize: [0.628, 0.368],
    subjectNormal: [-0.1037, 0.1219, 0.9871],
    subjectUp: [0.0127, 0.9925, -0.1212],
  },
  {
    id: 'certificates',
    stopIndex: 4,
    label: 'Certificates',
    locationName: 'Certificates (Shelf)',
    subtitle: '3 Wall Frames & 8 Gold Certificate Books on the Floating Shelf',
    position: [1.60, 1.56, -1.44],
    target: [1.60, 1.54, -2.76],
    fov: 45,
    subjectSize: [1.16, 0.68],
    subjectNormal: [0.0, 0.015, 0.9999],
    subjectUp: [0.0, 1.0, 0.0],
  },
  {
    id: 'contact',
    stopIndex: 5,
    label: 'Contact',
    locationName: 'Contact (Phone)',
    subtitle: 'Connect via LinkedIn, GitHub, WhatsApp & Email',
    position: [-1.205, 0.709, 1.488],
    target: [-1.36, 0.532, 1.14],
    fov: 45,
    screenId: 'contact',
    subjectSize: [0.11, 0.23],
    subjectNormal: [0.3686, 0.4226, 0.8279],
    subjectUp: [-0.1718, 0.9063, -0.386],
  },
] as const;

// Part 2: Enlarged TV (1.6 m x 0.9 m screen, 0 deg tilt, rotated 10 deg toward sofa, on 1.9 m wide console)
export const TV_SPEC = {
  center: [3.50, 1.08, -2.62] as [number, number, number],
  rotationY: -10 * DEG2RAD,
  width: 1.6,
  height: 0.9,
};

// Optional sample override: if non-empty, fetch and decode once on first click and play a random sample instead of Karplus-Strong synthesis
export const GUITAR_SAMPLE_URLS: string[] = [];

// Stylized 1.0 m acoustic guitar hung on the back wall directly above the TV (centered at x = 3.50, y = 1.75..2.75 m, tilted 10 deg, neck up)
export const GUITAR_SPEC = {
  hookPosition: [3.50, 2.57, -2.92] as [number, number, number],
  center: [3.50, 2.25, -2.92] as [number, number, number],
  tiltZRad: 10 * DEG2RAD,
  length: 1.0,
  width: 0.34,
  depth: 0.12,
} as const;

export const PROP_POSITIONS = {
  desk: { minX: -3.2, maxX: 0.2, minZ: -2.9, maxZ: -2.1, topY: 0.75 },
  laptopBase: [-2.75, 0.76, -2.30] as [number, number, number],
  keyboard: [-1.06, 0.77, -2.25] as [number, number, number],
  mouse: [-0.46, 0.77, -2.25] as [number, number, number],
  deskMat: [-1.06, 0.754, -2.32] as [number, number, number],
  // Desk lamp kept at the far left end of the desk behind the laptop (-3.1, 0.75, -2.7) so it never blocks a screen
  deskLamp: [-3.1, 0.75, -2.7] as [number, number, number],
  floorLamp: [0.32, 0.0, -2.38] as [number, number, number],
  guitar: [3.50, 2.25, -2.92] as [number, number, number],
  chair: [-1.2, 0.0, -1.25] as [number, number, number],
  window: { x: -3.5, minZ: -2.05, maxZ: -0.85, minY: 1.15, maxY: 2.35 },
  sofa: { x: -2.96, minZ: 0.0, maxZ: 2.2 },
  wallCertificates: [
    [-3.455, 1.70, 0.20],
    [-3.455, 1.70, 1.10],
    [-3.455, 1.70, 2.00],
  ] as const,
  coffeeTable: [-1.4, 0.0, 1.1] as [number, number, number],
  phone: [-1.36, 0.532, 1.14] as [number, number, number],
  rug: [-1.3, 0.008, 1.1] as [number, number, number],
  chairRug: [-1.2, 0.008, -1.35] as [number, number, number],
  pouf: [-1.95, 0.0, 1.85] as [number, number, number],
  sideTable: [-2.95, 0.0, -0.32] as [number, number, number],
  bookshelf: { minX: 1.02, maxX: 2.18, minZ: -3.0, maxZ: -2.63, height: 1.318 },
  tvConsole: { minX: 2.55, maxX: 4.45, minZ: -2.935, maxZ: -2.515, height: 0.48 },
  floorPlantSmall: [0.68, 0.0, -2.68] as [number, number, number],
  floorPlantBig: [1.36, 0.0, -2.66] as [number, number, number],
  sofaPlant: [-2.95, 0.0, 2.52] as [number, number, number],
} as const;

// Simplified colliders for every object in the room
export const SCENE_COLLIDERS: readonly ColliderBox[] = [
  // Structural shell
  {
    id: 'plinth',
    type: 'box',
    center: [0.5, -0.175, 0.0],
    size: [8.7, 0.35, 6.7],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'back-wall',
    type: 'box',
    center: [0.5, 1.5, -3.125],
    size: [8.25, 3.0, 0.25],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'left-wall',
    type: 'box',
    center: [-3.625, 1.5, 0.0],
    size: [0.25, 3.0, 6.25],
    blocking: true,
    ignoreForCamera: false,
  },

  // Desk & drawer unit
  {
    id: 'desk-top',
    type: 'box',
    center: [-1.5, 0.72, -2.5],
    size: [3.4, 0.06, 0.8],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'desk-drawer',
    type: 'box',
    center: [-0.08, 0.36, -2.5],
    size: [0.52, 0.72, 0.76],
    blocking: true,
    ignoreForCamera: false,
  },

  // Chair
  {
    id: 'chair-seat',
    type: 'box',
    center: [-1.2, 0.44, -1.25],
    size: [0.52, 0.12, 0.52],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'chair-back',
    type: 'box',
    center: [-1.2, 0.72, -1.02],
    size: [0.48, 0.48, 0.10],
    blocking: true,
    ignoreForCamera: false,
  },

  // Living area furniture
  {
    id: 'sofa-base',
    type: 'box',
    center: [-2.96, 0.42, 1.1],
    size: [0.88, 0.84, 2.2],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'sofa-side-table',
    type: 'cylinder',
    center: [-2.95, 0.26, -0.32],
    size: [0.24, 0.52, 0.24],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'floor-pouf',
    type: 'cylinder',
    center: [-1.95, 0.16, 1.85],
    size: [0.28, 0.32, 0.28],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'coffee-table',
    type: 'cylinder',
    center: [-1.4, 0.21, 1.1],
    size: [0.48, 0.42, 0.48],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'bookshelf',
    type: 'box',
    center: [1.6, 1.30, -2.815],
    size: [1.16, 0.04, 0.37],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'tv-console',
    type: 'box',
    center: [3.5, 0.24, -2.725],
    size: [1.9, 0.48, 0.42],
    blocking: true,
    ignoreForCamera: false,
  },

  // Big plants
  {
    id: 'floor-plant-small',
    type: 'cylinder',
    center: [0.68, 0.45, -2.68],
    size: [0.25, 0.82, 0.25],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'floor-plant-big',
    type: 'cylinder',
    center: [1.36, 0.50, -2.66],
    size: [0.30, 1.0, 0.30],
    blocking: true,
    ignoreForCamera: false,
  },
  {
    id: 'sofa-plant',
    type: 'cylinder',
    center: [-2.95, 0.45, 2.52],
    size: [0.26, 0.9, 0.26],
    blocking: true,
    ignoreForCamera: false,
  },

  // Small props & certificate books/frames/guitar (ignoreForCamera: true, completely out of screen view corridors)
  {
    id: 'prop-guitar',
    type: 'box',
    center: [3.50, 2.25, -2.92],
    size: [0.38, 1.00, 0.14],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-keyboard',
    type: 'box',
    center: [-1.06, 0.77, -2.25],
    size: [0.38, 0.03, 0.14],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-mouse',
    type: 'box',
    center: [-0.46, 0.77, -2.25],
    size: [0.07, 0.03, 0.11],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-mug',
    type: 'cylinder',
    center: [-1.62, 0.80, -2.25],
    size: [0.05, 0.10, 0.05],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-desk-lamp',
    type: 'cylinder',
    center: [-3.1, 0.95, -2.7],
    size: [0.14, 0.42, 0.14],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-coffee-items',
    type: 'box',
    center: [-1.58, 0.46, 0.96],
    size: [0.28, 0.12, 0.28],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-phone-stand',
    type: 'box',
    center: [-1.36, 0.47, 1.12],
    size: [0.12, 0.10, 0.12],
    blocking: false,
    ignoreForCamera: true,
  },
  {
    id: 'prop-cert-books',
    type: 'box',
    center: [1.6, 1.445, -2.74],
    size: [0.64, 0.27, 0.22],
    blocking: false,
    ignoreForCamera: true,
  },

  // Target Screen Colliders (tagged targetScreen)
  {
    id: 'screen-about',
    type: 'box',
    center: [-2.75, 0.91, -2.40],
    size: [0.38, 0.24, 0.06],
    blocking: false,
    ignoreForCamera: false,
    targetScreen: 'about',
  },
  {
    id: 'screen-skills',
    type: 'box',
    center: [-1.72, 1.06, -2.65],
    size: [0.62, 0.36, 0.06],
    blocking: false,
    ignoreForCamera: false,
    targetScreen: 'skills',
  },
  {
    id: 'screen-projects',
    type: 'box',
    center: [-1.06, 1.06, -2.65],
    size: [0.62, 0.36, 0.06],
    blocking: false,
    ignoreForCamera: false,
    targetScreen: 'projects',
  },
  {
    id: 'screen-experience',
    type: 'box',
    center: [-0.40, 1.06, -2.65],
    size: [0.62, 0.36, 0.06],
    blocking: false,
    ignoreForCamera: false,
    targetScreen: 'experience',
  },
  {
    id: 'screen-contact',
    type: 'box',
    center: [-1.36, 0.532, 1.14],
    size: [0.12, 0.23, 0.08],
    blocking: false,
    ignoreForCamera: true,
    targetScreen: 'contact',
  },
] as const;
