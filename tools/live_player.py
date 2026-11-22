"""A live player for Playwright: real keys (event.code, any keyboard layout), real mouse drags and clicks.
The game state is only READ through window.__abyss (where am I, what is in focus); every action is input.

    from live_player import Player
    p = Player(page, layout="ru")     # "en" | "ru" | "kk": the key's character differs, event.code is the same
    p.walk_to(x, z); p.face_thing("radio"); p.key("KeyE")
"""
import math

# what each physical key types in each layout (event.key); event.code stays "KeyW" etc.
LAYOUT = {
    "en": {"KeyW": "w", "KeyA": "a", "KeyS": "s", "KeyD": "d", "KeyE": "e", "KeyQ": "q", "KeyB": "b", "KeyJ": "j", "KeyH": "h", "KeyM": "m"},
    "ru": {"KeyW": "ц", "KeyA": "ф", "KeyS": "ы", "KeyD": "в", "KeyE": "у", "KeyQ": "й", "KeyB": "и", "KeyJ": "о", "KeyH": "р", "KeyM": "ь"},
    # Kazakh (Windows/macOS standard): the letter rows are the Russian ones, the digits row differs
    "kk": {"KeyW": "ц", "KeyA": "ф", "KeyS": "ы", "KeyD": "в", "KeyE": "у", "KeyQ": "й", "KeyB": "и", "KeyJ": "о", "KeyH": "р", "KeyM": "ь"},
}
SENS = 0.0022 * 1.6        # fp.js: drag-to-look turns by dx * SENS * 1.6


class Player:
    def __init__(self, page, layout="en"):
        self.page, self.layout = page, layout

    # ------------------------------------------------------------------ raw input
    def _dispatch(self, kind, code):
        """A keyboard event with this physical code and the character the layout gives (CDP, like a real key)."""
        key = LAYOUT[self.layout].get(code, {"Space": " ", "Enter": "Enter", "Escape": "Escape", "ShiftLeft": "Shift"}.get(code, code))
        text = key if len(key) == 1 else ""
        vk = {"Space": 32, "Enter": 13, "Escape": 27, "ShiftLeft": 16}.get(code, ord(code[3]) if code.startswith("Key") else 0)
        self.cdp.send("Input.dispatchKeyEvent", {"type": "keyDown" if kind == "down" else "keyUp", "code": code, "key": key,
                                                 "text": text if kind == "down" else "", "windowsVirtualKeyCode": vk,
                                                 "nativeVirtualKeyCode": vk})

    @property
    def cdp(self):
        if not hasattr(self, "_cdp"):
            self._cdp = self.page.context.new_cdp_session(self.page)
        return self._cdp

    def down(self, code): self._dispatch("down", code)
    def up(self, code): self._dispatch("up", code)

    def key(self, code, hold_ms=60):
        self.down(code); self.page.wait_for_timeout(hold_ms); self.up(code)

    def hold(self, code, ms):
        self.down(code); self.page.wait_for_timeout(ms); self.up(code)

    def drag(self, dx, dy=0, steps=8):
        """Look around the way a trackpad user does without the pointer lock: drag on the 3D view."""
        x0, y0 = 720, 450
        self.page.mouse.move(x0, y0)
        self.page.mouse.down()
        for i in range(1, steps + 1):
            self.page.mouse.move(x0 + dx * i / steps, y0 + dy * i / steps)
        self.page.mouse.up()
        self.page.wait_for_timeout(80)

    # ------------------------------------------------------------------ reading the game
    def pos(self):
        return self.page.evaluate("(() => { const p = window.__abyss.walk.fp.pos; return [p.x, p.z, p.yaw, p.pitch]; })()")

    def focus(self):
        return self.page.evaluate("window.__abyss.walk.debug().focus")

    def mode(self):
        return self.page.evaluate("window.__abyss.walk.mode")

    def thing(self, id_):
        """{stand: [x, z], look: [x, y, z]} of a thing on the deck or in the cabin (space units, metres)."""
        return self.page.evaluate(f"window.__abyss.walk.fp.thingsInfo.find((x) => x.id === '{id_}') || null")

    # ------------------------------------------------------------------ moving like a player
    def turn_to(self, yaw_goal, pitch_goal=None, tol=0.05):
        """Drag until the head points at yaw_goal (and pitch_goal)."""
        for _ in range(12):
            x, z, yaw, pitch = self.pos()
            d = math.atan2(math.sin(yaw_goal - yaw), math.cos(yaw_goal - yaw))
            dp = 0 if pitch_goal is None else pitch_goal - pitch
            if abs(d) < tol and abs(dp) < tol:
                return
            self.drag(-d / SENS, -dp / SENS)

    def walk_to(self, gx, gz, tol=0.35, run=False, timeout_s=40):
        """WASD towards a point (space units): turn by dragging, hold W, correct on the way."""
        for _ in range(int(timeout_s * 4)):
            x, z, yaw, _p = self.pos()
            dx, dz = gx - x, gz - z
            dist = math.hypot(dx, dz)
            if dist < tol:
                return True
            self.turn_to(math.atan2(dx, dz), tol=0.12)
            ms = int(min(900, max(120, dist / (3.0 if run else 1.45) * 1000 * 0.8)))
            if run:
                self.down("ShiftLeft")
            self.hold("KeyW", ms)
            if run:
                self.up("ShiftLeft")
            x2, z2, *_ = self.pos()
            if math.hypot(x2 - x, z2 - z) < 0.02:            # stuck on something: sidestep
                self.hold("KeyD", 300)
        return False

    def face_point(self, px, py, pz, eye=1.65):
        x, z, *_ = self.pos()
        self.turn_to(math.atan2(px - x, pz - z), math.atan2(py - eye, math.hypot(px - x, pz - z)))

    def go_use(self, id_, key="KeyE"):
        """Walk up to a thing, look at it, press E. Returns True when the thing came into focus."""
        th = self.thing(id_)
        assert th, f"no thing {id_}"
        self.walk_to(*th["stand"])
        self.face_point(*th["look"])
        self.page.wait_for_timeout(300)
        ok = self.focus() == id_
        self.key(key)
        return ok


SEEN_JS = """(sel) => {            // really on screen: on top at its own centre, and nothing above it fades it out
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  for (let e = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.15) return false;
  }
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === el || el.contains(top) || top.contains(el));
}"""


def seen(page, sel):
    """Is the element really visible to a player (Playwright counts opacity 0 as visible)?"""
    return page.evaluate(SEEN_JS, sel)
