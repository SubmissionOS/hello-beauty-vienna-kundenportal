/** Eigene Linien-Icons (24 × 24, 1,75 px), keine fremden Icon-Sets. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9v10.5h4.5v-6h4v6h4.5V9" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconPlusCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </Svg>
);
export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconPhone = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.25" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconShareIos = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5v11M8 7.5l4-4 4 4" />
    <path d="M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
  </Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="18.5" cy="12" r="1.8" />
  </Svg>
);
export const IconMoreVertical = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <circle cx="12" cy="5.5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="18.5" r="1.8" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
    <path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13" />
  </Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M10 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h4M15 8l4 4-4 4M19 12H9.5" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5Z" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" />
  </Svg>
);
export const IconReplay = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
    <path d="M4.5 4.5V9H9" />
  </Svg>
);
export const IconArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 4.5v15M6 13.5l6 6 6-6" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconWifiOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14.5 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.9M11 5.6A15 15 0 0 1 22 9.5" />
    <circle cx="12" cy="20" r="0.8" fill="currentColor" />
  </Svg>
);
