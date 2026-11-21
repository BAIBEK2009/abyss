// Drawn things for the table interface (CLAUDE.md v3.1, 18): engraved officer medallions,
// brass instruments with a needle, coloured icons for the hanging tags. All inline SVG.

let uid = 0;

/** Engraved medallion portrait: vera (glasses), lev (cap), grisha (hat + beard). */
export function portrait(k) {
  const id = `pt${k}${++uid}`;
  const acc = {
    vera: `<path d="M33 46c0-14 7-21 17-21s17 7 17 21c-4-7-10-9-17-9s-13 2-17 9z" fill="#2b2228"/><ellipse cx="50" cy="25" rx="8" ry="6" fill="#2b2228"/><circle cx="43.5" cy="52" r="4.6" fill="none" stroke="#23222b" stroke-width="1.6"/><circle cx="56.5" cy="52" r="4.6" fill="none" stroke="#23222b" stroke-width="1.6"/><path d="M48 52h4" stroke="#23222b" stroke-width="1.6"/><path d="M38 86l12 10 12-10" fill="none" stroke="#23222b" stroke-width="1.4"/>`,
    lev: `<path d="M31 42c3-11 11-15 19-15s16 4 19 15z" fill="#1d2433"/><rect x="29" y="40" width="42" height="6" rx="3" fill="#121722"/><path d="M33 46h34" stroke="#c39447" stroke-width="1.2"/><circle cx="50" cy="35" r="3" fill="#c39447"/><circle cx="44" cy="54" r="1.4" fill="#23222b"/><circle cx="56" cy="54" r="1.4" fill="#23222b"/><path d="M44 66c4 2 8 2 12 0" stroke="#23222b" stroke-width="1.4" fill="none"/><path d="M40 92v26M60 92v26" stroke="#23222b" stroke-width="1"/><circle cx="44" cy="100" r="1.6" fill="#c39447"/><circle cx="44" cy="108" r="1.6" fill="#c39447"/><circle cx="56" cy="100" r="1.6" fill="#c39447"/><circle cx="56" cy="108" r="1.6" fill="#c39447"/>`,
    grisha: `<path d="M32 46c0-12 8-19 18-19s18 7 18 19z" fill="#5b2a1f"/><rect x="31" y="43" width="38" height="6" rx="3" fill="#43201a"/><path d="M36 60c1 13 7 19 14 19s13-6 14-19c-3 5-8 7-14 7s-11-2-14-7z" fill="#5d4030"/><circle cx="44" cy="55" r="1.4" fill="#23222b"/><circle cx="56" cy="55" r="1.4" fill="#23222b"/><path d="M36 90c6 4 22 4 28 0" stroke="#23222b" stroke-width="5" fill="none" opacity=".55"/>`,
  }[k];
  return `<svg class="medal" viewBox="0 0 100 122" aria-hidden="true"><defs>
    <pattern id="${id}h" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3.2" stroke="#23222b" stroke-width="1.05"/></pattern>
    <pattern id="${id}x" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0v3.4" stroke="#23222b" stroke-width=".7"/></pattern>
    <radialGradient id="${id}b" cx="40%" cy="30%"><stop offset="0" stop-color="#f7dc98"/><stop offset=".55" stop-color="#b98a3e"/><stop offset="1" stop-color="#5a3c14"/></radialGradient>
    <radialGradient id="${id}s" cx="45%" cy="40%"><stop offset="0" stop-color="#f2e6c8"/><stop offset="1" stop-color="#cbb98f"/></radialGradient>
    <clipPath id="${id}c"><ellipse cx="50" cy="61" rx="40" ry="52"/></clipPath></defs>
    <ellipse cx="50" cy="61" rx="45" ry="57" fill="url(#${id}b)"/><ellipse cx="50" cy="61" rx="40" ry="52" fill="url(#${id}s)"/>
    <g clip-path="url(#${id}c)">
      <rect x="0" y="0" width="100" height="122" fill="url(#${id}x)" opacity=".18"/>
      <path d="M8 124c3-22 18-34 42-34s39 12 42 34z" fill="#efe3c6" stroke="#23222b" stroke-width="1.4"/>
      <path d="M50 90c24 0 39 12 42 34H60c0-14-4-26-10-34z" fill="url(#${id}h)" opacity=".85"/>
      <path d="M44 74v14c0 4 12 4 12 0V74" fill="#efe3c6" stroke="#23222b" stroke-width="1.3"/>
      <ellipse cx="50" cy="55" rx="15" ry="19" fill="#f2e6c8" stroke="#23222b" stroke-width="1.5"/>
      <path d="M52 37c8 2 13 9 13 18s-5 16-13 18c5-5 7-11 7-18s-2-13-7-18z" fill="url(#${id}h)" opacity=".8"/>
      <path d="M50 54v8l-2 2" stroke="#23222b" stroke-width="1.2" fill="none"/>
      ${acc}
    </g>
    <ellipse cx="50" cy="61" rx="40" ry="52" fill="none" stroke="#5a3c14" stroke-width="1.2"/></svg>`;
}

