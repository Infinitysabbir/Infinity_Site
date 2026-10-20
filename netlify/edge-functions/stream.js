// Infinity video proxy for Netlify (Edge Function).
//
// Why: a phone's <video> tag needs a server that answers "Range" requests so seeking works.
// Google Drive's download link does not play nicely when the browser talks to it directly.
// This function sits in the middle: browser -> /stream/<driveFileId> -> Drive, forwarding the
// Range header and streaming the answer straight back (nothing is stored).
//
// Needs: the Drive file shared as "Anyone with the link". It cannot bypass Drive's own
// download quota ("too many users have viewed or downloaded this file").

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';

export default async (request) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  if (!/^[\w-]{12,}$/.test(id)) return new Response('Bad file id', { status: 400 });

  const headers = new Headers({ 'user-agent': UA });
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  const base = 'https://drive.usercontent.google.com/download?export=download&id=' + encodeURIComponent(id);
  let upstream;
  try {
    upstream = await fetch(base + '&confirm=t', { headers, redirect: 'follow' });

    // Large files: Drive may answer with a "can't scan for viruses" HTML page holding a hidden form.
    if ((upstream.headers.get('content-type') || '').includes('text/html')) {
      const html = await upstream.text();
      const action = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1];
      const params = new URLSearchParams();
      for (const m of html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)) {
        const name = (m[0].match(/name="([^"]*)"/) || [])[1];
        const value = (m[0].match(/value="([^"]*)"/) || [])[1];
        if (name) params.set(name, (value || '').replace(/&amp;/g, '&'));
      }
      if (!action || !params.get('id')) {
        return new Response('Google Drive did not return the video (file not shared, or download quota reached).', { status: 502 });
      }
      upstream = await fetch(action.replace(/&amp;/g, '&') + '?' + params.toString(), { headers, redirect: 'follow' });
    }
  } catch (err) {
    return new Response('Could not reach Google Drive.', { status: 502 });
  }

  const type = upstream.headers.get('content-type') || '';
  if ((upstream.status !== 200 && upstream.status !== 206) || type.includes('text/html')) {
    return new Response('Google Drive refused the request (status ' + upstream.status + ').', { status: 502 });
  }

  const out = new Headers();
  for (const h of ['content-length', 'content-range', 'last-modified', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('accept-ranges', 'bytes');
  // ?type=audio / ?type=text are used for separate audio files and subtitle files (same proxy, same Range support).
  const want = new URL(request.url).searchParams.get('type');
  const fallbackType = want === 'audio' ? 'audio/mp4' : want === 'text' ? 'text/plain; charset=utf-8' : 'video/mp4';
  out.set('content-type', /octet-stream|^$/.test(type) || want === 'text' ? fallbackType : type);
  out.set('cache-control', 'public, max-age=3600');
  out.set('x-content-type-options', 'nosniff');

  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
};

export const config = { path: '/stream/*' };
