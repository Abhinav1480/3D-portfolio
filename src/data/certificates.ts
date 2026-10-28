// Verified Certificate Data & Asset Base URL
// All 11 certificates in exact viewer order (3 wall frames + 8 bookshelf books).
// Missing issuer/date fields are omitted silently.

export const CERT_BASE =
  'https://raw.githubusercontent.com/Abhinav1480/portfolio-assets/main/Abhinav_Portfolio_Certificates/';

export interface CertificateItem {
  id: string;
  index: number; // 0..10
  place: 'wall' | 'shelf';
  file: string;
  url: string;
  imageUrl: string;
  title: string;
  issuer?: string;
  date?: string;
  alt: string;
  /** Initial known aspect ratio (width / height) for layout before image load */
  initialAspect: number;
  aspectRatio: number;
}

interface RawCertificateSpec {
  id: string;
  place: 'wall' | 'shelf';
  file: string;
  title: string;
  issuer?: string;
  date?: string;
  initialAspect: number;
}

const RAW_CERTIFICATES: readonly RawCertificateSpec[] = [
  // Wall (left to right, 1..3)
  {
    id: 'cert-1-aiml-hacks-kgrh',
    place: 'wall',
    file: 'wall/AIML-Hacks-KGRH-1st-Place-Certificate.png',
    title: 'Certificate of Appreciation: 1st place, national-level hackathon',
    issuer:
      'AIML HACKS KGRH (KG Reddy College of Engineering & Technology, Department of AIML)',
    date: '30 Sep to 1 Oct 2026',
    initialAspect: 657 / 417,
  },
  {
    id: 'cert-2-inamigos-internship',
    place: 'wall',
    file: 'wall/InAmigos-Foundation-Web-Development-Internship-Certificate.png',
    title: 'Certificate of Internship: Web Development Internship',
    issuer: 'InAmigos Foundation',
    date: '5 to 19 Jun 2026',
    initialAspect: 998 / 710,
  },
  {
    id: 'cert-3-acm-vjit-ai-battle',
    place: 'wall',
    file: 'bookshelf/ACM-VJIT-AI-Battle-Certificate-of-Achievement.png',
    title: 'Certificate of Achievement and Distinction: AI Battle',
    issuer: 'ACM Student Chapter, VJIT',
    date: '8 Apr 2026',
    initialAspect: 1180 / 816,
  },

  // Bookshelf (8 books, in exact order 4..11)
  {
    id: 'cert-4-acm-vjit-redesignx',
    place: 'shelf',
    file: 'bookshelf/ACM-VJIT-Re-designX-Certificate-of-Achievement.png',
    title: 'Certificate of Achievement: Re-designX',
    issuer: 'ACM Student Chapter, VJIT',
    date: '9 Apr 2026',
    initialAspect: 1.414,
  },
  {
    id: 'cert-5-digital-heroes-fullstack',
    place: 'shelf',
    file: 'bookshelf/Digital-Heroes-Full-Stack-Developer-Training-Certificate.png',
    title: 'Certificate of Completion: Full-Stack Developer Training',
    issuer: 'Digital Heroes',
    date: '10 Jul 2026',
    initialAspect: 1.414,
  },
  {
    id: 'cert-6-hackindia-2025',
    place: 'shelf',
    file: 'bookshelf/HackIndia-2025-LIET-UP-West-Regionals-Certificate.png',
    title: 'Certificate of Participation: HackIndia 2025, LIET UP West Regionals',
    issuer: 'Lloyd Institute of Engineering and Technology (via Unstop)',
    initialAspect: 1.414,
  },
  {
    id: 'cert-7-hackwithai-2026',
    place: 'shelf',
    file: 'bookshelf/HackWithAI-2026-Certificate-of-Participation.png',
    title: 'Certificate of Participation: HackWithAI 2026 (24-hour offline AI hackathon)',
    issuer: 'KLH Bachupally ACM Student Chapter (via Unstop)',
    date: '2026',
    initialAspect: 1.414,
  },
  {
    id: 'cert-8-infosys-java-tools',
    place: 'shelf',
    file: 'bookshelf/Infosys-Java-Tools-Course-Completion-Certificate.png',
    title: 'Course Completion Certificate: Java Tools',
    issuer: 'Infosys Springboard',
    date: '15 Feb 2026',
    initialAspect: 1.414,
  },
  {
    id: 'cert-9-national-aiml-yuvaan',
    place: 'shelf',
    file: 'bookshelf/National-AI-ML-Hackathon-Vivriti-Capital-Yuvaan-Certificate.png',
    title: 'Certificate of Participation: National AI/ML Hackathon (YUVAAN)',
    issuer: 'Vivriti Capital / IIT Hyderabad (via Unstop)',
    initialAspect: 1.414,
  },
  {
    id: 'cert-10-replit-polaris-vibeathon',
    place: 'shelf',
    file: 'bookshelf/Replit-Polaris-Vibeathon-Participation-Certificate.png',
    title: 'Certificate of Participation: 36-hour Vibeathon',
    issuer: 'Polaris School of Technology and Replit',
    initialAspect: 1.414,
  },
  {
    id: 'cert-11-decode-labs-offer',
    place: 'shelf',
    file: 'wall/Decode-Labs-Frontend-Development-Internship-Offer-Letter.png',
    title: 'Internship offer letter: Frontend Development Intern (remote)',
    issuer: 'Decode Labs',
    date: '30 Jun to 30 Jul 2026',
    initialAspect: 0.707,
  },
];

