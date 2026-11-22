"""A copy of the game to send to friends (a zip for Telegram): only what is needed to play.

    python tools/make_play_zip.py [OUT.zip]        # default: ~/Desktop/ABYSS_play.zip

Inside, one folder ABYSS/: main.py, server.py, core/*.py, web/ (no .git, .venv, screenshots, tests, tools,
reference, docs, caches), plus
  ABYSS.command      Mac: double-click (executable bit kept in the zip)
  ABYSS.bat          Windows: finds py / python / python3 (3.9+), starts the server, the browser opens itself
  КАК ИГРАТЬ.txt     how to play, in Kazakh, Russian and English (UTF-8 with BOM, CRLF: Notepad reads it)
The game needs nothing but Python 3.9+ (standard library only). Prints the archive size.
"""
import stat
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOP = "ABYSS"
SKIP_DIRS = {"__pycache__", ".git", ".venv", "screenshots", "tests", "tools", "reference", "docs", "node_modules"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}

MAC = """#!/bin/bash
# ABYSS: double-click to play. Needs Python 3.9+. Close this window to stop the game.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
  PY=python3
else
  echo "Python 3.9+ not found / Python 3 табылмады / Python 3 не найден:"
  echo "  https://www.python.org/downloads/"
  open "https://www.python.org/downloads/" 2>/dev/null
  read -r -p "Enter..."
  exit 1
fi
echo "ABYSS: the game opens in your browser. Close this window to quit."
echo "ABYSS: ойын браузерде ашылады. Шығу үшін осы терезені жабыңыз."
echo "ABYSS: игра откроется в браузере. Чтобы выйти, закройте это окно."
"$PY" main.py || read -r -p "Enter..."
"""

WIN = r"""@echo off
rem ABYSS: double-click to play. Needs Python 3.9+ (python.org, tick "Add python.exe to PATH").
chcp 65001 >nul
cd /d "%~dp0"
set "PY="
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto run
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python"
if defined PY goto run
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python3"
if defined PY goto run
echo Python 3.9+ was not found.
echo Install it from https://www.python.org/downloads/ - and tick "Add python.exe to PATH" in the installer.
echo Then double-click ABYSS.bat again.
start "" "https://www.python.org/downloads/"
pause
exit /b 1
:run
echo ABYSS: the game opens in your browser. Close this window to quit.
%PY% main.py
pause
"""

HOWTO = """ABYSS · Капитан картасы / Карта капитана / The Captain's Chart

========================================  ҚАЗАҚША  ========================================
1. Python 3 керек (3.9 немесе жаңарақ), тегін: https://www.python.org/downloads/
   Windows: орнатқанда бірінші терезеде «Add python.exe to PATH» белгісін міндетті түрде қойыңыз.
   Mac: Python әдетте бар. Жоқ болса — python.org сайтынан орнатыңыз.
2. Архивті ашыңыз (кез келген папкаға).
3. Іске қосу файлын екі рет басыңыз:
   Mac — ABYSS.command,   Windows — ABYSS.bat.
   Ойын браузерде өзі ашылады. Қара терезені ойын біткенше жаппаңыз.
4. Mac «Apple could not verify…» (немесе «әзірлеуші белгісіз») деп ескертсе: «Done» (Дайын) басыңыз →
   Жүйе баптаулары (System Settings) → «Құпиялылық және қауіпсіздік» (Privacy & Security) → төменде «Open Anyway»
   (Бәрібір ашу) → құпиясөз → «Open». Бұл бір рет қана керек.
   Басқа жол: «Терминал» бағдарламасын ашып, python3 деп жазып, бос орын қойып, main.py файлын терезеге
   сүйреп әкеліп, Enter басыңыз.
5. Демо (қорғауға): мәзірде «Қорғауға арналған демо» — бүкіл оқиға 5 минутта.
Интернет керек емес. Тіл ойынның басында таңдалады.

========================================  РУССКИЙ  ========================================
1. Нужен Python 3 (3.9 или новее), бесплатно: https://www.python.org/downloads/
   Windows: при установке в первом окне обязательно поставьте галочку «Add python.exe to PATH».
   Mac: Python обычно уже есть. Если нет — установите с python.org.
2. Распакуйте архив (в любую папку).
3. Дважды щёлкните файл запуска:
   Mac — ABYSS.command,   Windows — ABYSS.bat.
   Игра сама откроется в браузере. Чёрное окно не закрывайте, пока играете.
4. Если Mac пишет «Apple could not verify…» (или «неустановленный разработчик»): нажмите «Done» (Готово) →
   Системные настройки → «Конфиденциальность и безопасность» → внизу «Open Anyway» (Всё равно открыть) →
   пароль → «Open». Это нужно только один раз.
   Запасной путь: откройте программу «Терминал», напишите python3 и пробел, перетащите в окно файл main.py
   и нажмите Enter.
5. Демо для защиты: в главном меню «Демо для защиты» — вся история за 5 минут.
Интернет не нужен. Язык выбирается в начале игры.

========================================  ENGLISH  ========================================
1. You need Python 3 (3.9 or newer), free: https://www.python.org/downloads/
   Windows: in the first installer window be sure to tick "Add python.exe to PATH".
   Mac: Python is usually there already. If not, install it from python.org.
2. Unzip the archive (into any folder).
3. Double-click the launcher:
   Mac: ABYSS.command,   Windows: ABYSS.bat.
   The game opens in your browser by itself. Keep the black window open while you play.
4. If the Mac says "Apple could not verify..." (or "unidentified developer"): click Done ->
   System Settings -> Privacy & Security -> at the bottom "Open Anyway" -> password -> Open.
   You only need to do this once.
   Fallback: open the Terminal app, type python3 and a space, drag main.py into the window, press Enter.
5. Demo for the defence: "Demo for the defence" in the main menu — the whole story in 5 minutes.
No internet needed. You pick the language when the game starts.
"""


def game_files():
    """main.py, server.py, core/*.py and the whole web/ folder, minus caches and dev folders."""
    yield ROOT / "main.py"
    yield ROOT / "server.py"
    for base in (ROOT / "core", ROOT / "web"):
        for p in sorted(base.rglob("*")):
            if p.is_file() and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS) and p.name not in SKIP_FILES \
                    and p.suffix not in (".pyc", ".map"):
                yield p


def add(z, name, data: bytes, executable=False):
    info = zipfile.ZipInfo(f"{TOP}/{name}", date_time=time.localtime()[:6])
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3                                   # unix: the mode bits below are honoured
    mode = 0o755 if executable else 0o644
    info.external_attr = (stat.S_IFREG | mode) << 16
    z.writestr(info, data)


def build(out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".zip.part")
    n = 0
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in game_files():
            add(z, p.relative_to(ROOT).as_posix(), p.read_bytes()); n += 1
        add(z, "ABYSS.command", MAC.encode("utf-8"), executable=True)
        add(z, "ABYSS.bat", WIN.replace("\n", "\r\n").encode("utf-8"))
        add(z, "КАК ИГРАТЬ.txt", b"\xef\xbb\xbf" + HOWTO.replace("\n", "\r\n").encode("utf-8"))
    tmp.replace(out)
    print(f"{out}: {n + 3} files, {out.stat().st_size / 1e6:.1f} MB")
    return out


if __name__ == "__main__":
    build(Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / "Desktop" / "ABYSS_play.zip")
