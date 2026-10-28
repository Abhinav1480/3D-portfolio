// Portfolio Content (Section 10 & Fix 1)
// Contains zero internal notes or build status text. Missing fields are omitted silently.

export interface ProjectData {
  id: 'examos' | 'sih' | 'clinic-desk' | 'stock-pilot';
  pageIndex: number; // P2..P5 on Projects screen
  shortTitle: string;
  fullTitle: string;
  role?: string;
  oneLineSummary?: string;
  chips: string[];
  gradientKey: 'examos' | 'sih' | 'clinic' | 'stockpilot';
  problem?: string;
  features?: string[];
  stack?: string[];
  repoUrl: string;
  liveUrl?: string;
}

export interface SkillCategory {
  id: string;
  title: string;
  colorKey: 'frontend' | 'backend' | 'databases' | 'creative3d' | 'tools';
  items: string[];
}

export interface ExperienceItem {
  title: string;
  organization: string;
  category: 'internship' | 'community' | 'hackathon';
  summary: string;
  proofUrl?: string;
}

export const PORTFOLIO_CONTENT = {
  profile: {
    name: 'Abhinav',
    fullName: 'Abhinav Nakka',
    uppercaseName: 'ABHINAV',
    headline: 'Full-Stack Developer | UI Engineer | Creative Developer',
    shortChip: 'ABHINAV | Full-Stack & UI Engineer',
    tvTagline: 'Full-Stack & UI Engineer · Building Interactive Web Products',
    githubUrl: 'https://github.com/Abhinav1480',
    linkedinUrl: 'https://www.linkedin.com/in/abhinav-nakka-5133b1356/',
    whatsappUrl: 'https://wa.me/919392380501',
    phoneDisplay: '+91 93923 80501',
    email: 'nakkaabhinav19@gmail.com',
    location: 'Hyderabad, India',
    // TODO: Add resumeUrl (e.g. '/Abhinav_Nakka_Resume.pdf') when your resume PDF is ready to host
  },

  about: {
    page1: {
      kicker: '01 / ABOUT ME',
      title: 'Building interactive web products from UI to backend.',
      intro:
        'I am Abhinav Nakka, a full-stack developer and UI engineer focused on clean interfaces, interactive 3D web experiences, and practical software that people actually use.',
      focusPoints: [
        'Full-stack web applications with React, Next.js, TypeScript, and Node.js',
        'UI engineering, responsive design systems, and tactile micro-interactions',
        'Interactive 3D web experiences built with Three.js, React Three Fiber, and GSAP',
      ],
    },
    page2: {
      kicker: '01 / EDUCATION & LOCATION',
      title: 'Academic Background & Base',
      degree: 'B.Tech in Computer Science and Engineering',
      institution: 'Vidya Jyothi Institute of Technology (VJIT), Hyderabad',
      yearStatus: 'Third-year undergraduate student',
      location: 'Hyderabad, Telangana, India',
      availability: 'Open to software engineering and UI engineering internships',
    },
  },

  skills: [
    {
      id: 'frontend',
      title: 'Frontend',
      colorKey: 'frontend',
      items: ['React.js', 'Next.js', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Tailwind CSS'],
    },
    {
      id: 'backend',
      title: 'Backend',
      colorKey: 'backend',
      items: ['Node.js', 'Express.js', 'REST APIs'],
    },
    {
      id: 'databases',
      title: 'Databases & Services',
      colorKey: 'databases',
      items: ['MongoDB', 'Mongoose', 'Firebase'],
    },
    {
      id: 'creative3d',
      title: '3D & Creative',
      colorKey: 'creative3d',
      items: ['Three.js', 'React Three Fiber', 'GSAP'],
    },
    {
      id: 'tools',
      title: 'Tools',
      colorKey: 'tools',
      items: ['Git', 'GitHub', 'Vercel'],
    },
  ] satisfies SkillCategory[],

  projects: [
    {
      id: 'examos',
      pageIndex: 1,
      shortTitle: 'ExamOS',
      fullTitle: 'ExamOS — Student Study Platform',
      oneLineSummary: 'Offline-first student workspace for PDFs, notes, schedules, and focus.',
      chips: ['JavaScript', 'Firebase'],
      gradientKey: 'examos',
      problem:
        'Students juggle scattered PDFs, DOCX notes, slides, and timers across multiple tabs without a unified study workspace.',
      features: [
        'Subject library with built-in PDF.js, Mammoth DOCX, and JSZip PPTX document viewers',
        'Structured study notes editor with one-click export and cloud workspace sync',
        'Focus Sanctuary with Pomodoro timer, fullscreen Zen Mode, and weekly study planner',
      ],
      stack: ['JavaScript', 'HTML5', 'CSS3', 'Firebase', 'PDF.js', 'Vercel'],
      repoUrl: 'https://github.com/Abhinav1480/ExamOS',
      liveUrl: 'https://exam-os-seven.vercel.app/',
    },
    {
      id: 'sih',
      pageIndex: 2,
      shortTitle: 'ORCA',
      fullTitle: 'ORCA — Marine Ecosystem Reasoning with Collaborative Agents',
      oneLineSummary:
        'Multi-agent marine intelligence for ocean, weather, fisheries, and geospatial risk analysis.',
      chips: ['Next.js', 'FastAPI'],
      gradientKey: 'sih',
      problem:
        'Fragmented oceanographic, weather, and fisheries datasets make real-time marine risk assessment and sanctuary geofencing difficult.',
      features: [
        'Collaborative specialist agents for Ocean, Weather, Fishery, Geo, Vessel, and Risk reasoning',
        'Deterministic 0–100 marine risk engine using INCOIS wave height and IMD wind thresholds',
        'Exact point-in-polygon GIS geofencing across Indian Marine Protected Areas on Leaflet maps',
      ],
      stack: ['Next.js 14', 'TypeScript', 'FastAPI', 'Leaflet', 'Shapely / PostGIS'],
      repoUrl: 'https://github.com/Abhinav1480/sih',
      // TODO: Add liveUrl for ORCA if a public live demo deployment URL becomes available
    },
    {
      id: 'clinic-desk',
      pageIndex: 3,
      shortTitle: 'Clinic Desk',
      fullTitle: 'Clinic Desk — Longitudinal Clinical Memory',
      oneLineSummary: 'Doctor assistant recalling patient charts & clinic-wide outcomes.',
      chips: ['Next.js 15', 'TypeScript'],
      gradientKey: 'clinic',
      problem:
        'Family doctors have roughly 20 seconds per visit to recall scattered patient histories, allergies, and prior treatment outcomes.',
      features: [
        'Dual Hindsight memory banks separating patient-tagged charts from anonymised clinic outcomes',
        'Cited pre-visit briefs highlighting allergies, prior drug failures, and similar cases',
        'Live Hindsight Trace and Evidence Explorer linking clinical claims to stored memory',
      ],
      stack: ['Next.js 15', 'TypeScript', 'Hindsight Memory SDK', 'Groq API', 'Tailwind CSS'],
      repoUrl: 'https://github.com/vedant7007/clinic-desk',
      // TODO: Add liveUrl for Clinic Desk if a public live demo deployment URL becomes available
    },
    {
      id: 'stock-pilot',
      pageIndex: 4,
      shortTitle: 'StockPilot',
      fullTitle: 'StockPilot',
      oneLineSummary:
        'AI-powered inventory and warehouse management platform for managing products, stock, warehouses, suppliers, and operations.',
      chips: ['Next.js', 'TypeScript'],
      gradientKey: 'stockpilot',
      problem:
        'An AI-powered inventory and warehouse management platform built to streamline stock operations through intelligent product extraction, organizational access controls, and inventory analytics.',
      features: [
        'AI-Powered Product Extraction: Supports extracting product information from vendor receipts, invoices, or barcodes, with a review interface for checking and editing extracted details.',
        'Inventory & Warehouse Management: Organizes inventory across warehouse locations, supports purchase and sales workflows, and highlights low-stock items.',
        'Analytics & Access Control: Includes inventory analytics, activity timelines, organizational separation, and role-based permissions.',
      ],
      stack: ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'Tailwind CSS', 'Google Gemini AI'],
      repoUrl: 'https://github.com/Abhinav1480/stock-pilot',
      liveUrl: 'https://stock-pilot-8a2z.vercel.app/',
    },
  ] satisfies ProjectData[],

  experience: {
    page1: [
      {
        title: 'Web Development Intern',
        organization: 'InAmigos Foundation',
        category: 'internship',
        summary: 'Contributed to web development initiatives and frontend implementation.',
        proofUrl: 'https://github.com/Abhinav1480/InAmigos',
      },
      {
        title: 'AWS Student Community — VJIT',
        organization: 'VJIT, Hyderabad · Community & Event Web Development',
        category: 'community',
        summary:
          'Involved in student community initiatives and website development and event preparation for AWS Student Community Day.',
        proofUrl: 'https://github.com/Abhinav1480/awssbg-vjit-website',
      },
      {
        title: 'Student Builder Group — Member',
        organization: 'AWS Student Builder Group · VJIT, Hyderabad',
        category: 'community',
        summary:
          'Collaborated with student builders on cloud fundamentals, community projects, and the official group website.',
      },
      {
        title: 'Student Community Involvement',
        organization: 'Google Ambassador / Campus Tech Communities',
        category: 'community',
        summary:
          'Active participant in student developer initiatives, peer workshops, and cloud/web technology events.',
      },
    ] satisfies ExperienceItem[],
    page2: [
      {
        title: 'Smart India Hackathon (SIH 2026)',
        organization: 'ISRO Problem Statement 26176 — Disaster Management',
        category: 'hackathon',
        summary:
          'Engineered ORCA, a collaborative multi-agent marine intelligence and GIS geofencing platform.',
        proofUrl: 'https://github.com/Abhinav1480/sih',
      },
      {
        title: 'Replit Vibrathon',
        organization: 'Hackathon Participant',
        category: 'hackathon',
        summary:
          'Rapid product prototyping focused on full-stack web workflows and interactive user interfaces.',
      },
      {
        title: 'ACM KLH HackWithAI',
        organization: 'AI & Full-Stack Hackathon',
        category: 'hackathon',
        summary:
          'Built practical AI-assisted software prototypes combining clean frontend UX with modern APIs.',
      },
    ] satisfies ExperienceItem[],
  },

  contact: {
    name: 'Abhinav Nakka',
    role: 'Full-Stack Developer | UI Engineer | Creative Developer',
    title: "Let's Build Something Together",
    subtitle: 'Available for full-stack, frontend, and creative developer internships.',
    github: {
      label: 'GitHub Profile',
      handle: 'github.com/Abhinav1480',
      url: 'https://github.com/Abhinav1480',
    },
    linkedin: {
      label: 'LinkedIn Profile',
      handle: 'linkedin.com/in/abhinav-nakka-5133b1356/',
      url: 'https://www.linkedin.com/in/abhinav-nakka-5133b1356/',
    },
    phone: {
      label: 'Phone / WhatsApp',
      display: '+91 93923 80501',
      url: 'https://wa.me/919392380501',
    },
    email: {
      label: 'Email',
      address: 'nakkaabhinav19@gmail.com',
      url: 'mailto:nakkaabhinav19@gmail.com',
    },
  },
} as const;
