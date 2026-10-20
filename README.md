# Infinity — how to use

## Folder contents
| File | What it is |
|---|---|
| `index.html` | The page |
| `css/style.css` | All styling (incl. the VLC-style player) |
| `js/app.js` | Site + player code |
| **`movies.js`** | **The only file you edit to add movies** |
| `add_movie.py` | Helper that edits `movies.js` for you (needs Python 3) |
| **`convert_movie.py`** | **Fixes "no sound" movies** and prepares dual audio + subtitles (needs Python 3 + FFmpeg) |
| `netlify/edge-functions/stream.js` | Video proxy that makes seeking work with Google Drive |
| `netlify.toml` | Netlify settings (keeps `movies.js` always fresh) |
| `manifest.webmanifest`, `icon.svg`, `sw.js` | "Add to Home Screen" app mode |

## Add a movie
- Easy: run `python add_movie.py` and answer the questions. Then upload/deploy the folder again.
- Manual: open `movies.js`, copy one line between the START/END markers, paste it at the top, edit it.
- Other commands: `list`, `remove 3`, `check`, `serve` (preview on http://localhost:8000).

## Movie plays but there is NO SOUND
Cause: high-quality files (BluRay / WEB-DL rips, MKV) usually have **AC-3 / E-AC-3 / DTS** audio. Browsers and
phones cannot decode these, so the picture plays silently. (H.264 video + **AAC** audio plays everywhere.)

The player now detects this a few seconds after playback starts and shows a **"No sound?"** box with a
**Use Drive player** button (Google converts the audio on the fly). For a permanent fix:

1. Install FFmpeg, then run `python convert_movie.py "My Movie.mkv"`.
2. It creates `My Movie_web/` with `movie.mp4` (video copied untouched + AAC audio, fast-start), plus
   `.m4a` files for any other audio language and `.vtt` files for every subtitle track.
   Add `--reencode-video` if the picture is black (HEVC/x265 or 10-bit files) – slow, but works everywhere.
3. Upload the files to Google Drive (Anyone with the link) and paste the printed line into `movies.js`
   (fill in the Drive IDs).
Shortcut for a single movie: `"player": "drive"` in `movies.js` always uses Google's player.

## Dual audio and subtitles
Browsers cannot switch audio / subtitle tracks that are *inside* a video file (only Safari can). So each extra
language is a separate small file, and the player plays it in sync with the picture:

```js
{ "name": "My Movie", "category": "Action", "poster": "", "driveId": "<movie.mp4 id>",
  "audioLabel": "English",
  "audio":     [ { "label": "Hindi",   "driveId": "<movie.hin.m4a id>" } ],
  "subtitles": [ { "label": "English", "driveId": "<movie.eng.vtt id>", "default": true },
                 { "label": "Bangla",  "driveId": "<movie.ben.vtt id>" } ] }
```
In the player: **Audio** button (speaker-note icon) switches language, **CC** button turns subtitles on/off,
picks a language, changes size, shifts timing (±0.5 s) or loads a `.srt`/`.vtt` from the device.
The choice is remembered per movie. Keyboard: `C` toggles subtitles.
`.srt` and `.vtt` work (UTF-8 recommended). The Netlify edge function serves these small files too.

## IMPORTANT: deploying on Netlify so seeking works
Google Drive cannot be streamed reliably straight into a custom player. The site therefore plays
videos through `/stream/<fileId>`, a small Netlify **Edge Function** (`netlify/edge-functions/stream.js`).

The plain drag-and-drop upload in the Netlify dashboard may only publish static files and skip the edge function.
To be sure it is included, deploy in one of these ways:
1. **Netlify CLI** (from inside the folder):
   `npm install -g netlify-cli` → `netlify login` → `netlify deploy --prod`
2. **GitHub**: put the folder in a repo and connect it to the Netlify site (every push redeploys).

Check it worked: open `https://YOUR-SITE.netlify.app/stream/<a-drive-file-id>` — you should get video data or a
short text error, NOT your normal 404 page.

If the edge function is missing the player automatically falls back to the direct Drive stream, then to Google's
own Drive player, so nothing breaks — but seeking may be poor there.

## Limits to know
- Files must be shared as "Anyone with the link".
- Google limits downloads per file ("too many users…"). Popular movies can hit that — a real video host avoids it.
- Streaming through Netlify uses your Netlify bandwidth. For many viewers use a video host / CDN and set
  `"src": "https://…/movie.mp4"` in `movies.js` (MP4: H.264 video + AAC audio plays everywhere).
- Per-movie override: `"player": "drive"` forces Google's own player.

## Player controls (VLC style)
- Tap: show/hide controls · double-tap left/right: ±10 s · double-tap centre: play/pause
- Swipe left/right: scrub · swipe up/down on the left: brightness · on the right: volume
- Lock button (bottom left) locks the controls · tap the remaining time to switch to total time
- Audio / CC buttons (bottom right): audio language, subtitles on/off, size, delay, load subtitle file
- ⋮ menu: speed, audio, subtitles, aspect ratio, Drive player, open in Drive
- Keyboard: Space, ←/→, J/L, ↑/↓, M, F, A, C, [ ]
