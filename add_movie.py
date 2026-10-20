#!/usr/bin/env python3
"""
Infinity movie manager  (Python 3.8+, no extra packages needed)

  python add_movie.py                 -> add a movie (asks questions, incl. extra audio / subtitles)
  python add_movie.py add "Name" "Action • Sci-Fi" "<drive link or id>"
  python add_movie.py list            -> show all movies
  python add_movie.py remove 3        -> remove movie number 3
  python add_movie.py check           -> find broken / missing links
  python add_movie.py serve           -> preview the site at http://localhost:8000

It edits movies.js (between the MOVIES START / MOVIES END markers).
New movies are added at the TOP, so the newest appear first.
Afterwards just upload the whole folder to your website again.
"""
import json
import os
import re
import sys
import http.server
import socketserver
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, "movies.js")
START = "// >>> MOVIES START"
END = "// <<< MOVIES END"


# ---------------------------------------------------------------- helpers
def drive_id(text):
    text = (text or "").strip()
    m = re.search(r"/d/([\w-]+)", text) or re.search(r"[?&]id=([\w-]+)", text)
    return m.group(1) if m else text


def is_real_id(v):
    return bool(re.fullmatch(r"[\w-]{12,}", v or "")) and not re.match(r"(PASTE|YOUR)", v or "", re.I)


def parse_tracks(text):
    """'Hindi=<link>; English=<link>'  ->  [{"label": "Hindi", "driveId": "..."}, ...]"""
    out = []
    for part in (text or "").split(";"):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^([^=:/]+?)\s*=\s*(\S.*)$", part)
        if not m:
            print("  (skipped '%s' - use the form  Label=link)" % part)
            continue
        label, link = m.group(1).strip(), m.group(2).strip()
        if re.match(r"https?://", link, re.I) and not re.search(r"drive\.(usercontent\.)?google\.com", link, re.I):
            out.append({"label": label, "src": link})
        else:
            out.append({"label": label, "driveId": drive_id(link)})
    return out


def read_file():
    with open(FILE, encoding="utf-8") as f:
        return f.read()


def load():
    src = read_file()
    a, b = src.find(START), src.find(END)
    if a < 0 or b < 0:
        sys.exit("ERROR: the MOVIES START / MOVIES END marker lines are missing in movies.js")
    body = src[a + len(START):b]
    body = "\n".join(l for l in body.splitlines() if not l.strip().startswith("//"))
    body = re.sub(r",\s*$", "", body.strip())               # trailing comma
    body = re.sub(r",\s*([\]}])", r"\1", body)
    try:
        return json.loads("[" + body + "]")
    except json.JSONDecodeError as e:
        sys.exit("ERROR: could not read movies.js (%s).\n"
                 "Every movie must look like: { \"name\": \"..\", \"category\": \"..\", \"poster\": \"\", \"driveId\": \"..\" },\n"
                 "(use double quotes \" and a comma after each movie except the last)." % e)


def save(movies):
    src = read_file()
    a, b = src.find(START), src.find(END)
    lines = ["    { " + ", ".join(json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False) for k, v in m.items()) + " }"
             for m in movies]
    body = ",\n".join(lines)
    new = src[:a + len(START)] + "\n" + body + "\n" + src[b:]
    with open(FILE + ".bak", "w", encoding="utf-8") as f:   # safety copy
        f.write(src)
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(new)


def ask(prompt, default=""):
    try:
        v = input(prompt + (" [%s]" % default if default else "") + ": ").strip()
    except (EOFError, KeyboardInterrupt):
        sys.exit("\nCancelled.")
    return v or default


