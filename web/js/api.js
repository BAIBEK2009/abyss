// Thin wrapper over the Python JSON API (CLAUDE.md v3, 13.2).

// B7: the campaign is saved in localStorage after every answer (its seed + the log of the captain's calls)
export const SAVE_KEY = "abyss.save";
function saveLocal(st) {
  if (!st?.save?.log?.length) return;          // a fresh game never overwrites a saved one (the menu offers both)
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st.save)); } catch { /* private mode: no save */ }
}
export function readSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); return s && Array.isArray(s.log) ? s : null; } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* fine */ } }

async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { key: data.error, params: data.params || {} });
  saveLocal(data.state ?? (data.save !== undefined ? data : null));
  return data;
}

export const api = {
  state: () => call("/api/state"),
  advice: () => call("/api/advice"),
  journal: () => call("/api/journal"),
  newGame: (seed) => call("/api/new", seed === undefined ? {} : { seed }),
  preview: (action) => call("/api/preview", { action }),
  act: (action, live = false) => call("/api/act", { action, live }),
  diveEnd: (found, coverage, debris, find = null) => call("/api/dive", { found, coverage, debris, find }),
  story: (event) => call("/api/story", { event }),
  clue: (id, accept) => call("/api/clue", { id, accept }),
  choice: (key, option) => call("/api/choice", { key, option }),
  decoy: () => call("/api/decoy", {}),
  skip: () => call("/api/skip", {}),
  focus: (kind) => call("/api/focus", { kind }),
  load: (save) => call("/api/load", { save }),
  newCampaign: (demo = false) => call("/api/new", { demo }),
};
