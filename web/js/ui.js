// HTML over the canvas: paper tags pinned to 3D objects, radio tape, legend.
// Every frame each pinned element is moved to the screen position of its 3D anchor.

const pins = [];

/**
 * Pin an element to a 3D point.
 * place: "above" (tag hangs above the point on a string) | "below" (tag under the point)
 *        | "at" (centred on the point)
 */
export function pin(el, anchor, place = "above") {
  const holder = document.createElement("div");   // moved to the anchor every frame
  holder.className = `pinned pin-${place}`;
  holder.append(el);
  document.getElementById("overlay").appendChild(holder);
  pins.push({ el: holder, anchor });
  return el;
}

export function updatePins(toScreen) {
  for (const p of pins) {
    const s = toScreen(p.anchor);
    p.el.style.visibility = s.visible ? "visible" : "hidden";
    p.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
  }
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** Brass-instrument tag: "Проверить сонаром · −3" + key cap. */
export function instrumentTag(label, key) {
  const t = el("div", "tag");
  t.append(el("span", "tag-label", label));
  if (key) t.append(el("kbd", "", key));
  return t;
}

/** Plain value tag (e.g. fuel), returns {el, set(text)}. */
export function valueTag(text) {
  const t = el("div", "tag tag-value");
  const s = el("span", "tag-label", text);
  t.append(s);
  return { el: t, set: (v) => { s.textContent = v; } };
}

/** Handwritten text on the chart itself (ink, no paper background). */
export function chartNote(text, cls = "") {
  return el("div", `chart-note ${cls}`, text);
}

/** The radio's paper tape: the latest message, handwritten. */
export function radioTape() {
  const t = el("div", "radio-tape");
  const p = el("p", "", "");
  t.append(p);
  return { el: t, say(text) { p.textContent = text; t.classList.remove("fresh"); void t.offsetWidth; t.classList.add("fresh"); } };
}

// ------------------------------------------------------------------ interactive pieces (M3)

/** A paper tag that follows the mouse (previews, reasons why something is not possible). */
export function cursorTag() {
  const t = el("div", "cursor-tag");
  t.hidden = true;
  document.body.append(t);
  let x = 0, y = 0;
  window.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; place(); });
  function place() { t.style.transform = `translate(${x + 18}px, ${y + 16}px)`; }
  return {
    show(lines, { warn = false } = {}) {
      t.replaceChildren(...lines.filter(Boolean).map((l, i) => el("span", i ? "sub" : "main", l)));
      t.classList.toggle("warn", warn);
      t.hidden = false;
      place();
    },
    hide() { t.hidden = true; },
  };
}

/** Paper note in the middle of the table with two buttons. Resolves true / false. */
export function confirmNote(text, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const back = el("div", "note-backdrop");
    const note = el("div", "note-card");
    note.append(el("p", "", text));
    const row = el("div", "note-buttons");
    const ok = el("button", "paper-btn primary", `${okLabel} <kbd>Enter</kbd>`);
    const cancel = el("button", "paper-btn", `${cancelLabel} <kbd>Esc</kbd>`);
    row.append(ok, cancel);
    note.append(row);
    back.append(note);
    document.body.append(back);
    const done = (v) => { window.removeEventListener("keydown", onKey, true); back.remove(); resolve(v); };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "f" || e.key === "F") { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      else e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    ok.focus();
  });
}

/** Tutorial note pinned to the top-left corner of the table. */
export function tutorialNote(skipLabel, onSkip) {
  const n = el("div", "tutorial-note");
  n.hidden = true;
  const p = el("p", "", "");
  const skip = el("button", "link-btn", skipLabel);
  skip.onclick = onSkip;
  n.append(p, skip);
  document.body.append(n);
  return {
    show(text) { p.textContent = text; n.hidden = false; n.classList.remove("fresh"); void n.offsetWidth; n.classList.add("fresh"); },
    hide() { n.hidden = true; },
  };
}

/** End-of-game note (the full logbook result screen comes in M5). */
export function endNote(title, line, againLabel, onAgain) {
  const back = el("div", "note-backdrop soft");
  const note = el("div", "note-card end");
  note.append(el("h2", "", title), el("p", "", line));
  const again = el("button", "paper-btn primary", `${againLabel} <kbd>Enter</kbd>`);
  again.onclick = onAgain;
  note.append(again);
  back.append(note);
  document.body.append(back);
  window.addEventListener("keydown", (e) => { if (e.key === "Enter") onAgain(); }, { once: true });
}

/** Pencil tally marks on the chart margin: |||| groups of five, struck through. */
export function tally() {
  const t = el("div", "chart-note tally");
  return {
    el: t,
    /** label: already declined, e.g. "5 проверок". */
    set(n, label) {
      const groups = [];
      for (let i = 0; i < Math.floor(n / 5); i++) groups.push('<span class="five">||||</span>');
      if (n % 5) groups.push("|".repeat(n % 5));
      t.innerHTML = n ? `${groups.join(" ")} <small>${label}</small>` : "";
    },
  };
}
