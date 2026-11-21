// Place names instead of coordinates (CLAUDE.md v3.1, 18: "координат A10/F5 в интерфейсе нет").
// Every cell is named after the nearest landmark on the chart: "у Скал Чайки", or with a direction,
// "восточнее Скал Чайки". Coordinates stay only in the professor's journal and in exam mode.
// The same names are written on the chart texture (scenes/chart.js), so the words match the map.
import { getLang } from "./strings.js";

// u, v = map units (cell x + .5, y + .5); r = how far "у ..." reaches; area = a basin ("в ...")
// forms: nom (headline), at ("у ..." / "в ..."), to ("к ..." / "в ..."), gen (after a direction)
const LANDMARKS = [
  { id: "ridge", u: 2.5, v: 2.0, r: 0.95, label: [2.7, 0.55, -0.08, 0.27],
    ru: { nom: "Северная гряда", at: "у Северной гряды", to: "к Северной гряде", gen: "Северной гряды" },
    en: { nom: "North Ridge", at: "by North Ridge", to: "to North Ridge", gen: "North Ridge" } },
  { id: "twins", u: 7.5, v: 1.4, r: 1.0, label: [7.3, 0.62, 0, 0.27],
    ru: { nom: "Близнецы", at: "у Близнецов", to: "к Близнецам", gen: "Близнецов" },
    en: { nom: "the Twins", at: "by the Twins", to: "to the Twins", gen: "the Twins" } },
  { id: "gull", u: 5.5, v: 3.5, r: 0.8, label: [5.5, 2.86, 0, 0.27],
    ru: { nom: "Скалы Чайки", at: "у Скал Чайки", to: "к Скалам Чайки", gen: "Скал Чайки" },
    en: { nom: "Gull Rocks", at: "by Gull Rocks", to: "to Gull Rocks", gen: "Gull Rocks" } },
  { id: "black", u: 3.5, v: 3.5, r: 0.75, label: [3.5, 4.28, 0, 0.22],
    ru: { nom: "Чёрный камень", at: "у Чёрного камня", to: "к Чёрному камню", gen: "Чёрного камня" },
    en: { nom: "Black Stone", at: "by Black Stone", to: "to Black Stone", gen: "Black Stone" } },
  { id: "raven", u: 1.5, v: 5.5, r: 0.8, label: [1.5, 4.76, 0, 0.24],
    ru: { nom: "Камень Ворона", at: "у Камня Ворона", to: "к Камню Ворона", gen: "Камня Ворона" },
    en: { nom: "Raven Stone", at: "by Raven Stone", to: "to Raven Stone", gen: "Raven Stone" } },
  { id: "west", u: 2.0, v: 7.4, r: 1.25, area: true, label: [2.2, 7.15, -0.18, 0.33],
    ru: { nom: "Западная котловина", at: "в Западной котловине", to: "в Западную котловину", gen: "Западной котловины" },
    en: { nom: "the West Basin", at: "in the West Basin", to: "into the West Basin", gen: "the West Basin" } },
  { id: "teeth", u: 5.0, v: 8.0, r: 0.95, label: [4.6, 9.45, 0, 0.25],
    ru: { nom: "Южные зубья", at: "у Южных зубьев", to: "к Южным зубьям", gen: "Южных зубьев" },
    en: { nom: "the South Teeth", at: "by the South Teeth", to: "to the South Teeth", gen: "the South Teeth" } },
  { id: "quiet", u: 8.0, v: 7.5, r: 0.95, label: [7.6, 8.45, 0, 0.27],
    ru: { nom: "Банка Тихая", at: "у Банки Тихой", to: "к Банке Тихой", gen: "Банки Тихой" },
    en: { nom: "Quiet Bank", at: "by Quiet Bank", to: "to Quiet Bank", gen: "Quiet Bank" } },
  { id: "trough", u: 9.2, v: 4.8, r: 1.0, area: true, label: [9.05, 5.6, -1.5708, 0.26],
    ru: { nom: "Восточный жёлоб", at: "в Восточном жёлобе", to: "в Восточный жёлоб", gen: "Восточного жёлоба" },
    en: { nom: "the East Trough", at: "in the East Trough", to: "into the East Trough", gen: "the East Trough" } },
];

const BASE = {
  ru: { nom: "База", at: "у базы", to: "к базе", gen: "базы" },
  en: { nom: "Base", at: "at the base", to: "to the base", gen: "the base" },
};
const SIGNAL = {
  ru: { nom: "Точка сигнала", at: "у точки сигнала", to: "к точке сигнала", gen: "точки сигнала" },
  en: { nom: "The signal point", at: "by the signal point", to: "to the signal point", gen: "the signal point" },
};
const GOLD_PIN = {
  ru: { nom: "Золотая булавка", at: "у золотой булавки", to: "к золотой булавке" },
  en: { nom: "The gold pin", at: "at the gold pin", to: "to the gold pin" },
};

// direction from the landmark to the cell, 8 sectors, counter-clockwise from east (north = up = -v)
const DIRS = {
  ru: ["восточнее", "северо-восточнее", "севернее", "северо-западнее", "западнее", "юго-западнее", "южнее", "юго-восточнее"],
  en: ["east of", "north-east of", "north of", "north-west of", "west of", "south-west of", "south of", "south-east of"],
};

export const chartLandmarks = () => LANDMARKS.map((l) => ({ ...l, name: l[getLang()]?.nom ?? l.ru.nom }));

/**
 * Name of a cell for the interface.
 *   place(st, [5, 3]) -> { name: "Скалы Чайки", at: "у Скал Чайки", to: "к Скалам Чайки" }
 * opts.pin = true: Vera's target cell is called "the gold pin" (it has a pin on the chart).
 */
export function place(st, cell, { pin = false } = {}) {
  const lang = getLang() === "en" ? "en" : "ru";
  const [x, y] = cell;
  const u = x + 0.5, v = y + 0.5;
  const vera = st?.advice?.vera?.target;
  if (pin && vera && vera[0] === x && vera[1] === y) return { name: GOLD_PIN[lang].nom, ...GOLD_PIN[lang] };
  if (st?.base && st.base[0] === x && st.base[1] === y) return { name: BASE[lang].nom, ...BASE[lang] };

  const marks = LANDMARKS.map((l) => ({ u: l.u, v: l.v, r: l.r, f: l[lang] }));
  marks.push({ u: 0.5, v: 9.5, r: 0.6, f: BASE[lang] });
  if (st?.signal) marks.push({ u: st.signal[0], v: st.signal[1], r: 0.75, f: SIGNAL[lang] });
  let best = null, bd = 1e9;
  for (const m of marks) {
    const d = Math.hypot(u - m.u, v - m.v) / (m.r ** 0.5);     // big areas reach a little further
    if (d < bd) { bd = d; best = m; }
  }
  const dist = Math.hypot(u - best.u, v - best.v);
  if (dist <= best.r) return { name: best.f.nom, at: best.f.at, to: best.f.to };
  const a = Math.atan2(best.v - v, u - best.u);                // north is up (smaller v)
  const sector = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  const phrase = `${DIRS[lang][sector]} ${best.f.gen}`;
  return { name: phrase.charAt(0).toUpperCase() + phrase.slice(1), at: phrase, to: phrase };
}

/** "у Скал Чайки" -> "У Скал Чайки" (start of a sentence). */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
