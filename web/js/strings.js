// All player-facing text, RU / EN (CLAUDE.md, section 9). The server only sends keys + params.

const RU = {
  map_caption: "Квадрат поиска · рейс AQ-271",
  map_legend: "1 слой бумаги ≈ 1% вероятности",
  north: "С",
  base: "База",
  dev_hint: "Временно (до M6): клик по клетке — наш курс · N — ход по совету офицеров · C — принять улику",
  title: "ABYSS · Карта капитана",
  title_sub: "Карта капитана",
  mode_play: "Искать самому",
  mode_watch: "Смотреть, как ищет ИИ",
  mode_duel: "Дуэль: ты против ИИ",
  intro: "Рейс AQ-271 пропал над океаном. Маячок чёрного ящика молчит. Найди его, пока не кончилось топливо.",
  btn_check: "Проверить сонаром · −3",
  btn_lift: "Поднять ящик здесь · −5",
  btn_home: "Вернуться на корабль",
  btn_hint: "Подсказка ИИ",
  btn_journal: "Бортовой журнал",
  key_space: "Пробел",
  fuel: "Топливо {f}",
  signal: "последний сигнал",
  radio_start: "Рейс AQ-271: последний сигнал у {cell}. Начинаем поиск.",
  tip_move: "{cell} · {cells} · −{n} топлива",
  tip_reef: "Здесь риф — не проплыть",
  tip_nofuel: "Не хватит топлива (нужно {need}, есть {have})",
  busy: "Подлодка ещё плывёт",
  silence: "Тишина. Рядом ящика нет — убираю эту зону.",
  echo: "Эхо! Ящик здесь или в соседней клетке.",
  lift_confirm: "Уверен? Если ящика тут нет, потеряешь 5 топлива.",
  lift_miss: "Пусто. Здесь ящика нет.",
  low_fuel: "Топлива {f}. Совет: вернуться — так выгоднее, чем искать дальше.",
  refuel: "Заправились. Продолжаем поиск.",
  ai_plan_move: "Плыву в {cell}: там самый высокий холм ({p} %).",
  ai_plan_check: "Проверяю сонаром здесь.",
  ai_plan_lift: "Холм выше 50 % — поднимаю ящик.",
  ai_plan_home: "Топлива мало — возвращаюсь на корабль.",
  ai_hint: "ИИ советует искать у {cell}.",
  ai_banner: "Играет ИИ · нажми любую клавишу, чтобы забрать управление",
  your_turn: "Твой ход",
  ai_turn: "Ход ИИ…",
  win: "Ящик найден!",
  lose: "Топливо кончилось",
  result_line: "Ты нашёл ящик за {you}. ИИ обычно находит за {ai}. Меньше — лучше.",
  legend: "1 слой = 1 % · чем выше холм, тем вероятнее",
  again: "Ещё раз",
  watch_ai: "Как сыграл бы ИИ",
  tip_p: "вероятность {p} %",
  tip_p_here: "вероятность здесь {p} %",
  tip_check: "Сонар услышит ящик в этой клетке и рядом",
  tip_check_nofuel: "Не хватит топлива на проверку",
  tip_lift: "Если ящик здесь — победа. Если нет — потеряешь 5 топлива.",
  tip_lift_nofuel: "Не хватит топлива на подъём",
  tip_home: "Путь {cells} · после зарядки топливо 100",
  tip_at_base: "Ты уже на корабле",
  tip_here: "Подлодка уже здесь",
  tip_unreachable: "Сюда не доплыть",
  tip_hint: "Течение покажет, где искал бы ИИ. Бесплатно, но попадёт в итог.",
  tip_game_over: "Партия окончена",
  stranded: "Подлодка обесточена: до корабля не дотянуть.",
  btn_lift_do: "Поднять",
  btn_cancel: "Отмена",
  hills_off: "Холмы скрыты — ищи по меткам сонара · V",
  exam_printed: "Расчёт хода напечатан в терминале.",
  checks_label: "проверки",
  tut_skip: "Пропустить обучение",
  tut1: "Подлодка на корабле. Кликни по клетке рядом с красным крестиком, чтобы поплыть туда.",
  tut2: "Теперь нажми Пробел — сонар проверит, есть ли ящик рядом.",
  tut3: "Видишь холмы? Это мысли ИИ: чем выше, тем вероятнее ящик там. Плыви к самому высокому.",
  tut4: "Эхо! Встань на самый высокий холм и нажми F, чтобы поднять ящик.",
  tut5: "Следи за стрелкой топлива. Если её мало — R, вернуться на корабль.",
  end_win_line: "Ящик найден за {checks}.",
  end_lose_line: "Подлодка обесточена. Проверок сонаром: {n}.",
};

