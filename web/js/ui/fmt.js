// Small formatting helpers shared by the table UI.
import { getLang } from "../strings.js";

/** 4 -> "4", 4.5 -> "4,5" (RU) / "4.5" (EN). */
export function hours(h) {
  const v = Math.round(h * 10) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return getLang() === "ru" ? s.replace(".", ",") : s;
}

export const pct = (p) => (p < 0.01 ? "<1" : String(Math.round(p * 100)));

export const cellName = (cols, [x, y]) => `${cols[x]}${y + 1}`;

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
