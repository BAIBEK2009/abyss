// Drawn things for the table interface (CLAUDE.md v3.1, 18): engraved officer medallions,
// brass instruments with a needle, coloured icons for the hanging tags. All inline SVG.

let uid = 0;

// C9a: coloured portraits to the shoulders, warm engraving + watercolour (the chart's style), drawn in layers.
// Our people have Kazakh features. Parts with classes animate in CSS: .pt-lids blink, .pt-mouth talks, .pt-bust breathes.
const LOOK = {
  dana:    { skin: "#e3b48f", shade: "#b9805c", hair: "#1c1514", cloth: "#2f6f78", cloth2: "#235258", bg: "#d8c9a4", age: 0 },
  erlan:   { skin: "#d6a37c", shade: "#a87150", hair: "#16110f", cloth: "#1f2c45", cloth2: "#141d30", bg: "#cdbf9c", age: 0.3 },
  murat:   { skin: "#c48f68", shade: "#8e5a3a", hair: "#d9d6cf", cloth: "#7a5a32", cloth2: "#5a4122", bg: "#d2c19a", age: 1 },
  aigerim: { skin: "#e6b896", shade: "#bb855f", hair: "#1a1312", cloth: "#1d3557", cloth2: "#e8892a", bg: "#c8d0c4", age: 0.1 },
  berg:    { skin: "#efc9b0", shade: "#c18f74", hair: "#b8a07a", cloth: "#17191d", cloth2: "#b8322a", bg: "#b9bcbf", age: 0.6 },
};
const OLD = { vera: "dana", lev: "erlan", grisha: "murat" };