const EN = {
  map_caption: "Search square · flight AQ-271",
  map_legend: "1 sheet of paper ≈ 1% probability",
  north: "N",
  base: "Base",
  dev_hint: "Temporary (until M6): click a cell — our course · N — one move by the officers' advice · C — accept a clue",
  title: "ABYSS · The Captain's Chart",
  title_sub: "The Captain's Chart",
  mode_play: "Search yourself",
  mode_watch: "Watch the AI search",
  mode_duel: "Duel: you vs the AI",
  intro: "Flight AQ-271 vanished over the ocean. The black box beacon is silent. Find it before the fuel runs out.",
  btn_check: "Check with sonar · −3",
  btn_lift: "Lift the box here · −5",
  btn_home: "Return to the ship",
  btn_hint: "AI hint",
  btn_journal: "Logbook",
  key_space: "Space",
  fuel: "Fuel {f}",
  signal: "last signal",
  radio_start: "Flight AQ-271: last signal near {cell}. Starting the search.",
  tip_move: "{cell} · {cells} · −{n} fuel",
  tip_reef: "Reef here — can't pass",
  tip_nofuel: "Not enough fuel (need {need}, have {have})",
  busy: "The sub is still moving",
  silence: "Silence. No box nearby — crossing this area out.",
  echo: "Echo! The box is here or right next to it.",
  lift_confirm: "Sure? If the box isn't here, you lose 5 fuel.",
  lift_miss: "Empty. The box isn't here.",
  low_fuel: "Fuel {f}. Advice: return — it beats searching on.",
  refuel: "Refuelled. Back to the search.",
  ai_plan_move: "Heading to {cell}: it's the highest hill ({p}%).",
  ai_plan_check: "Checking with sonar here.",
  ai_plan_lift: "Hill above 50% — lifting the box.",
  ai_plan_home: "Low fuel — returning to the ship.",
  ai_hint: "The AI suggests searching near {cell}.",
  ai_banner: "The AI is playing · press any key to take over",
  your_turn: "Your turn",
  ai_turn: "AI's turn…",
  win: "Box found!",
  lose: "Out of fuel",
  result_line: "You found the box in {you}. The AI usually needs {ai}. Fewer is better.",
  legend: "1 layer = 1% · the higher the hill, the likelier",
  again: "Play again",
  watch_ai: "Watch the AI play this map",
  tip_p: "probability {p}%",
  tip_p_here: "probability here {p}%",
  tip_check: "The sonar hears the box in this cell and next to it",
  tip_check_nofuel: "Not enough fuel for a sonar check",
  tip_lift: "If the box is here — you win. If not — you lose 5 fuel.",
  tip_lift_nofuel: "Not enough fuel to lift",
  tip_home: "Route {cells} · refuelled to 100",
  tip_at_base: "You're already at the ship",
  tip_here: "The sub is already here",
  tip_unreachable: "Can't get there",
  tip_hint: "A current shows where the AI would search. Free, but it counts in the result.",
  tip_game_over: "The game is over",
  stranded: "The sub is out of power: it can't make it back to the ship.",
  btn_lift_do: "Lift",
  btn_cancel: "Cancel",
  hills_off: "Hills hidden — search by the sonar marks · V",
  exam_printed: "The turn's calculation is printed in the terminal.",
  checks_label: "checks",
  tut_skip: "Skip the tutorial",
  tut1: "The sub is at the ship. Click a cell next to the red cross to sail there.",
  tut2: "Now press Space — the sonar checks whether the box is nearby.",
  tut3: "See the hills? They are the AI's thoughts: the higher, the likelier the box is there. Sail to the highest.",
  tut4: "Echo! Stand on the highest hill and press F to lift the box.",
  tut5: "Watch the fuel needle. If it's low — R, return to the ship.",
  end_win_line: "Box found in {checks}.",
  end_lose_line: "The sub is out of power. Sonar checks: {n}.",
};

const TABLES = { ru: RU, en: EN };
let lang = "ru";

export function setLang(l) { lang = TABLES[l] ? l : "ru"; }
export function getLang() { return lang; }

/** t("tip_nofuel", {need: 12, have: 9}) -> "Не хватит топлива (нужно 12, есть 9)". */
export function t(key, params = {}) {
  const s = TABLES[lang][key] ?? TABLES.ru[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

// Russian plural forms: 1 проверка, 2 проверки, 5 проверок, 21 проверка, 11 проверок.
const NOUNS = {
  // accusative, as in "нашёл за 1 проверку / 2 проверки / 5 проверок сонаром"
  check: { ru: ["проверку сонаром", "проверки сонаром", "проверок сонаром"], en: ["sonar check", "sonar checks"] },
  cell: { ru: ["клетка", "клетки", "клеток"], en: ["cell", "cells"] },
  checkN: { ru: ["проверка", "проверки", "проверок"], en: ["check", "checks"] },
  layer: { ru: ["слой", "слоя", "слоёв"], en: ["layer", "layers"] },
};

function ruForm(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1;
  return 2;
}

/** plural(5, "check") -> "5 проверок" / "5 sonar checks". */
export function plural(n, noun) {
  const forms = NOUNS[noun][lang];
  const word = lang === "ru" ? forms[ruForm(Math.abs(n))] : forms[n === 1 ? 0 : 1];
  return `${n} ${word}`;
}