export const CERTIFICATES: readonly CertificateItem[] = RAW_CERTIFICATES.map((spec, idx) => {
  const fullUrl = `${CERT_BASE}${spec.file}`;
  return {
    ...spec,
    index: idx,
    url: fullUrl,
    imageUrl: fullUrl,
    aspectRatio: spec.initialAspect,
    alt: `Certificate image: ${spec.title}`,
  };
});

export const WALL_CERTIFICATES: readonly CertificateItem[] = CERTIFICATES.filter(
  (c) => c.place === 'wall'
);

export const SHELF_CERTIFICATES: readonly CertificateItem[] = CERTIFICATES.filter(
  (c) => c.place === 'shelf'
);

// Session-level "opened once" state for click-invitation highlight + image preloader cache
let openedAnyCertificateInSession = false;
try {
  if (typeof window !== 'undefined' && window.sessionStorage?.getItem('cert_opened_once') === '1') {
    openedAnyCertificateInSession = true;
  }
} catch {
  // Ignore sessionStorage errors inside restricted iframes
}

const openedListeners = new Set<() => void>();

export function hasOpenedAnyCertificate(): boolean {
  return openedAnyCertificateInSession;
}

export function markCertificateOpenedInSession(): void {
  if (!openedAnyCertificateInSession) {
    openedAnyCertificateInSession = true;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage?.setItem('cert_opened_once', '1');
      }
    } catch {
      // Ignore sessionStorage errors inside restricted iframes
    }
    openedListeners.forEach((fn) => fn());
  }
}

export function subscribeCertificateOpened(listener: () => void): () => void {
  openedListeners.add(listener);
  return () => {
    openedListeners.delete(listener);
  };
}

// In-memory one-time flag for the bookshelf certificate hint chip (at most once per session)
let shownShelfHintInSession = false;

export function hasShownShelfHintInSession(): boolean {
  return shownShelfHintInSession;
}

export function markShelfHintShownInSession(): void {
  shownShelfHintInSession = true;
}

// In-memory one-time flag for the EXPLORE mode controls hint chip (at most once per session)
let shownExploreHintInSession = false;

export function hasShownExploreHintInSession(): boolean {
  return shownExploreHintInSession;
}

export function markExploreHintShownInSession(): void {
  shownExploreHintInSession = true;
}

const preloadedUrls = new Set<string>();
const decodedMetaCache = new Map<
  string,
  { width: number; height: number; aspectRatio: number }
>();
const inflightDecodePromises = new Map<
  string,
  Promise<{ width: number; height: number; aspectRatio: number }>
>();

export function getCachedCertificateDecodedMeta(
  url: string
): { width: number; height: number; aspectRatio: number } | undefined {
  return decodedMetaCache.get(url);
}

export function loadAndDecodeCertificateImage(
  url: string,
  bypassCache = false
): Promise<{ width: number; height: number; aspectRatio: number }> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ width: 1200, height: 848, aspectRatio: 1.414 });
  }

  if (!bypassCache) {
    const cached = decodedMetaCache.get(url);
    if (cached) {
      return Promise.resolve(cached);
    }
    const inflight = inflightDecodePromises.get(url);
    if (inflight) {
      return inflight;
    }
  } else {
    decodedMetaCache.delete(url);
    inflightDecodePromises.delete(url);
  }

  const promise = new Promise<{ width: number; height: number; aspectRatio: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      const srcToLoad = bypassCache
        ? `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}`
        : url;

      let settled = false;
      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        const w = img.naturalWidth || 1200;
        const h = img.naturalHeight || 848;
        const meta = {
          width: w,
          height: h,
          aspectRatio: w > 0 && h > 0 ? w / h : 1.414,
        };
        decodedMetaCache.set(url, meta);
        inflightDecodePromises.delete(url);
        resolve(meta);
      };

      const finishError = () => {
        if (settled) return;
        settled = true;
        inflightDecodePromises.delete(url);
        reject(new Error(`Failed to load certificate image: ${url}`));
      };

      img.onload = () => {
        if (typeof img.decode === 'function') {
          img
            .decode()
            .then(finishSuccess)
            .catch(() => {
              // If img.onload already fired with valid dimensions, resolve cleanly
              if (img.naturalWidth > 0) {
                finishSuccess();
              } else {
                finishError();
              }
            });
        } else {
          finishSuccess();
        }
      };

      img.onerror = finishError;
      img.src = srcToLoad;
    }
  );

  inflightDecodePromises.set(url, promise);
  return promise;
}

export function preloadCertificateImage(url: string): void {
  if (typeof window === 'undefined' || preloadedUrls.has(url)) return;
  preloadedUrls.add(url);
  void loadAndDecodeCertificateImage(url, false).catch(() => {
    preloadedUrls.delete(url);
  });
}

