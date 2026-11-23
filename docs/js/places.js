// Place names instead of coordinates (CLAUDE.md v3.1, 18: no A10/F5 in the interface).
// Every cell is named after the nearest landmark on the chart ("by Gull Rocks"), or with a direction
// ("east of Gull Rocks"). Coordinates stay only in the professor's journal and in exam mode.
// The same names are written on the chart texture (scenes/chart.js), so the words match the map.
// The chart names come from story*.json -> map_names (key = the old name); the sentence forms are in
// web/i18n: pl_<id>_at ("by ..."), pl_<id>_to ("to ..."), pl_<id>_gen (the {p} of pl_dir_<sector>).
import { t, cap } from "./i18n.js";
import { chartName } from "./story.js";

// u, v = map units (cell x + .5, y + .5); r = how far "by ..." reaches; area = a basin ("in ...")
const LANDMARKS = [
  { id: "ridge", u: 2.5, v: 2.0, r: 0.95, label: [2.7, 0.55, -0.08, 0.27] },
  { id: "twins", u: 7.5, v: 1.4, r: 1.0, label: [7.3, 0.62, 0, 0.27] },
  { id: "gull", u: 5.5, v: 3.5, r: 0.8, label: [5.5, 2.86, 0, 0.27] },
  { id: "black", u: 3.5, v: 3.5, r: 0.75, label: [3.5, 4.28, 0, 0.22] },
  { id: "raven", u: 1.5, v: 5.5, r: 0.8, label: [1.5, 4.76, 0, 0.24] },
  { id: "west", u: 2.0, v: 7.4, r: 1.25, area: true, label: [2.3, 7.15, -0.18, 0.26] },
  { id: "teeth", u: 5.0, v: 8.0, r: 0.95, label: [4.6, 9.45, 0, 0.25] },
  { id: "quiet", u: 8.0, v: 7.5, r: 0.95, label: [7.6, 8.45, 0, 0.27] },
  { id: "trough", u: 9.2, v: 4.8, r: 1.0, area: true, label: [9.05, 5.6, -1.5708, 0.26] },
];

/** The headline name: from the story's map_names when the chart has one, else from web/i18n. */
const nom = (id) => chartName(id) ?? t(`pl_${id}_nom`);
const forms = (id) => ({ nom: nom(id), at: t(`pl_${id}_at`), to: t(`pl_${id}_to`), gen: t(`pl_${id}_gen`) });

export const chartLandmarks = () => LANDMARKS.map((l) => ({ ...l, name: nom(l.id) }));

/**
 * Name of a cell for the interface.
 *   place(st, [5, 3]) -> { name: "Gull Rocks", at: "by Gull Rocks", to: "to Gull Rocks" }  (in the current language)
 * opts.pin = true: Vera's target cell is called "the gold pin" (it has a pin on the chart).
 */
export function place(st, cell, { pin = false } = {}) {
  const [x, y] = cell;
  const u = x + 0.5, v = y + 0.5;
  const vera = st?.advice?.vera?.target;
  if (pin && vera && vera[0] === x && vera[1] === y) {
    const f = forms("pin");
    return { name: f.nom, at: f.at, to: f.to };
  }
  if (st?.base && st.base[0] === x && st.base[1] === y) { const f = forms("base"); return { name: f.nom, at: f.at, to: f.to }; }

  const marks = LANDMARKS.map((l) => ({ u: l.u, v: l.v, r: l.r, f: forms(l.id) }));
  marks.push({ u: 0.5, v: 9.5, r: 0.6, f: forms("base") });
  if (st?.signal) marks.push({ u: st.signal[0], v: st.signal[1], r: 0.75, f: forms("signal") });
  let best = null, bd = 1e9;
  for (const m of marks) {
    const d = Math.hypot(u - m.u, v - m.v) / (m.r ** 0.5);     // big areas reach a little further
    if (d < bd) { bd = d; best = m; }
  }
  const dist = Math.hypot(u - best.u, v - best.v);
  if (dist <= best.r) return { name: best.f.nom, at: best.f.at, to: best.f.to };
  const a = Math.atan2(best.v - v, u - best.u);                // north is up (smaller v)
  const sector = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  const phrase = t(`pl_dir_${sector}`, { p: best.f.gen });
  return { name: cap(phrase), at: phrase, to: phrase };
}

/** "by Gull Rocks" -> "By Gull Rocks" (start of a sentence). */
export { cap };
