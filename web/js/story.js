// All story texts live in web/data/story.json (ru), story.kk.json, story.en.json (CLAUDE.md 22.1, 23.1):
// the engine only shows them. loadStory(lang) is awaited once at start-up; after that the helpers are
// synchronous.
import { nobreakAll } from "./i18n.js";

let S = null;
let KEYS = {};

export async function loadStory(lang) {
  const [story, keys] = await Promise.all([
    fetch(`/api/story?lang=${encodeURIComponent(lang)}`).then((r) => r.json()),
    fetch("data/map_keys.json").then((r) => r.json()),
  ]);
  S = nobreakAll(story); KEYS = keys;      // the flight number never wraps (i18n.js)
  return S;
}

export const story = () => S;

/** A chart name by landmark id (data/map_keys.json -> map_names): chartName("west") -> the basin's name. */
export const chartName = (id) => (KEYS[id] ? S?.map_names?.[KEYS[id]] : undefined);

/** A character: {name, role, portrait?, channel?}. */
export const who = (id) => S?.characters?.[id] ?? { name: id, role: "" };

export const act = (id) => S?.acts.find((a) => a.id === id) ?? null;

/** A beat by id, from any act. */
export function beat(id) {
  for (const a of S?.acts ?? []) {
    const b = a.beats.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
}

export const hud = (k) => S?.hud?.[k];
export const slot = (n) => S?.mystery?.slots.find((s) => s.id === n) ?? null;

/** The officers' portraits keep their old ids (vera / lev / grisha); the people are from story.json. */
export const OFFICER = { vera: "dana", lev: "erlan", grisha: "murat" };
export const PORTRAIT = { dana: "vera", erlan: "lev", murat: "grisha" };
export const officer = (pid) => who(OFFICER[pid] ?? pid);
