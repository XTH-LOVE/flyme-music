/**
 * The Netease Cloud Music mark, drawn rather than imported.
 *
 * The avatar corner used to show a generic music note, which said "this is a
 * music app" where the badge is supposed to say "this account is a Netease
 * account". A brand mark has to be the brand's own shape to carry that.
 *
 * Drawn as a vector rather than shipped as an image: it appears at 12-20px, and
 * a raster at that size is blurry on every phone made in the last decade. It is
 * also one file smaller to download.
 *
 * The red is the brand's. It is the one place in this app where a colour is
 * deliberately not from the theme - a recoloured logo is not a logo.
 */
export function NeteaseMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="网易云音乐"
      focusable="false"
    >
      <circle cx="12" cy="12" r="12" fill="#C20C0C" />
      {/* The note: a stem with a flag, and a head. Simplified to what survives
          at this size rather than tracing the full mark. */}
      <path
        fill="#fff"
        d="M15.9 5.2c0-.5-.4-.9-.9-.9-.5 0-.9.4-.9.9v8.3a3.1 3.1 0 0 0-1.6-.4c-1.7 0-3.1 1.3-3.1 2.9s1.4 2.9 3.1 2.9 3.1-1.3 3.1-2.9V8.4l1.6 1c.4.3 1 .2 1.2-.3.2-.4.1-.9-.3-1.2l-2.2-1.4V5.2Z"
      />
      <path
        fill="#fff"
        opacity="0.85"
        d="M8.4 9.6c-.5-.1-.9.2-1 .7l-.5 2.4a2.4 2.4 0 0 0-1.2-.3c-1.3 0-2.4 1-2.4 2.3s1.1 2.3 2.4 2.3 2.4-1 2.4-2.3V9.6Z"
      />
    </svg>
  );
}
