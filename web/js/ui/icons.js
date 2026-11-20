// Inline SVG icons (no emoji, no icon fonts): each is a small stroke drawing in currentColor.

const svg = (body, vb = "0 0 24 24") =>
  `<svg class="icon" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>'),
  clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>'),
  fuel: svg('<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z"/>'),
  stand: svg('<path d="M4 20h16"/><path d="M7 20v-6h10v6"/><path d="M12 4v6"/><path d="M9 7l3-3 3 3"/>'),
  autopilot: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M12 3.5V10M12 14v6.5M3.5 12H10M14 12h6.5"/>'),
  journal: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>'),
  hints: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  sound: svg('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  ship: svg('<path d="M3 15h18l-2.5 4h-13z"/><path d="M7 15V10h8v5"/><path d="M11 10V6"/><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>'),
  sonar: svg('<circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'),
  dive: svg('<circle cx="12" cy="13" r="6"/><circle cx="12" cy="13" r="2.4"/><path d="M12 3v4"/><path d="M8 20l-1.5 2M16 20l1.5 2"/>'),
  move: svg('<circle cx="5" cy="18" r="1.4" fill="currentColor"/><circle cx="10" cy="14" r="1.2" fill="currentColor"/><circle cx="14" cy="10" r="1.2" fill="currentColor"/><path d="M17 4l3 3-3 3"/><path d="M20 7h-4"/>'),
  home: svg('<path d="M12 3l2 3v13h-4V6z"/><path d="M9 21h6"/><path d="M6 8l3 1M18 8l-3 1"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  warn: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
  radio: svg('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l9-5"/><circle cx="15.5" cy="14" r="3"/><path d="M6 12h4M6 15h4"/>'),
};

/** Officer portraits: simple silhouettes, each with its own colour and accessory. */
export const PORTRAITS = {
  vera: `<svg viewBox="0 0 64 64" class="portrait" aria-hidden="true">
    <rect width="64" height="64" rx="8" fill="#2F7D86"/>
    <path d="M14 64c2-13 9-19 18-19s16 6 18 19z" fill="#1e5157"/>
    <circle cx="32" cy="28" r="11" fill="#f1d9bd"/>
    <path d="M20 28c0-10 6-15 12-15s12 5 12 15c-2-5-6-8-12-8s-10 3-12 8z" fill="#3b2a22"/>
    <path d="M21 30c-2 6 0 12 3 14M43 30c2 6 0 12-3 14" stroke="#3b2a22" stroke-width="3" fill="none"/>
    <circle cx="27.5" cy="29" r="3.6" fill="none" stroke="#1f2a33" stroke-width="1.6"/>
    <circle cx="36.5" cy="29" r="3.6" fill="none" stroke="#1f2a33" stroke-width="1.6"/>
    <path d="M31.1 29h1.8" stroke="#1f2a33" stroke-width="1.6"/></svg>`,
  lev: `<svg viewBox="0 0 64 64" class="portrait" aria-hidden="true">
    <rect width="64" height="64" rx="8" fill="#2E4E7A"/>
    <path d="M14 64c2-13 9-19 18-19s16 6 18 19z" fill="#1c3354"/>
    <path d="M26 46l6 6 6-6" fill="#f4efe4"/>
    <circle cx="32" cy="30" r="11" fill="#eccfb0"/>
    <path d="M19 23c1-6 6-9 13-9s12 3 13 9z" fill="#f4efe4"/>
    <path d="M18 24h28l-2 3H20z" fill="#1c2430"/>
    <circle cx="32" cy="19" r="2" fill="#B8893B"/></svg>`,
  grisha: `<svg viewBox="0 0 64 64" class="portrait" aria-hidden="true">
    <rect width="64" height="64" rx="8" fill="#B07A2C"/>
    <path d="M12 64c2-13 10-19 20-19s18 6 20 19z" fill="#5b4122"/>
    <circle cx="32" cy="30" r="11.5" fill="#e8c9a6"/>
    <path d="M21 32c1 10 6 14 11 14s10-4 11-14c-3 3-7 4-11 4s-8-1-11-4z" fill="#8a6a4a"/>
    <path d="M19 26c0-9 6-13 13-13s13 4 13 13z" fill="#7a2f22"/>
    <path d="M18 26h28v3H18z" fill="#5e2219"/>
    <circle cx="32" cy="12" r="2.5" fill="#7a2f22"/></svg>`,
};
