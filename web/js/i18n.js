// Three languages: qazaqsha, russkiy, English (CLAUDE.md 23.1). Every interface string lives in
// web/i18n/{kk,ru,en}.json; the code only knows keys. The story texts are separate
// (web/data/story*.json, see story.js). The server sends keys and numbers, never ready text.
//
//   t("tip_course", {cells: plural(6, "cell"), h: 6, f: 12})
//   {to} -> the value as is, {To} -> the same value with a capital first letter.
export const LANGS = ["kk", "ru", "en"];
const STORE = "abyss.lang";

let lang = "ru";
let table = {};
let fallback = {};

async function fetchTable(l) {
  const res = await fetch(`i18n/${l}.json`);
  if (!res.ok) throw new Error(`i18n/${l}.json: ${res.status}`);
  return res.json();
}

/** The language the player chose: ?lang= wins over localStorage; null = not chosen yet. */
export function chosenLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(q)) return q;
  try {
    const s = localStorage.getItem(STORE);
    if (LANGS.includes(s)) return s;
  } catch { /* storage blocked: ask again next time */ }
  return null;
}

export function saveLang(l) {
  try { localStorage.setItem(STORE, l); } catch { /* the choice lives for this page only */ }
}

/** Load a language (ru is the fallback for a missing key). */
export async function loadLang(l) {
  lang = LANGS.includes(l) ? l : "ru";
  const [main, ru] = await Promise.all([fetchTable(lang), lang === "ru" ? null : fetchTable("ru")]);
  table = main; fallback = ru ?? main;
  document.documentElement.lang = lang;
  document.title = t("html_title");
  return lang;
}

/** All three tables at once (the language screen shows every language in its own words). */
export const loadAll = () => Promise.all(LANGS.map(fetchTable)).then((ts) => Object.fromEntries(LANGS.map((l, i) => [l, ts[i]])));

export const getLang = () => lang;

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function t(key, params = {}) {
  const s = table[key] ?? fallback[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => {
    if (k in params) return String(params[k]);
    const low = k.charAt(0).toLowerCase() + k.slice(1);
    if (k !== low && low in params) return cap(String(params[low]));
    return m;
  });
}

// plural forms in n_<noun>: ru has three ("1 / 2-4 / 5+"), en two ("cell|cells"), kk one
// (a Kazakh noun after a number stays singular)
function ruForm(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1;
  return 2;
}

/** plural(5, "cell") -> "5 cells" in the current language. */
export function plural(n, noun) {
  const forms = t(`n_${noun}`).split("|");
  const i = forms.length === 3 ? ruForm(Math.abs(n)) : forms.length === 2 ? (n === 1 ? 0 : 1) : 0;
  return `${n} ${forms[i]}`;
}

/** 4.5 -> "4,5" (ru, kk) / "4.5" (en). */
export const decimal = (s) => String(s).replace(".", t("dec_sep"));
