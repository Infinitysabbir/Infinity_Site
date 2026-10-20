#!/usr/bin/env python3
"""
Infinity movie converter  (needs Python 3.8+ and FFmpeg: https://ffmpeg.org/download.html)

WHY: "high quality" movie files usually carry AC-3 / E-AC-3 / DTS / TrueHD audio. Browsers and
phones cannot decode those, so the picture plays with NO SOUND. This tool re-makes the file so it
plays everywhere:

    python convert_movie.py "My Movie 2160p BluRay.mkv"

It creates a folder  My Movie 2160p BluRay_web/  containing
    movie.mp4              video (copied, not re-encoded) + the default audio as AAC, fast-start
    movie.<lang>.m4a       every OTHER audio track (dual audio) as a small AAC file
    movie.<lang>.vtt       every text subtitle track as WebVTT
and prints a ready-made line for movies.js. Upload the files to Google Drive (share: "Anyone with
the link"), paste the file IDs where the line says PASTE_..., then redeploy.

Options
    --audio N           which audio track is the main one (0 = first, default 0)
    --reencode-video    also convert the video to H.264 8-bit (needed for HEVC/x265 / 10-bit files
                        that show a black picture in Chrome). Slow, but works everywhere.
    --out FOLDER        output folder (default: <file>_web next to the movie)
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

TEXT_SUBS = {"subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "microdvd", "subviewer"}


def need(tool):
    if not shutil.which(tool):
        sys.exit("ERROR: '%s' was not found. Install FFmpeg (it includes ffprobe) and try again.\n"
                 "       Windows: winget install ffmpeg   |   macOS: brew install ffmpeg   |   Linux: apt install ffmpeg" % tool)


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ERROR: ffprobe could not read the file:\n" + r.stderr.strip())
    return json.loads(r.stdout).get("streams", [])


def run(cmd):
    print("  $ " + " ".join('"%s"' % c if " " in c else c for c in cmd))
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        print("    FAILED:\n" + "\n".join("    " + l for l in r.stderr.strip().splitlines()[-6:]))
        return False
    return True


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "track"


LANGS = {"eng": "English", "hin": "Hindi", "ben": "Bangla", "urd": "Urdu", "tam": "Tamil", "tel": "Telugu",
         "mal": "Malayalam", "kan": "Kannada", "mar": "Marathi", "pan": "Punjabi", "jpn": "Japanese",
         "kor": "Korean", "chi": "Chinese", "zho": "Chinese", "spa": "Spanish", "fre": "French", "fra": "French",
         "ger": "German", "deu": "German", "ara": "Arabic", "rus": "Russian", "por": "Portuguese",
         "ita": "Italian", "tur": "Turkish", "tha": "Thai", "ind": "Indonesian", "may": "Malay", "msa": "Malay"}


def describe(st, n, word):
    tags = st.get("tags", {}) or {}
    lang = (tags.get("language") or "und").lower()
    title = tags.get("title") or ""
    name = LANGS.get(lang) or (title if title else (lang if lang != "und" else "%s %d" % (word, n + 1)))
    return lang, name


def unique(base, used):
    k, cand = 2, base
    while cand in used:
        cand = "%s-%d" % (base, k)
        k += 1
    used.add(cand)
    return cand


def main():
    ap = argparse.ArgumentParser(description="Make a movie browser-friendly (AAC audio, subtitles as .vtt).")
    ap.add_argument("movie")
    ap.add_argument("--audio", type=int, default=0, help="index of the main audio track (default 0)")
    ap.add_argument("--reencode-video", action="store_true", help="convert video to H.264 8-bit")
    ap.add_argument("--out", help="output folder")
    a = ap.parse_args()

    need("ffmpeg"); need("ffprobe")
    src = a.movie
    if not os.path.isfile(src):
        sys.exit("ERROR: file not found: " + src)
    base = os.path.splitext(os.path.basename(src))[0]
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(src)), base + "_web")
    os.makedirs(out, exist_ok=True)

    streams = probe(src)
    video = [s for s in streams if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    subs = [s for s in streams if s.get("codec_type") == "subtitle"]
    if not video:
        sys.exit("ERROR: no video stream found.")
    if not audio:
        print("WARNING: this file has no audio track at all.")
    if audio and not 0 <= a.audio < len(audio):
        sys.exit("ERROR: --audio %d is out of range (file has %d audio tracks, 0..%d)." % (a.audio, len(audio), len(audio) - 1))

    v = video[0]
    vcodec, pix = v.get("codec_name"), v.get("pix_fmt", "")
    print("\nFile: %s" % src)
    print("  video : %s %s %sx%s" % (vcodec, pix, v.get("width"), v.get("height")))
    for i, s in enumerate(audio):
        print("  audio %d: %s %sch  %s" % (i, s.get("codec_name"), s.get("channels"), describe(s, i, "Audio")[1]))
    for i, s in enumerate(subs):
        print("  sub   %d: %s  %s" % (i, s.get("codec_name"), describe(s, i, "Subtitle")[1]))

    copy_ok = vcodec == "h264" and ("10" not in pix)
    if not copy_ok and not a.reencode_video:
        print("\nNOTE: the video is %s %s. Chrome / most phones only play H.264 8-bit reliably.\n"
              "      If the picture is black or stutters, run again with  --reencode-video  (slow)." % (vcodec, pix))
    vopts = (["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"]
             if a.reencode_video and not copy_ok else ["-c:v", "copy"])
    if a.reencode_video and copy_ok:
        print("\n(video is already H.264 8-bit - copying it as is, no quality loss)")

    # ---- main MP4: video + default audio (AAC) + fast start ----
    print("\n[1/3] Main file ...")
    main_mp4 = os.path.join(out, "movie.mp4")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:%d" % v["index"]]
    if audio:
        cmd += ["-map", "0:%d" % audio[a.audio]["index"], "-c:a", "aac", "-b:a", "192k", "-ac", "2"]
    cmd += vopts + ["-sn", "-dn", "-map_chapters", "-1", "-movflags", "+faststart", main_mp4]
    if not run(cmd):
        sys.exit("Could not create movie.mp4")

    used = set()
    audio_entries, sub_entries = [], []
    main_label = describe(audio[a.audio], a.audio, "Audio")[1] if audio else ""

    # ---- other audio tracks as AAC .m4a ----
    print("\n[2/3] Extra audio tracks ...")
    for i, s in enumerate(audio):
        if i == a.audio:
            continue
        lang, name = describe(s, i, "Audio")
        fn = "movie.%s.m4a" % unique(slug(lang if lang != "und" else name), used)
        if run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:%d" % s["index"], "-vn", "-c:a", "aac",
                "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", os.path.join(out, fn)]):
            audio_entries.append((name, lang, fn))
    if not audio_entries:
        print("  (none - single audio track)")

    # ---- subtitles as WebVTT ----
    print("\n[3/3] Subtitles ...")
    used_s = set()
    for i, s in enumerate(subs):
        lang, name = describe(s, i, "Subtitle")
        if (s.get("codec_name") or "").lower() not in TEXT_SUBS:
            print("  skipped subtitle %d (%s): picture-based subtitles can't be converted to text." % (i, s.get("codec_name")))
            continue
        title = (s.get("tags") or {}).get("title") or ""
        label = name if not title or title.lower() == name.lower() else "%s (%s)" % (name, title)
        fn = "movie.%s.vtt" % unique(slug(lang if lang != "und" else name) + ("-" + slug(title) if title and lang != "und" else ""), used_s)
        if run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:%d" % s["index"], "-c:s", "webvtt", os.path.join(out, fn)]):
            sub_entries.append((label, lang, fn))
    if not sub_entries:
        print("  (none)")

    # ---- movies.js line ----
    def q(x):
        return json.dumps(x, ensure_ascii=False)
    parts = ['{ "name": %s' % q(base), '"category": ""', '"poster": ""', '"driveId": "PASTE_ID_OF_movie.mp4"']
    if main_label and audio_entries:
        parts.append('"audioLabel": %s' % q(main_label))
    if audio_entries:
        parts.append('"audio": [' + ", ".join('{ "label": %s, "lang": %s, "driveId": "PASTE_ID_OF_%s" }' % (q(n), q(l if l != "und" else ""), f)
                                               for n, l, f in audio_entries) + ']')
    if sub_entries:
        parts.append('"subtitles": [' + ", ".join('{ "label": %s, "lang": %s, "driveId": "PASTE_ID_OF_%s" }' % (q(n), q(l if l != "und" else ""), f)
                                                   for n, l, f in sub_entries) + ']')
    print("\n" + "=" * 70)
    print("DONE. Files are in:  " + out)
    for f in sorted(os.listdir(out)):
        print("   %-34s %8.1f MB" % (f, os.path.getsize(os.path.join(out, f)) / 1048576))
    print("\n1) Upload them to Google Drive (share: Anyone with the link).")
    print("2) Paste this into movies.js (top of the list) and replace each PASTE_ID_OF_... with that file's Drive link or ID:\n")
    print("    " + ", ".join(parts) + " },")
    print("=" * 70)


if __name__ == "__main__":
    main()