/** A portrait by person id (dana | erlan | murat | aigerim | berg; the old ids vera / lev / grisha work too). */
export function portrait(k) {
  const who = OLD[k] ?? k, L = LOOK[who] ?? LOOK.dana, id = `pt${who}${++uid}`;
  const eyes = (y) => `<g class="pt-eyes">
      <path d="M38 ${y}q5-3.2 10 0q-5 2.4-10 0z" fill="#fbf4e8"/><path d="M52 ${y}q5-3.2 10 0q-5 2.4-10 0z" fill="#fbf4e8"/>
      <circle cx="43.2" cy="${y - 0.2}" r="1.9" fill="${who === "berg" ? "#5d7d9a" : "#3a2418"}"/><circle cx="56.8" cy="${y - 0.2}" r="1.9" fill="${who === "berg" ? "#5d7d9a" : "#3a2418"}"/>
      <circle cx="43.8" cy="${y - 0.8}" r=".55" fill="#fff"/><circle cx="57.4" cy="${y - 0.8}" r=".55" fill="#fff"/>
      <path d="M37.6 ${y}q5.4-3.8 10.8 0M51.6 ${y}q5.4-3.8 10.8 0" stroke="#2a1a14" stroke-width="1.1" fill="none"/>
      <g class="pt-lids"><path d="M37.6 ${y + 0.2}q5.4-3.8 10.8 0q-5.4 1-10.8 0zM51.6 ${y + 0.2}q5.4-3.8 10.8 0q-5.4 1-10.8 0z" fill="${L.skin}"/></g></g>
    <path d="M37 ${y - 5.5}q6-${who === "berg" ? 1 : 2.4} 11-.6M52 ${y - 6.1}q5-1.8 11 .6" stroke="${who === "murat" ? "#bdb8ae" : "#2a1c16"}" stroke-width="${who === "dana" || who === "aigerim" ? 1.3 : 2}" fill="none" stroke-linecap="round"/>`;
  const nose = `<path d="M50 54c-1 5-2.4 8-3.4 9.4q3.4 1.6 6.6 0" stroke="${L.shade}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const mouth = (w = 7) => `<g class="pt-mouth"><path d="M${50 - w / 2} 70.5q${w / 2} 2.2 ${w} 0" stroke="#7a3a30" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <ellipse class="pt-open" cx="50" cy="71.2" rx="${w / 2.6}" ry="1.6" fill="#5a2420" opacity="0"/></g>`;
  const wrinkles = L.age > 0.5 ? `<path d="M36 51q-2 2-1 5M64 51q2 2 1 5M42 45h6M52 45h6M41 63q-2 3 0 6M59 63q2 3 0 6" stroke="${L.shade}" stroke-width=".8" fill="none" opacity=".8"/>` : "";
  const parts = {
    dana: { back: `<path d="M30 52c-2-20 8-31 20-31s22 11 20 31c-2-6-6-13-20-13s-18 7-20 13z" fill="${L.hair}"/><ellipse cx="50" cy="20" rx="9" ry="7" fill="${L.hair}"/>`,
            front: `<path d="M34 46c2-10 8-14 16-14s14 4 16 14c-5-5-10-7-16-7s-11 2-16 7z" fill="${L.hair}"/>
                    <g fill="none" stroke="#3a3a42" stroke-width="1.3"><rect x="37" y="51.2" width="11.5" height="7" rx="3"/><rect x="51.5" y="51.2" width="11.5" height="7" rx="3"/><path d="M48.5 54h3M37 53.5l-3-1M63 53.5l3-1"/></g>`,
            extra: `<rect x="60" y="96" width="22" height="28" rx="2" fill="#2b2f36" transform="rotate(-12 71 110)"/><rect x="62.5" y="99" width="17" height="21" rx="1" fill="#7fd0c8" transform="rotate(-12 71 110)"/><path d="M65 112l4-5 3 3 4-6" stroke="#1d4a50" stroke-width="1.2" fill="none" transform="rotate(-12 71 110)"/>` },
    erlan: { back: `<path d="M33 50c-1-17 7-26 17-26s18 9 17 26c-3-7-8-11-17-11s-14 4-17 11z" fill="${L.hair}"/>`,
             front: `<path d="M36 45c3-8 8-11 14-11s11 3 14 11c-4-3-9-4-14-4s-10 1-14 4z" fill="${L.hair}"/>
                     <path d="M38 66c2 10 7 14 12 14s10-4 12-14c-2 4-6 6-12 6s-10-2-12-6z" fill="${L.hair}" opacity=".85"/>`,
             extra: `<rect x="14" y="98" width="20" height="5" rx="1.5" fill="#c9a646"/><rect x="66" y="98" width="20" height="5" rx="1.5" fill="#c9a646"/><path d="M18 100.5h12M70 100.5h12" stroke="#7a5a1a" stroke-width=".8"/>
                     <circle cx="50" cy="104" r="1.6" fill="#c9a646"/><circle cx="50" cy="114" r="1.6" fill="#c9a646"/>` },
    murat: { back: ``,
             front: `<path d="M31 47c0-14 8-22 19-22s19 8 19 22z" fill="#6b2a22"/><g stroke="#4a1a14" stroke-width="1.1">${Array.from({ length: 9 }, (_, i) => `<path d="M${33 + i * 4} 46v-${8 + (i % 2) * 2}"/>`).join("")}</g>
                     <rect x="30" y="42" width="40" height="7" rx="3.4" fill="#541f19"/>
                     <path d="M40 66q10-5 20 0q-2 4-10 3q-8 1-10-3z" fill="${L.hair}"/>`,
             extra: `<path d="M30 96l8 26M70 96l-8 26" stroke="#3a2a14" stroke-width="1.4"/><rect x="58" y="104" width="10" height="7" rx="1" fill="#5a4122" stroke="#3a2a14" stroke-width=".8"/>` },
    aigerim: { back: `<path d="M31 54c-2-20 8-31 19-31s21 11 19 31c-2-6-7-14-19-14s-17 8-19 14z" fill="${L.hair}"/><path d="M32 54c-2 14 0 26 4 34M68 54c2 14 0 26-4 34" stroke="${L.hair}" stroke-width="6" fill="none"/>`,
               front: `<path d="M34 47c2-10 8-14 16-14s14 4 16 14c-6-6-11-7-16-7s-10 1-16 7z" fill="${L.hair}"/>
                       <path d="M30 52a20 22 0 0 1 40 0" stroke="#22262c" stroke-width="2.6" fill="none"/><rect x="26" y="50" width="7" height="12" rx="3" fill="#22262c"/><rect x="67" y="50" width="7" height="12" rx="3" fill="#22262c"/>
                       <path d="M30 60q2 12 12 12" stroke="#22262c" stroke-width="1.6" fill="none"/><circle cx="43" cy="72" r="1.8" fill="#22262c"/>`,
               extra: `<path d="M8 124c3-22 18-34 42-34s39 12 42 34" fill="none"/><rect x="24" y="100" width="14" height="5" rx="1" fill="${L.cloth2}"/><path d="M62 98h16v8H62z" fill="#efe6d2"/><path d="M64 101h12M64 103.5h8" stroke="#1d3557" stroke-width=".8"/>` },
    berg: { back: `<path d="M33 48c0-15 8-22 17-22s17 7 17 22c-3-6-8-9-17-9s-14 3-17 9z" fill="${L.hair}"/>`,
            front: `<path d="M35 44c3-7 8-10 15-10s12 3 15 10c-5-3-9-3.6-15-3.6s-10 .6-15 3.6z" fill="${L.hair}"/><path d="M38 64q-1 6 2 10M62 64q1 6-2 10" stroke="${L.shade}" stroke-width=".9" fill="none"/>`,
            extra: `<rect x="62" y="102" width="12" height="8" rx="1" fill="${L.cloth2}"/><path d="M64 106h8" stroke="#fff" stroke-width=".8"/><path d="M44 92l6 10 6-10" fill="#2a2d33"/>` },
  }[who] ?? { back: "", front: "", extra: "" };
  return `<svg class="medal pt-${who}" viewBox="0 0 100 122" aria-hidden="true"><defs>
    <radialGradient id="${id}b" cx="40%" cy="30%"><stop offset="0" stop-color="#f7dc98"/><stop offset=".55" stop-color="#b98a3e"/><stop offset="1" stop-color="#5a3c14"/></radialGradient>
    <radialGradient id="${id}bg" cx="35%" cy="25%"><stop offset="0" stop-color="#fbf3df"/><stop offset="1" stop-color="${L.bg}"/></radialGradient>
    <radialGradient id="${id}sk" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="${L.skin}"/><stop offset=".75" stop-color="${L.skin}"/><stop offset="1" stop-color="${L.shade}"/></radialGradient>
    <linearGradient id="${id}cl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L.cloth}"/><stop offset="1" stop-color="${L.cloth2 === "#e8892a" || L.cloth2 === "#b8322a" ? L.cloth : L.cloth2}"/></linearGradient>
    <pattern id="${id}h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0v3" stroke="#2b1a10" stroke-width=".7"/></pattern>
    <clipPath id="${id}c"><ellipse cx="50" cy="61" rx="40" ry="52"/></clipPath></defs>
    <ellipse cx="50" cy="61" rx="45" ry="57" fill="url(#${id}b)"/>
    <g clip-path="url(#${id}c)">
      <rect width="100" height="122" fill="url(#${id}bg)"/>
      <g class="pt-bust"><g class="pt-head">
        ${parts.back}
        <path d="M8 124c3-22 18-33 42-33s39 11 42 33z" fill="url(#${id}cl)" stroke="#23222b" stroke-width="1"/>
        <path d="M60 92c16 3 28 13 32 32H66c0-12-2-24-6-32z" fill="url(#${id}h)" opacity=".35"/>
        <path d="M43 74v13q7 6 14 0V74" fill="${L.shade}"/>
        <path d="M34 56c0-14 7-22 16-22s16 8 16 22c0 13-7 22-16 22s-16-9-16-22z" fill="url(#${id}sk)" stroke="#5a3a28" stroke-width=".9"/>
        <path d="M58 40c6 4 8 10 8 16 0 10-4 18-12 21 5-6 6-13 6-20s-1-12-2-17z" fill="url(#${id}h)" opacity=".28"/>
        <ellipse cx="40" cy="63" rx="4" ry="2.4" fill="#d9776a" opacity="${who === "murat" ? 0.35 : 0.22}"/><ellipse cx="60" cy="63" rx="4" ry="2.4" fill="#d9776a" opacity="${who === "murat" ? 0.35 : 0.22}"/>
        ${eyes(53)}${nose}${mouth(who === "murat" ? 8 : 7)}${wrinkles}
        ${parts.front}
      </g>${parts.extra}</g>
    </g>
    ${who === "aigerim" || who === "berg" ? `<rect class="pt-noise" x="10" y="9" width="80" height="104" fill="url(#${id}h)" opacity="0"/>` : ""}
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
