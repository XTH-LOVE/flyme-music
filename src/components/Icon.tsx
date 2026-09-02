import type { JSX } from 'react';

export type IconName =
  | 'home'
  | 'library'
  | 'compass'
  | 'user'
  | 'search'
  | 'settings'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'shuffle'
  | 'repeat'
  | 'repeatOne'
  | 'heart'
  | 'heartFill'
  | 'more'
  | 'close'
  | 'chevronLeft'
  | 'chevronRight'
  | 'queue'
  | 'lyric'
  | 'clock'
  | 'flame'
  | 'music'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'check'
  | 'download'
  | 'arrowRight'
  | 'album'
  | 'mic'
  | 'trash'
  | 'volume';

const paths: Record<IconName, JSX.Element> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />,
  library: (
    <>
      <path d="M5 20V6M9 20V4" />
      <path d="M13 5.5 19 4v13.2" />
      <circle cx="6.8" cy="20" r="0.4" fill="currentColor" />
      <ellipse cx="16.5" cy="17.6" rx="2.6" ry="2.1" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </>
  ),
  play: <path fill="currentColor" stroke="none" d="M8.2 5.4c0-.9 1-1.5 1.8-1L19 10.9c.8.5.8 1.7 0 2.2L10 19.6c-.8.5-1.8-.1-1.8-1V5.4Z" />,
  pause: <path fill="currentColor" stroke="none" d="M7 4.5c.8 0 1.5.7 1.5 1.5v12a1.5 1.5 0 0 1-3 0V6c0-.8.7-1.5 1.5-1.5Zm10 0c.8 0 1.5.7 1.5 1.5v12a1.5 1.5 0 0 1-3 0V6c0-.8.7-1.5 1.5-1.5Z" />,
  next: <path fill="currentColor" stroke="none" d="M6 6.3c0-.9 1-1.4 1.7-1L15 10.5V6.8c0-.8.7-1.4 1.4-1.4s1.4.6 1.4 1.4v10.4c0 .8-.6 1.4-1.4 1.4S15 18 15 17.2v-3.7l-7.3 5.2c-.7.5-1.7 0-1.7-1V6.3Z" />,
  prev: <path fill="currentColor" stroke="none" d="M18 6.3c0-.9-1-1.4-1.7-1L9 10.5V6.8C9 6 8.3 5.4 7.6 5.4S6.2 6 6.2 6.8v10.4c0 .8.6 1.4 1.4 1.4S9 18 9 17.2v-3.7l7.3 5.2c.7.5 1.7 0 1.7-1V6.3Z" />,
  shuffle: (
    <>
      <path d="M3 7h3.5c5.5 0 6 10 11.5 10H21" />
      <path d="M3 17h3.5c2 0 3.3-1.3 4.3-2.8M21 7h-3c-2 0-3.3 1.3-4.3 2.8" />
      <path d="m18.5 4.5 3 2.5-3 2.5M18.5 14.5l3 2.5-3 2.5" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6h12" />
      <path d="M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5h-12" />
      <path d="m17 3.5 3 2.5-3 2.5M7 15.5l-3 2.5 3 2.5" />
    </>
  ),
  repeatOne: (
    <>
      <path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6h12" />
      <path d="M20 12v2.5a3.5 3.5 0 0 1-3.5 3.5h-12" />
      <path d="m17 3.5 3 2.5-3 2.5M7 15.5l-3 2.5 3 2.5" />
      <path d="M11.2 10.6 12.6 10v4.4" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  heartFill: <path fill="currentColor" stroke="none" d="M12 20.4s-8-4.9-8-10.6A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.8c0 5.7-8 10.6-8 10.6Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  queue: (
    <>
      <path d="M4 6h16M4 11h9M4 16h9" />
      <path d="M16.5 13.2 20 12.4v6" />
      <ellipse cx="18.4" cy="18.6" rx="1.7" ry="1.3" />
    </>
  ),
  lyric: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 12.5h8M8 16h4.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flame: <path d="M12 3.5s1 2.6 3.2 4.9C17.3 10.6 18.5 12.6 18.5 15a6.5 6.5 0 0 1-13 0c0-2.3 1-4.1 2.5-5.6.4 1 .9 1.8 1.8 2.6C10.3 9.4 11.3 6.3 12 3.5Z" />,
  music: (
    <>
      <path d="M9 18.5V6l10-2v12.4" />
      <circle cx="6.5" cy="18.5" r="2.6" />
      <circle cx="16.5" cy="16.4" r="2.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />,
  monitor: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2.4" />
      <path d="M9 20.5h6M12 17.5v3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19.5h14" />,
  arrowRight: <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" />,
  album: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </>
  ),
  trash: <path d="M5 7h14M9.5 7V5h5v2M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4Z" />
      <path d="M15.2 9a4.3 4.3 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** App-wide stroke icon set (original paths, 24px grid). */
export function Icon({ name, size = 24, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
