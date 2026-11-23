// Small formatting helpers shared by the table UI.
import { decimal } from "../i18n.js";

/** 4 -> "4", 4.5 -> "4,5" (ru, kk) / "4.5" (en). */
export function hours(h) {
  const v = Math.round(h * 10) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return decimal(s);
}

export const pct = (p) => (p < 0.01 ? "<1" : String(Math.round(p * 100)));

export const cellName = (cols, [x, y]) => `${cols[x]}${y + 1}`;

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
