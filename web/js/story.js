// All story texts live in web/data/story.json (CLAUDE.md 22.1): the engine only shows them.
// loadStory() is awaited once at start-up; after that the helpers are synchronous.
let S = null;

export async function loadStory() {
  const res = await fetch("data/story.json");
  S = await res.json();
  return S;
}

export const story = () => S;

/** A chart name by its old (Atlantic) key: map_names["Западная котловина"] -> "Южно-Каспийская котловина". */
export const mapName = (key) => S?.map_names?.[key] ?? key;

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
