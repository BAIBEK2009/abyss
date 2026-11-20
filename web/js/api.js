// Thin wrapper over the Python JSON API (CLAUDE.md v3, 13.2).

async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { key: data.error, params: data.params || {} });
  return data;
}

export const api = {
  state: () => call("/api/state"),
  advice: () => call("/api/advice"),
  journal: () => call("/api/journal"),
  newGame: (seed) => call("/api/new", seed === undefined ? {} : { seed }),
  preview: (action) => call("/api/preview", { action }),
  act: (action) => call("/api/act", { action }),
  clue: (id, accept) => call("/api/clue", { id, accept }),
};