const SV = 'viewBox="0 0 40 40" fill="none" stroke="#23222b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
/** Coloured icons for the paper tags. */
export const TAG_ICONS = {
  sonar: `<svg ${SV}><circle cx="20" cy="22" r="3.4" fill="#2f7d86" stroke="#23222b"/><path d="M13 15a10 10 0 0 0 0 14M27 15a10 10 0 0 1 0 14M8 10a17 17 0 0 0 0 24M32 10a17 17 0 0 1 0 24"/><path d="M14 6h12" stroke="#c39447"/></svg>`,
  dive: `<svg ${SV}><path d="M20 3v7"/><circle cx="20" cy="20" r="9.5" fill="#f2b632"/><circle cx="20" cy="20" r="4" fill="#9fd0dc"/><path d="M11 29l-3 4M29 29l3 4M7 37c4 2 9 2 13 0s9-2 13 0"/></svg>`,
  move: `<svg ${SV}><circle cx="8" cy="31" r="2.4" fill="#1f3550" stroke="none"/><circle cx="15" cy="24" r="2" fill="#1f3550" stroke="none"/><circle cx="21" cy="18" r="2" fill="#1f3550" stroke="none"/><path d="M26 8l7 1-1 7"/><path d="M32 9L24 17"/><path d="M5 37c4 2 9 2 13 0s9-2 13 0"/></svg>`,
  home: `<svg ${SV}><path d="M16 33l2-21h4l2 21z" fill="#f2ede2"/><path d="M16.7 26h6.6M17.4 19h5.2" stroke="#a8392a" stroke-width="3"/><circle cx="20" cy="9" r="2.6" fill="#ffd27a"/><path d="M8 7l6 2M32 7l-6 2"/><path d="M6 37c4 2 9 2 13 0s9-2 13 0"/></svg>`,
  check: `<svg viewBox="0 0 40 40" fill="none" stroke="#2a1c0a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke-width="2"/><path d="M12 21l6 6 11-13"/></svg>`,
};

/**
 * A brass instrument. kind "beacon" (a clock face, 120 h, counts down) or "fuel" (270° gauge, 0..100).
 * The needle is a <g class="needle"> rotated by CSS, so it swings with a spring (see game.css).
 */
export function dialSvg(kind) {
  const id = `dl${kind}${++uid}`, R = 46, cx = 60, cy = 60, fuel = kind === "fuel", max = fuel ? 100 : 120;
  const a0 = fuel ? -225 : -90, span = fuel ? 270 : 360, n = fuel ? 10 : 12;
  let ticks = "", nums = "";
  for (let i = 0; i <= n; i++) {
    if (!fuel && i === n) break;
    const a = ((a0 + (span * i) / n) * Math.PI) / 180, big = fuel ? i % 5 === 0 : i % 3 === 0;
    const r1 = R - 2, r2 = R - (big ? 9 : 5);
    ticks += `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="#23222b" stroke-width="${big ? 1.8 : 1}"/>`;
    if (big) {
      const rr = R - 17;
      nums += `<text x="${cx + Math.cos(a) * rr}" y="${cy + Math.sin(a) * rr + 3.5}" text-anchor="middle" font-family="Cormorant Garamond" font-weight="700" font-size="10" fill="#23222b">${fuel ? i * 10 : 120 - i * 10}</text>`;
    }
  }
  const arc = (v0, v1) => {
    const s = ((a0 + (span * v0) / max) * Math.PI) / 180, e = ((a0 + (span * v1) / max) * Math.PI) / 180, r = R - 4;
    return `M${cx + Math.cos(s) * r} ${cy + Math.sin(s) * r}A${r} ${r} 0 ${((v1 - v0) / max) * span > 180 ? 1 : 0} 1 ${cx + Math.cos(e) * r} ${cy + Math.sin(e) * r}`;
  };
  const red = fuel ? arc(0, 35) : arc(max - 30, max);
  // the needle points to 3 o'clock at 0°; the CSS rotation turns it
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs>
    <radialGradient id="${id}b" cx="35%" cy="30%"><stop offset="0" stop-color="#f8dfa0"/><stop offset=".5" stop-color="#c39447"/><stop offset="1" stop-color="#5a3c14"/></radialGradient>
    <radialGradient id="${id}f" cx="45%" cy="40%"><stop offset="0" stop-color="#f7efd9"/><stop offset="1" stop-color="#d9c9a2"/></radialGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <circle cx="60" cy="60" r="58" fill="url(#${id}b)"/><circle cx="60" cy="60" r="52" fill="#3a2810"/><circle cx="60" cy="60" r="50" fill="url(#${id}f)"/>
    <path d="${red}" stroke="#a8392a" stroke-width="5" fill="none" opacity=".8"/>${ticks}${nums}
    <text class="dial-value" x="60" y="${fuel ? 84 : 80}" text-anchor="middle" font-family="Cormorant Garamond" font-weight="700" font-size="17" fill="#23222b"></text>
    <g class="needle" style="transform-origin: 60px 60px"><path d="M52 60L${60 + R - 8} 60" stroke="#8e2f1f" stroke-width="2.6" stroke-linecap="round"/></g>
    <circle cx="60" cy="60" r="4.5" fill="url(#${id}b)" stroke="#3a2810"/>
    <circle cx="60" cy="60" r="50" fill="url(#${id}g)"/></svg>`;
}

/** Needle angle in degrees for a value. */
export function dialAngle(kind, value) {
  const fuel = kind === "fuel", max = fuel ? 100 : 120;
  const v = Math.max(0, Math.min(max, fuel ? value : max - value));
  return (fuel ? -225 : -90) + ((fuel ? 270 : 360) * v) / max;
}
