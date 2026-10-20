// ============================================================
//  INFINITY — MOVIE LIST   (this is the ONLY file you edit to add movies)
//
//  EASIEST WAY:  run   python add_movie.py   and answer the questions.
//  MANUAL WAY :  copy one whole { ... }, line, paste it at the TOP of the
//                list (newest first), change the values, save, upload.
//
//  FIELDS
//  name      – movie title                                   (required)
//  category  – e.g. "Action • Sci-Fi". Every part separated by • , | or /
//              becomes a filter button on the site.
//  driveId   – full Google Drive link OR just the file ID    (required*)
//  poster    – (optional) image URL or Drive image link/ID. "" = automatic.
//  src       – (optional) direct video URL (.mp4/.webm) on your own server
//              or CDN. Plays smoothest of all. Overrides driveId.
//  player    – (optional) "drive" = always use Google Drive's own player
//              for this movie (use if a movie won't play in the custom one).
//
//  audio     – (optional) extra audio tracks for dual-audio movies, played in sync
//              with the picture and switchable from the Audio button:
//              "audio": [ { "label": "Hindi", "driveId": "<AAC .m4a file>" } ]
//              (use "src": "https://…" instead of driveId for your own hosting)
//  audioLabel– (optional) name of the video's own audio, e.g. "Bangla"
//  subtitles – (optional) subtitle files (.srt or .vtt) shown with the CC button:
//              "subtitles": [ { "label": "English", "driveId": "<.vtt file>", "default": true } ]
//              Users can also load a .srt/.vtt from their own device in the CC menu.
//              TIP: python convert_movie.py "movie.mkv" makes all these files for you
//              (and fixes movies that play with no sound).
//
//  * driveId OR src is needed. Drive files must be shared as
//    "Anyone with the link". "PASTE_LINK_OR_ID_HERE" shows "Coming soon".
//
//  KEEP the two marker lines (MOVIES START / MOVIES END) — the Python
//  helper uses them. Keep a comma after every movie except the last.
// ============================================================

const movieData = [
// >>> MOVIES START
    { "name": "Pressure Cooker", "category": "Hoichoi • Bengali", "poster": "", "driveId": "1jgugoZA5naWd4VKQvhUZtFg_xzOUOl3s" },
    { "name": "Inception", "category": "Action • Sci-Fi", "poster": "", "driveId": "PASTE_LINK_OR_ID_HERE" },
    { "name": "The Dark Knight", "category": "Drama • Crime", "poster": "", "driveId": "PASTE_LINK_OR_ID_HERE" }
// <<< MOVIES END
];

// ------------------------------------------------------------
//  Typo checker (safe to keep). Prints warnings in the browser
//  console (press F12) if an entry looks wrong.
// ------------------------------------------------------------
(function () {
    try {
        movieData.forEach(function (m, i) {
            var label = 'movies.js entry #' + (i + 1) + (m && m.name ? ' ("' + m.name + '")' : '');
            if (!m || !m.name) console.warn(label + ': missing "name".');
            if (m && m.src) return;
            if (!m || !m.driveId) { console.warn(label + ': missing "driveId".'); return; }
            var v = String(m.driveId);
            if (/^(PASTE|YOUR)/i.test(v)) return;
            if (/\/folders\//.test(v))
                console.warn(label + ': this is a Drive FOLDER link. Use the link of the video file itself.');
            else if (!/\/d\/[\w-]+/.test(v) && !/[?&]id=[\w-]+/.test(v) && !/^[\w-]{12,}$/.test(v.trim()))
                console.warn(label + ': driveId does not look like a Drive link or file ID.');
        });
    } catch (e) { /* never break the site */ }
})();