# ---------------------------------------------------------------- commands
def cmd_add(args):
    if len(args) >= 3:
        name, cat, link = args[0], args[1], args[2]
        poster = args[3] if len(args) > 3 else ""
        audio_txt = sub_txt = ""
    else:
        print("Add a new movie (press Enter to skip optional questions)\n")
        name = ask("Movie name")
        cat = ask("Category, e.g. Action • Sci-Fi")
        link = ask("Google Drive link or file ID (or leave empty if 'Coming soon')")
        poster = ask("Poster image link (optional)")
        print("\nOptional - dual audio / subtitles (files must be AAC audio .m4a/.mp3 and .srt/.vtt;")
        print("make them with  python convert_movie.py \"movie.mkv\" ).  Format:  Label=link; Label=link")
        audio_txt = ask("Extra audio tracks, e.g. Hindi=<link>; English=<link>")
        sub_txt = ask("Subtitles, e.g. English=<link>; Bangla=<link>")
    if not name:
        sys.exit("A movie name is required.")
    movies = load()
    if any(m.get("name", "").lower() == name.lower() for m in movies):
        if ask("A movie with this name already exists. Add anyway? (y/n)", "n").lower() != "y":
            sys.exit("Nothing changed.")
    entry = {"name": name, "category": cat, "poster": poster.strip(),
             "driveId": drive_id(link) if link else "PASTE_LINK_OR_ID_HERE"}
    if link.lower().endswith((".mp4", ".webm", ".m4v")) and link.lower().startswith("http"):
        entry["driveId"] = ""
        entry["src"] = link
    if "/folders/" in link:
        sys.exit("That is a Drive FOLDER link. Open the video file itself and copy ITS link.")
    audio, subs = parse_tracks(audio_txt), parse_tracks(sub_txt)
    if audio:
        entry["audio"] = audio
    if subs:
        entry["subtitles"] = subs
    movies.insert(0, entry)
    save(movies)
    print("\nAdded '%s' at the top of the list. Upload the folder to publish it." % name)


def cmd_list(_):
    for i, m in enumerate(load(), 1):
        status = "ready" if (m.get("src") or is_real_id(drive_id(m.get("driveId", "")))) else "coming soon"
        print("%2d. %-30s %-28s %s" % (i, m.get("name", "?"), m.get("category", ""), status))


def cmd_remove(args):
    movies = load()
    if not args or not args[0].isdigit() or not (1 <= int(args[0]) <= len(movies)):
        cmd_list(None)
        sys.exit("\nUsage: python add_movie.py remove <number>")
    m = movies.pop(int(args[0]) - 1)
    save(movies)
    print("Removed '%s'." % m.get("name"))


def cmd_check(_):
    movies = load()
    bad = 0
    for i, m in enumerate(movies, 1):
        name = m.get("name", "?")
        if m.get("src"):
            url = m["src"]
        else:
            did = drive_id(m.get("driveId", ""))
            if not is_real_id(did):
                print("  - %s: still 'coming soon'" % name)
                continue
            url = "https://drive.google.com/file/d/%s/view" % did
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            urllib.request.urlopen(req, timeout=15).close()
            print("  OK  %s" % name)
        except urllib.error.HTTPError as e:
            bad += 1
            hint = " (file not shared as 'Anyone with the link'?)" if e.code in (401, 403, 404) else ""
            print("  !!  %s: HTTP %s%s" % (name, e.code, hint))
        except Exception as e:
            print("  ??  %s: could not check (%s)" % (name, e))
    print("\n%d problem(s) found." % bad if bad else "\nAll good.")


def cmd_serve(_):
    os.chdir(HERE)
    port = 8000
    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), handler) as httpd:
        print("Preview: http://localhost:%d   (Ctrl+C to stop)" % port)
        print("To test on your phone, open  http://<this-PC's-IP>:%d  on the same Wi-Fi." % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


COMMANDS = {"add": cmd_add, "list": cmd_list, "remove": cmd_remove, "check": cmd_check, "serve": cmd_serve}

if __name__ == "__main__":
    argv = sys.argv[1:]
    if argv and argv[0] in ("-h", "--help", "help"):
        print(__doc__)
    elif not argv:
        cmd_add([])
    elif argv[0] in COMMANDS:
        COMMANDS[argv[0]](argv[1:])
    else:
        print(__doc__)
