(function(){
  const $ = s => document.querySelector(s);
  const grid=$('#grid'), chipsEl=$('#chips'), searchEl=$('#search'), countEl=$('#count'), emptyEl=$('#empty');
  const overlay=$('#overlay'), toastEl=$('#toast'), nav=$('#nav');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = matchMedia('(hover:hover) and (pointer:fine)').matches;

  const gradients = [
    ['#5b6cff','#1b1f4a'],['#e9a35b','#4a2a1b'],['#2f2f36','#8a1f3c'],
    ['#ff8fb8','#7a5bff'],['#46d6c8','#12384a'],['#8bd17c','#1e4d4a']
  ];

  /* ---------- helpers ---------- */
  function getDriveId(input){
    if(!input) return '';
    input = String(input).trim();
    const m = input.match(/\/d\/([\w-]+)/) || input.match(/[?&]id=([\w-]+)/);
    return m ? m[1] : input;
  }
  const isValidId = id => /^[\w-]{12,}$/.test(id) && !/^(PASTE|YOUR)/i.test(id);
  const hasDirectSrc = m => m && typeof m.src === 'string' && /^https?:\/\//i.test(m.src.trim());

  function posterSrc(poster, videoId){
    const thumb = id => 'https://drive.google.com/thumbnail?id=' + id + '&sz=w600';
    if(!poster) return isValidId(videoId) ? thumb(videoId) : '';
    poster = String(poster).trim();
    if(/drive\.google\.com/.test(poster) || /^[\w-]{20,}$/.test(poster)) return thumb(getDriveId(poster));
    return poster;
  }

  // Direct streaming URL for a Drive file (supports HTTP range requests = real seeking).
  const driveStream  = id => 'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t';
  const drivePreview = id => 'https://drive.google.com/file/d/' + id + '/preview';

  let toastTimer;
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 2600);
  }

  /* ---------- build cards ---------- */
  if(typeof movieData === 'undefined' || !Array.isArray(movieData)){
    emptyEl.hidden = false;
    emptyEl.innerHTML = '<b>Movie list not found</b>Keep <code>movies.js</code> in the same folder as <code>index.html</code>.';
    return;
  }

  const cards = [];
  const catSet = new Set();

  movieData.forEach((m, i) => {
    const id = getDriveId(m.driveId);
    const playable = isValidId(id) || hasDirectSrc(m);
    const cats = String(m.category || '').split(/[•,|\/]/).map(s=>s.trim()).filter(Boolean);
    cats.forEach(c => catSet.add(c));

    const el = document.createElement('article');
    el.className = 'card glass';
    el.tabIndex = 0;
    el.setAttribute('role','button');
    el.setAttribute('aria-label', 'Play ' + m.name);

    const poster = document.createElement('div');
    poster.className = 'poster';
    const g = gradients[i % gradients.length];
    poster.style.background = 'linear-gradient(160deg,' + g[0] + ',' + g[1] + ')';

    const pt = document.createElement('span');
    pt.className = 'ptitle';
    pt.textContent = m.name;
    poster.appendChild(pt);

    const src = posterSrc(m.poster, id);
    if(src){
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onload  = () => { img.classList.add('ok'); poster.classList.add('has-img'); };
      img.onerror = () => img.remove();
      img.src = src;
      poster.appendChild(img);
    }

    if(playable){
      const badge = document.createElement('div');
      badge.className = 'play-badge'; badge.textContent = '▶';
      poster.appendChild(badge);
    } else {
      const tag = document.createElement('div');
      tag.className = 'soon-tag'; tag.textContent = 'Coming soon';
      poster.appendChild(tag);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const h = document.createElement('h3'); h.textContent = m.name;
    const s = document.createElement('small'); s.textContent = m.category || '';
    meta.append(h, s);
    el.append(poster, meta);

    const open = () => openPlayer(m, id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } });

    if(finePointer && !reduceMotion){
      el.addEventListener('mouseenter', () => { el.style.transition = 'transform .12s ease-out, box-shadow .35s'; });
      el.addEventListener('mousemove', e => {
        const b = el.getBoundingClientRect();
        const x = (e.clientX - b.left)/b.width - .5, y = (e.clientY - b.top)/b.height - .5;
        el.style.transform = 'rotateY(' + (x*12) + 'deg) rotateX(' + (-y*12) + 'deg) translateZ(10px)';
      });
      el.addEventListener('mouseleave', () => { el.style.transition = ''; el.style.transform = ''; });
    }

    grid.appendChild(el);
    cards.push({ el, cats, text: (m.name + ' ' + (m.category||'')).toLowerCase() });
  });

  /* ---------- category chips ---------- */
  let activeCat = 'all';
  if(catSet.size > 1){
    ['all', ...catSet].forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip' + (c==='all' ? ' active' : '');
      b.textContent = c==='all' ? 'All' : c;
      b.dataset.cat = c;
      chipsEl.appendChild(b);
    });
    chipsEl.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if(!b) return;
      chipsEl.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x===b));
      activeCat = b.dataset.cat;
      b.scrollIntoView({inline:'center', block:'nearest', behavior: reduceMotion ? 'auto' : 'smooth'});
      applyFilter();
    });
  } else { chipsEl.hidden = true; }

  /* ---------- search + filter ---------- */
  function updateCount(n){ countEl.textContent = n + (n===1 ? ' title' : ' titles'); }
  function applyFilter(){
    const q = searchEl.value.trim().toLowerCase();
    let k = 0;
    cards.forEach(c => {
      const ok = (activeCat==='all' || c.cats.includes(activeCat)) && (!q || c.text.includes(q));
      c.el.classList.toggle('hide', !ok);
      if(ok){
        c.el.classList.remove('in'); void c.el.offsetWidth;
        c.el.style.setProperty('--d', Math.min(k, 8) * 55 + 'ms');
        c.el.classList.add('in');
        k++;
      }
    });
    updateCount(k);
    emptyEl.hidden = k > 0;
  }
  searchEl.addEventListener('input', applyFilter);
  updateCount(cards.length);

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => {
    let k = 0;
    entries.forEach(e => {
      if(e.isIntersecting){
        e.target.style.setProperty('--d', (k++ * 70) + 'ms');
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold:.1, rootMargin:'0px 0px -4% 0px' });
  cards.forEach(c => io.observe(c.el));

  /* ---------- nav condense + hero parallax ---------- */
  let ticking = false;
  addEventListener('scroll', () => {
    if(ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('scrolled', y > 30);
      if(!reduceMotion) document.documentElement.style.setProperty('--sy', Math.min(y, 800));
      ticking = false;
    });
  }, { passive:true });

  $('#browse').addEventListener('click', () => $('#movies').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));

  /* =====================================================================
     VLC-STYLE PLAYER
     ===================================================================== */
  const mk = d => '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>';
  const ICON = {
    back  : mk('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'),
    play  : mk('M8 5v14l11-7z'),
    pause : mk('M6 5h4v14H6zM14 5h4v14h-4z'),
    rew   : '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16.4" text-anchor="middle" font-size="6.6" font-weight="700" style="font-family:Roboto,sans-serif">10</text></svg>',
    fwd   : '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.4" text-anchor="middle" font-size="6.6" font-weight="700" style="font-family:Roboto,sans-serif">10</text></svg>',
    lock  : mk('M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z'),
    unlock: mk('M18 8h-1V6A5 5 0 0 0 7.1 5l1.9.4A3 3 0 0 1 15 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z'),
    aspect: mk('M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18v14z'),
    more  : mk('M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
    fs    : mk('M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z'),
    fsx   : mk('M8 5h2v5H5V8h3V5zm6 0h2v3h3v2h-5V5zM5 14h5v5H8v-3H5v-2zm9 0h5v2h-3v3h-2v-5z'),
    vol   : mk('M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'),
    mute  : mk('M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.4-2.4-1.4-1.4-2.4 2.4-2.4-2.4-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4z'),
    bri   : mk('M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z'),
    ffw   : mk('M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z'),
    rwd   : mk('M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z'),
    swap  : mk('M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z'),
    open  : mk('M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'),
    cc    : mk('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z'),
    audio : mk('M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z')
  };

  const vlc=$('#frameBox'), video=$('#video'), iframe=$('#videoFrame'), tapzone=$('#tapzone');
  const hud=$('#hud'), hudIcon=$('#hudIcon'), hudText=$('#hudText');
  const closeBtn=$('#close'), mTitle=$('#mTitle'), mSub=$('#mSub'), fsBtn=$('#fsBtn');
  const tCur=$('#tCur'), tEnd=$('#tEnd'), seekEl=$('#seek'), trackEl=$('#track'), bufBar=$('#bufBar'), progBar=$('#progBar'), thumbEl=$('#thumb'), tipEl=$('#tip');
  const lockBtn=$('#lockBtn'), aspectBtn=$('#aspectBtn'), backBtn=$('#backBtn'), ppBtn=$('#ppBtn'), fwdBtn=$('#fwdBtn'), moreBtn=$('#moreBtn');
  const menu=$('#menu'), unlockBtn=$('#unlockBtn'), fxL=$('#fxL'), fxR=$('#fxR'), speedRow=$('#speedRow');
  const switchBtn=$('#switchBtn'), driveLink=$('#driveLink'), aspectItem=$('#aspectItem'), aspectName=$('#aspectName'), aspectChip=$('#aspectChip');
  const subsEl=$('#subs'), noticeEl=$('#notice'), noticeText=$('#noticeText'), noticeDrive=$('#noticeDrive'), noticeClose=$('#noticeClose');
  const panel=$('#panel'), panelTitle=$('#panelTitle'), panelList=$('#panelList'), panelExtra=$('#panelExtra'), panelBack=$('#panelBack');
  const audioBtn=$('#audioBtn'), ccBtn=$('#ccBtn'), audioItem=$('#audioItem'), subItem=$('#subItem'), audioName=$('#audioName'), subName=$('#subName');

  closeBtn.innerHTML = ICON.back; fsBtn.innerHTML = ICON.fs; lockBtn.innerHTML = ICON.lock; unlockBtn.innerHTML = ICON.lock;
  aspectBtn.innerHTML = ICON.aspect; backBtn.innerHTML = ICON.rew; fwdBtn.innerHTML = ICON.fwd; moreBtn.innerHTML = ICON.more; ppBtn.innerHTML = ICON.play;
  $('#aspectIcon').innerHTML = ICON.aspect; $('#switchIcon').innerHTML = ICON.swap; $('#openIcon').innerHTML = ICON.open;
  $('#audioIcon').innerHTML = ICON.audio; $('#subIcon').innerHTML = ICON.cc;
  audioBtn.innerHTML = ICON.audio; ccBtn.innerHTML = ICON.cc; panelBack.innerHTML = ICON.back;
  if(finePointer) vlc.classList.add('desktop');

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const ASPECTS = [
    { n:'Best fit' }, { n:'Fill' }, { n:'16:9', r:16/9 }, { n:'4:3', r:4/3 }, { n:'Stretch' }
  ];
  const SKIP = 10;
  let isOpen=false, lastFocus=null, clearTimer, curId='', usingFallback=false, metaLoaded=false, loadTimer;
  let sources=[], srcIdx=0, dragging=false, hideTimer, hudTimer, lastSave=0, pendingResume=0;
  let locked=false, remaining=true, aspectIdx=0, brightness=1, wakeLock=null;
  let uiVol=1, uiMuted=false;          // our own volume state (the <video> is muted while an external audio track plays)

  SPEEDS.forEach(s => {
    const b = document.createElement('button');
    b.textContent = s + '×'; b.dataset.s = s;
    b.addEventListener('click', () => { video.playbackRate = s; });
    speedRow.appendChild(b);
  });

  const fmt = s => {
    if(!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60, p = n => String(n).padStart(2,'0');
    return (h ? h + ':' + p(m) : p(m)) + ':' + p(x);
  };
  const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
  const dur = () => (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
  const setState = (cls, on) => vlc.classList.toggle(cls, on);

  /* ----- HUD (volume / brightness / swipe seek / aspect) ----- */
  function showHud(icon, text){
    hudIcon.innerHTML = icon; hudText.textContent = text;
    hud.classList.add('show');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove('show'), 900);
  }
  function holdHud(icon, text){ clearTimeout(hudTimer); hudIcon.innerHTML = icon; hudText.textContent = text; hud.classList.add('show'); }
  function hideHud(){ clearTimeout(hudTimer); hudTimer = setTimeout(() => hud.classList.remove('show'), 250); }

  /* ----- progress ----- */
  function updateProgress(t){
    const d = dur();
    if(t == null) t = video.currentTime;
    const pct = d ? clamp(t / d * 100, 0, 100) : 0;
    progBar.style.width = pct + '%';
    thumbEl.style.left = pct + '%';
    tCur.textContent = fmt(t);
    tEnd.textContent = d ? (remaining ? '-' + fmt(d - t) : fmt(d)) : '--:--';
    seekEl.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  function updateBuffered(){
    const d = dur(); if(!d) return;
    const b = video.buffered, t = video.currentTime;
    let end = 0;
    for(let i = 0; i < b.length; i++){ if(b.start(i) <= t + 0.5 && b.end(i) >= end) end = b.end(i); }
    bufBar.style.width = clamp(end / d * 100, 0, 100) + '%';
  }
  tEnd.addEventListener('click', () => { remaining = !remaining; updateProgress(); });

  /* ----- controls visibility ----- */
  function showControls(){
    setState('show', true);
    setState('hide-cursor', false);
    clearTimeout(hideTimer);
    if(!usingFallback && !video.paused && !dragging && anyMenuOpen() === false){
      hideTimer = setTimeout(() => {
        setState('show', false);
        if(finePointer) setState('hide-cursor', true);
      }, 3500);
    }
  }
  function hideControls(){ clearTimeout(hideTimer); if(!dragging) setState('show', false); closeMenu(); }

  /* ----- menu ----- */
  const anyMenuOpen = () => menu.classList.contains('open') || panel.classList.contains('open');
  function openMenu(){ menu.classList.add('open'); clearTimeout(hideTimer); setState('show', true); }
  function closeMenu(){ menu.classList.remove('open'); panel.classList.remove('open'); }
  moreBtn.addEventListener('click', e => { e.stopPropagation(); if(menu.classList.contains('open')){ closeMenu(); showControls(); } else { closeMenu(); openMenu(); } });
  menu.addEventListener('click', e => e.stopPropagation());
  panel.addEventListener('click', e => e.stopPropagation());

  /* ----- actions ----- */
  function togglePlay(){
    if(usingFallback) return;
    if(video.paused || video.ended){
      const p = video.play();
      if(p && p.catch) p.catch(() => { setState('paused', true); showControls(); });
    } else video.pause();
  }
  function seekTo(t){
    const d = dur(); if(!d) return;
    t = clamp(t, 0, d);
    try{ video.currentTime = t; }catch(e){}
    updateProgress(t);
  }
  function skip(sec, fx){
    seekTo(video.currentTime + sec);
    if(fx){
      const el = sec < 0 ? fxL : fxR;
      el.textContent = sec < 0 ? '« ' + Math.abs(sec) + 's' : Math.abs(sec) + 's »';
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    }
    showControls();
  }
  function applyAspect(){
    const a = ASPECTS[aspectIdx];
    video.style.width = '100%'; video.style.height = '100%';
    video.style.objectFit = a.n === 'Fill' ? 'cover' : a.n === 'Stretch' ? 'fill' : 'contain';
    if(a.r){
      const cw = vlc.clientWidth, ch = vlc.clientHeight;
      const w = Math.min(cw, ch * a.r);
      video.style.width = w + 'px'; video.style.height = (w / a.r) + 'px'; video.style.objectFit = 'fill';
    }
    aspectName.textContent = a.n; aspectChip.textContent = a.n;
  }
  function cycleAspect(){
    aspectIdx = (aspectIdx + 1) % ASPECTS.length;
    applyAspect();
    showHud(ICON.aspect, ASPECTS[aspectIdx].n);
  }
  addEventListener('resize', () => { if(isOpen) applyAspect(); });
  function setLocked(on){
    locked = on; setState('locked', on); closeMenu();
    unlockBtn.innerHTML = ICON.lock;
    if(on){ setState('show', true); clearTimeout(hideTimer); hideTimer = setTimeout(() => setState('show', false), 2500); showHud(ICON.lock, 'Controls locked'); }
    else { showHud(ICON.unlock, 'Unlocked'); showControls(); }
  }

  /* ----- fullscreen (element fullscreen; native video fullscreen on iPhone) ----- */
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFS(){
    if(fsElement()){ (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = vlc.requestFullscreen || vlc.webkitRequestFullscreen;
    if(req){
      Promise.resolve(req.call(vlc)).then(() => { try{ screen.orientation.lock('landscape').catch(()=>{}); }catch(e){} }).catch(()=>{});
    } else if(video.webkitEnterFullscreen){ video.webkitEnterFullscreen(); }
  }
  function onFsChange(){
    fsBtn.innerHTML = fsElement() ? ICON.fsx : ICON.fs;
    if(!fsElement()){ try{ screen.orientation.unlock(); }catch(e){} }
    applyAspect(); showControls();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  /* ----- keep the screen awake while playing ----- */
  async function takeWake(){ try{ if('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){} }
  function dropWake(){ try{ if(wakeLock){ wakeLock.release(); wakeLock = null; } }catch(e){ wakeLock = null; } }

  /* ----- video events ----- */
  video.addEventListener('play',   () => { setState('paused', false); ppBtn.innerHTML = ICON.pause; ppBtn.setAttribute('aria-label','Pause'); showControls(); takeWake(); });
  video.addEventListener('pause',  () => { setState('paused', true);  ppBtn.innerHTML = ICON.play;  ppBtn.setAttribute('aria-label','Play'); showControls(); saveProgress(); dropWake(); });
  video.addEventListener('ended',  () => { setState('paused', true);  ppBtn.innerHTML = ICON.play; showControls(); clearProgress(); dropWake(); });
  video.addEventListener('timeupdate', () => {
    if(!dragging) updateProgress();
    const now = Date.now();
    if(now - lastSave > 4000){ lastSave = now; saveProgress(); }
  });
  video.addEventListener('progress', updateBuffered);
  video.addEventListener('durationchange', () => { updateProgress(); updateBuffered(); });
  video.addEventListener('loadedmetadata', () => {
    metaLoaded = true; clearTimeout(loadTimer);
    updateProgress(); updateBuffered(); applyAspect();
    if(pendingResume > 5 && dur() && pendingResume < dur() - 15){
      try{ video.currentTime = pendingResume; toast('Resumed from ' + fmt(pendingResume)); }catch(e){}
    }
    pendingResume = 0;
  });
  // The spinner is only an overlay: the picture is never hidden, so seeking keeps the last frame instead of going black.
  ['waiting','seeking','loadstart','stalled'].forEach(ev => video.addEventListener(ev, () => { if(!usingFallback && isOpen) setState('loading', true); }));
  ['playing','seeked','canplay','canplaythrough','loadeddata'].forEach(ev => video.addEventListener(ev, () => { setState('loading', false); updateBuffered(); }));
  video.addEventListener('ratechange', () => {
    speedRow.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === video.playbackRate));
    if(isOpen) showHud(ICON.ffw, video.playbackRate + '×');
  });
  video.addEventListener('volumechange', () => { /* HUD is shown by the gesture / key handlers */ });
  video.addEventListener('error', () => { if(isOpen && !usingFallback && video.getAttribute('src')) nextSource(); });
  video.addEventListener('webkitendfullscreen', showControls);

  /* ----- sources: our Netlify proxy -> direct Drive stream -> Drive's own player ----- */
  function loadSource(i){
    srcIdx = i;
    if(i >= sources.length){ switchToDrive(true); return; }
    clearTimeout(loadTimer);
    metaLoaded = false;
    setState('loading', true);
    video.src = sources[i];
    video.load();
    const p = video.play(); if(p && p.catch) p.catch(() => {});
    const last = i === sources.length - 1 && !curId;
    loadTimer = setTimeout(() => { if(isOpen && !metaLoaded && !usingFallback) nextSource(); }, last ? 30000 : 9000);
  }
  function nextSource(){
    if(metaLoaded) pendingResume = video.currentTime || pendingResume;   // keep position when switching mid-movie
    loadSource(srcIdx + 1);
  }
  function switchToDrive(auto){
    if(usingFallback) return;
    if(!curId){ setState('loading', false); toast('This video could not be loaded.'); return; }
    usingFallback = true;
    clearTimeout(loadTimer);
    try{ video.pause(); }catch(e){}
    video.removeAttribute('src'); video.load();
    video.hidden = true; iframe.hidden = false;
    resetTracks();
    setState('fallback', true); setState('loading', false); setState('show', true);
    closeMenu(); dropWake();
    iframe.src = drivePreview(curId);
    switchBtn.hidden = true;
    if(auto) toast('Using the Google Drive player');
  }
  switchBtn.addEventListener('click', () => { closeMenu(); switchToDrive(false); });

  /* ----- seek bar (mouse / touch / pen, one seek on release) ----- */
  function ratioFromEvent(e){
    const r = trackEl.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  }
  function showTip(e){
    const d = dur(); if(!d) return;
    const r = ratioFromEvent(e);
    tipEl.textContent = fmt(r * d);
    const w = trackEl.getBoundingClientRect().width;
    tipEl.style.left = clamp(r * w, 28, w - 28) + 'px';
  }
  seekEl.addEventListener('pointerdown', e => {
    if(!dur()) return;
    dragging = true; seekEl.classList.add('drag');
    try{ seekEl.setPointerCapture(e.pointerId); }catch(_){}
    clearTimeout(hideTimer);
    updateProgress(ratioFromEvent(e) * dur()); showTip(e);
    e.preventDefault();
  });
  seekEl.addEventListener('pointermove', e => {
    if(dragging){ updateProgress(ratioFromEvent(e) * dur()); showTip(e); }
    else if(e.pointerType === 'mouse'){ seekEl.classList.add('hov'); showTip(e); }
  });
  seekEl.addEventListener('pointerleave', () => seekEl.classList.remove('hov'));
  seekEl.addEventListener('pointerup', e => {
    if(!dragging) return;
    dragging = false; seekEl.classList.remove('drag');
    try{ seekEl.releasePointerCapture(e.pointerId); }catch(_){}
    seekTo(ratioFromEvent(e) * dur());
    showControls();
  });
  seekEl.addEventListener('pointercancel', () => { dragging = false; seekEl.classList.remove('drag'); updateProgress(); });
  seekEl.addEventListener('keydown', e => {
    if(e.key === 'ArrowLeft'){ skip(-5); e.preventDefault(); e.stopPropagation(); }
    else if(e.key === 'ArrowRight'){ skip(5); e.preventDefault(); e.stopPropagation(); }
  });

  /* ----- buttons ----- */
  ppBtn.addEventListener('click', togglePlay);
  backBtn.addEventListener('click', () => skip(-SKIP, true));
  fwdBtn.addEventListener('click', () => skip(SKIP, true));
  aspectBtn.addEventListener('click', cycleAspect);
  aspectItem.addEventListener('click', cycleAspect);
  lockBtn.addEventListener('click', () => setLocked(true));
  unlockBtn.addEventListener('click', () => setLocked(false));
  fsBtn.addEventListener('click', toggleFS);
  closeBtn.addEventListener('click', () => closePlayer());
  [$('#vtop'), $('#vbottom')].forEach(el => el.addEventListener('pointermove', () => { if(finePointer) showControls(); }));

  /* ----- gestures on the picture (VLC style) -----
       tap = show/hide controls   double-tap sides = ±10s   double-tap centre = play/pause
       swipe left/right = scrub   swipe up/down on LEFT = brightness, on RIGHT = volume */
  let g = null, lastTap = 0, tapTimer = null;
  const SCRUB_SPAN = 240;   // seconds covered by one full-width swipe
  tapzone.addEventListener('pointerdown', e => {
    if(anyMenuOpen()){ closeMenu(); showControls(); return; }
    if(locked) return;
    const r = tapzone.getBoundingClientRect();
    g = { id:e.pointerId, x:e.clientX, y:e.clientY, w:r.width, h:r.height, left:r.left, mode:null, t0:video.currentTime,
          vol:uiMuted ? 0 : uiVol, bri:brightness, type:e.pointerType, target:null };
    try{ tapzone.setPointerCapture(e.pointerId); }catch(_){}
  });
  tapzone.addEventListener('pointermove', e => {
    if(e.pointerType === 'mouse' && !g){ showControls(); return; }
    if(!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(!g.mode && g.type !== 'mouse'){
      if(Math.abs(dx) > 14 || Math.abs(dy) > 14){
        g.mode = Math.abs(dx) > Math.abs(dy) ? (dur() ? 'seek' : 'none') : ((g.x - g.left) < g.w / 2 ? 'bri' : 'vol');
        clearTimeout(tapTimer); lastTap = 0; dragging = (g.mode === 'seek');
      }
    }
    if(g.mode === 'seek'){
      const span = Math.min(dur(), SCRUB_SPAN);
      const target = clamp(g.t0 + dx / g.w * span, 0, dur());
      g.target = target;
      const diff = Math.round(target - g.t0);
      holdHud(diff < 0 ? ICON.rwd : ICON.ffw, (diff >= 0 ? '+' : '-') + fmt(Math.abs(diff)) + '  [' + fmt(target) + ']');
      updateProgress(target);
    } else if(g.mode === 'bri'){
      brightness = clamp(g.bri - dy / (g.h * 0.7), 0.15, 1.6);
      video.style.filter = brightness === 1 ? '' : 'brightness(' + brightness + ')';
      holdHud(ICON.bri, Math.round(brightness / 1.6 * 100) + '%');
    } else if(g.mode === 'vol'){
      const v = clamp(g.vol - dy / (g.h * 0.7), 0, 1);
      uiMuted = (v === 0); uiVol = v; applyVolume();
      holdHud(v === 0 ? ICON.mute : ICON.vol, Math.round(v * 100) + '%');
    }
  });
  function endGesture(e, cancelled){
    if(!g || (e && e.pointerId !== g.id)) return;
    const cur = g; g = null; dragging = false;
    try{ tapzone.releasePointerCapture(cur.id); }catch(_){}
    if(cancelled){ hideHud(); updateProgress(); return; }
    if(cur.mode === 'seek'){ if(cur.target != null) seekTo(cur.target); hideHud(); showControls(); return; }
    if(cur.mode){ hideHud(); return; }
    // it was a tap
    const now = performance.now();
    if(cur.type === 'mouse'){
      if(now - lastTap < 300){ clearTimeout(tapTimer); lastTap = 0; toggleFS(); return; }
      lastTap = now;
      tapTimer = setTimeout(togglePlay, 260);
      return;
    }
    const x = (cur.x - cur.left) / cur.w;
    if(now - lastTap < 300){
      clearTimeout(tapTimer); lastTap = 0;
      if(x < 0.35) skip(-SKIP, true); else if(x > 0.65) skip(SKIP, true); else togglePlay();
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => { (vlc.classList.contains('show') && !video.paused) ? hideControls() : showControls(); }, 260);
  }
  tapzone.addEventListener('pointerup', e => endGesture(e, false));
  tapzone.addEventListener('pointercancel', e => endGesture(e, true));
  // locked: any tap just reveals the unlock button
  tapzone.addEventListener('click', () => { if(locked){ setState('show', true); clearTimeout(hideTimer); hideTimer = setTimeout(() => setState('show', false), 2500); } });
  tapzone.addEventListener('contextmenu', e => e.preventDefault());

  /* ----- keyboard ----- */
  addEventListener('keydown', e => {
    if(!isOpen) return;
    if(e.key === 'Escape'){ if(anyMenuOpen()) closeMenu(); else if(!fsElement()) closePlayer(); return; }
    if(usingFallback || locked) return;
    switch(e.key){
      case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); showControls(); break;
      case 'ArrowLeft':  e.preventDefault(); skip(-5, true); break;
      case 'ArrowRight': e.preventDefault(); skip(5, true); break;
      case 'j': case 'J': skip(-SKIP, true); break;
      case 'l': case 'L': skip(SKIP, true); break;
      case 'ArrowUp':   e.preventDefault(); uiMuted = false; uiVol = clamp(uiVol + .1, 0, 1); applyVolume(); showHud(ICON.vol, Math.round(uiVol*100) + '%'); break;
      case 'ArrowDown': e.preventDefault(); uiVol = clamp(uiVol - .1, 0, 1); applyVolume(); showHud(uiVol ? ICON.vol : ICON.mute, Math.round(uiVol*100) + '%'); break;
      case 'm': case 'M': uiMuted = !uiMuted; applyVolume(); showHud(uiMuted ? ICON.mute : ICON.vol, uiMuted ? 'Muted' : Math.round(uiVol*100) + '%'); break;
      case 'c': case 'C': toggleSubs(); break;
      case 'f': case 'F': toggleFS(); break;
      case 'a': case 'A': cycleAspect(); break;
      case '[': video.playbackRate = SPEEDS[Math.max(0, SPEEDS.indexOf(video.playbackRate) - 1)] || 1; break;
      case ']': video.playbackRate = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(video.playbackRate) + 1)] || 1; break;
    }
  });

  /* ----- resume position ----- */
  const posKey = () => 'infinity_pos_' + (curId || sources[0] || '');
  function saveProgress(){
    if(usingFallback || !dur()) return;
    try{ if(video.currentTime > 5 && video.currentTime < dur() - 15) localStorage.setItem(posKey(), String(Math.floor(video.currentTime))); }catch(e){}
  }
  function clearProgress(){ try{ localStorage.removeItem(posKey()); }catch(e){} }
  function loadProgress(){ try{ return +localStorage.getItem(posKey()) || 0; }catch(e){ return 0; } }

  /* ----- lock-screen / headset controls ----- */
  function setupMediaSession(title){
    if(!('mediaSession' in navigator)) return;
    try{
      navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: 'Infinity' });
      navigator.mediaSession.setActionHandler('play',  () => video.play());
      navigator.mediaSession.setActionHandler('pause', () => video.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-SKIP));
      navigator.mediaSession.setActionHandler('seekforward',  () => skip(SKIP));
      navigator.mediaSession.setActionHandler('seekto', d => { if(d && d.seekTime != null) seekTo(d.seekTime); });
    }catch(e){}
  }

  /* =====================================================================
     SOUND CHECK  +  AUDIO TRACKS  +  SUBTITLES
     ---------------------------------------------------------------------
     Why a movie can be silent: "high quality" files usually carry AC-3 / E-AC-3 / DTS audio.
     Browsers cannot decode those, so they play the picture and drop the sound.
     1. We detect that and offer Google's Drive player (it converts the audio on the fly).
     2. Real fix = AAC audio. Extra audio files / subtitle files listed in movies.js are played
        in sync with the picture, and the Audio / CC buttons let you switch.
     ===================================================================== */
  const lsGet = k => { try{ return localStorage.getItem(k) || ''; }catch(e){ return ''; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  function langName(code){
    if(!code || code === 'und') return '';
    try{ return new Intl.DisplayNames(['en'], { type:'language' }).of(code) || code; }catch(e){ return code; }
  }

  let curMovie=null, movieKey='';
  let silenceTimer=0, silenceDone=false, noticeOff=false, audioSilent=false;
  let audioList=[], audioSel=0, extActive=false, audTimer=0;
  let subList=[], subSel=-1, subCues=null, subDelay=0, subRaf=0, subShown='', subToken=0, lastSub=-1, panelMode='';
  let subScale = +lsGet('infinity_subsize') || 1;
  const aud = new Audio(); aud.preload = 'auto';
  subsEl.style.setProperty('--subsize', subScale);

  /* ----- volume: one place, so the picture's own sound and an external track stay consistent ----- */
  function applyVolume(){
    if(extActive){ video.muted = true; aud.muted = uiMuted; aud.volume = uiVol; }
    else { aud.muted = true; video.muted = uiMuted; try{ video.volume = uiVol; }catch(e){} }
  }

  /* ----- 1) no-sound detection ----- */
  function decodedAudio(){            // true = sound is being decoded, false = none, null = this browser can't tell
    if(typeof video.webkitAudioDecodedByteCount === 'number') return video.webkitAudioDecodedByteCount > 0;   // Chrome, Edge, Safari
    if('mozHasAudio' in video) return !!video.mozHasAudio;                                                      // Firefox
    if(video.audioTracks) return video.audioTracks.length > 0;
    return null;
  }
  function armSilenceCheck(){
    clearTimeout(silenceTimer);
    if(silenceDone || usingFallback || extActive || !isOpen) return;
    silenceTimer = setTimeout(checkSilence, 3500);
  }
  function checkSilence(){
    if(silenceDone || usingFallback || extActive || !isOpen) return;
    if(video.paused || video.seeking || video.readyState < 3 || uiMuted || uiVol === 0) return;   // re-armed when playback / volume resumes
    silenceDone = true;
    if(decodedAudio() !== false) return;
    audioSilent = true;
    showNotice();
    buildAudio(); updateAudioUI();
  }
  function showNotice(){
    if(noticeOff) return;
    noticeDrive.hidden = !curId;
    noticeText.textContent = curId
      ? "This file's audio format (AC-3 / E-AC-3 / DTS) can't be decoded by your browser, so it plays without sound. Google's Drive player converts the audio for you."
      : "This file's audio format (AC-3 / E-AC-3 / DTS) can't be decoded by your browser. Convert the audio to AAC with convert_movie.py (see README) or add an AAC audio file in movies.js.";
    noticeEl.hidden = false;
  }
  noticeDrive.addEventListener('click', () => { noticeEl.hidden = true; switchToDrive(false); });
  noticeClose.addEventListener('click', () => { noticeEl.hidden = true; noticeOff = true; });

  /* ----- helpers for urls listed in movies.js ----- */
  function urlsFor(e, kind){
    const out = [];
    if(!e) return out;
    const raw = String(e.driveId || e.src || '').trim();
    if(!raw) return out;
    if(/^https?:\/\//i.test(raw) && !/drive\.(usercontent\.)?google\.com/i.test(raw)){ out.push(raw); return out; }
    const id = getDriveId(raw);
    if(isValidId(id)){
      if(/^https?:$/.test(location.protocol)) out.push(new URL('stream/' + id + '?type=' + kind, location.href).href);   // Netlify proxy
      if(kind === 'audio') out.push(driveStream(id));                                                                    // <audio> needs no CORS
    }
    return out;
  }
  const trackName = (t, i, word) => (t.label && t.label.trim()) || langName(t.language) || (word + ' ' + (i + 1));

  /* ----- 2) audio tracks ----- */
  const nativeAudio = () => { const t = video.audioTracks; return t && t.length ? Array.from({ length:t.length }, (_, i) => t[i]) : []; };
  function buildAudio(){
    const prev = audioList[audioSel] && audioList[audioSel].id;
    audioList = [];
    const nat = nativeAudio();
    if(nat.length){
      nat.forEach((t, i) => audioList.push({ id:'n' + i, kind:'native', idx:i, label:trackName(t, i, 'Audio'), sub:'' }));
    } else {
      audioList.push({ id:'orig', kind:'orig', label:(curMovie && curMovie.audioLabel) || 'Original audio', sub: audioSilent ? 'no sound (unsupported format)' : '' });
    }
    ((curMovie && curMovie.audio) || []).forEach((a, i) => {
      const urls = urlsFor(a, 'audio'); if(!urls.length) return;
      audioList.push({ id:'x' + i, kind:'ext', label:a.label || ('Audio ' + (i + 1)), sub:langName(a.lang), urls:urls });
    });
    const k = audioList.findIndex(a => a.id === prev);
    if(k >= 0) audioSel = k;
    else if(nat.length){ const e = nat.findIndex(t => t.enabled); audioSel = e >= 0 ? e : 0; }
    else audioSel = 0;
    if(extActive && !(audioList[audioSel] && audioList[audioSel].kind === 'ext')) stopExt();
  }
  function updateAudioUI(){
    const a = audioList[audioSel];
    audioName.textContent = a ? a.label : 'Default';
    audioBtn.classList.toggle('has-subs', !!a && a.kind === 'ext');
    if(panel.classList.contains('open') && panelMode === 'audio') renderPanel();
  }
  function audSync(force){
    if(!extActive) return;
    const want = video.currentTime;
    if(force || Math.abs(aud.currentTime - want) > 0.3){ try{ aud.currentTime = want; }catch(e){} }
  }
  function startExt(a){
    extActive = true; clearTimeout(silenceTimer); noticeEl.hidden = true;
    let n = 0;
    const load = () => {
      if(n >= a.urls.length){ toast('Could not load that audio track.'); stopExt(); audioSel = 0; updateAudioUI(); return; }
      aud.src = a.urls[n++]; aud.load();
    };
    aud.onerror = load;
    aud.onloadedmetadata = () => { audSync(true); if(!video.paused) aud.play().catch(() => {}); };
    load();
    aud.playbackRate = video.playbackRate;
    applyVolume();
    clearInterval(audTimer); audTimer = setInterval(() => audSync(false), 1000);
  }
  function stopExt(){
    const was = extActive;
    extActive = false; clearInterval(audTimer);
    aud.onerror = null; aud.onloadedmetadata = null;
    try{ aud.pause(); }catch(e){}
    if(was){ aud.removeAttribute('src'); aud.load(); }
    applyVolume();
    if(was && isOpen) armSilenceCheck();
  }
  function selectAudio(i, quiet){
    const a = audioList[i]; if(!a) return;
    audioSel = i;
    if(a.kind === 'ext') startExt(a);
    else {
      stopExt();
      if(a.kind === 'native'){ const t = video.audioTracks; for(let k = 0; k < t.length; k++) t[k].enabled = (k === a.idx); }
    }
    lsSet('infinity_audio_' + movieKey, i === 0 ? '' : a.label);
    updateAudioUI();
    if(!quiet) showHud(ICON.audio, a.label);
  }
  video.addEventListener('play',    () => { if(extActive){ audSync(true); aud.play().catch(() => {}); } kickSubs(); });
  video.addEventListener('playing', () => { if(extActive){ audSync(true); aud.play().catch(() => {}); } armSilenceCheck(); kickSubs(); });
  video.addEventListener('pause',   () => { if(extActive) aud.pause(); clearTimeout(silenceTimer); renderSubs(); });
  video.addEventListener('waiting', () => { if(extActive) aud.pause(); clearTimeout(silenceTimer); });
  video.addEventListener('seeking', () => { clearTimeout(silenceTimer); if(extActive){ aud.pause(); try{ aud.currentTime = video.currentTime; }catch(e){} } renderSubs(); });
  video.addEventListener('seeked',  () => { if(extActive){ audSync(true); if(!video.paused) aud.play().catch(() => {}); } renderSubs(); });
  video.addEventListener('ended',   () => { try{ aud.pause(); }catch(e){} });
  video.addEventListener('ratechange', () => { aud.playbackRate = video.playbackRate; });
  video.addEventListener('volumechange', () => { if(!silenceDone) armSilenceCheck(); });
  video.addEventListener('timeupdate', () => { renderSubs(); });
  if(video.audioTracks && video.audioTracks.addEventListener){
    video.audioTracks.addEventListener('addtrack', () => { buildAudio(); updateAudioUI(); });
  }

  /* ----- 3) subtitles (own renderer: same look everywhere, size + delay adjustable) ----- */
  function parseTime(str){
    const m = String(str).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
    if(!m) return NaN;
    return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +('0.' + m[4].padEnd(3, '0')) : 0);
  }
  function cleanCue(t){
    t = t.replace(/\{\\[^}]*\}/g, '');                               // {\an8} style codes
    return t.split(/(<\/?[ibu]>)/i).map((part, i) => {
      if(i % 2) return part.toLowerCase();                           // keep <i> <b> <u>
      part = part.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      return esc(part);
    }).join('');
  }
  function parseSubs(text){                                          // SRT + WebVTT
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const cues = [];
    text.split(/\n{2,}/).forEach(block => {
      const lines = block.split('\n');
      const ti = lines.findIndex(l => l.indexOf('-->') > -1);
      if(ti < 0) return;
      const parts = lines[ti].split('-->');
      const s = parseTime(parts[0]), e = parseTime(parts[1].trim().split(/\s+/)[0]);
      const body = lines.slice(ti + 1).join('\n').trim();
      if(isNaN(s) || isNaN(e) || !body) return;
      cues.push({ s:s, e:e, h:cleanCue(body) });
    });
    return cues.sort((a, b) => a.s - b.s);
  }
  function decodeBuf(buf){
    try{ return new TextDecoder('utf-8', { fatal:true }).decode(buf); }
    catch(e){ try{ return new TextDecoder('windows-1252').decode(buf); }catch(_){ return new TextDecoder().decode(buf); } }
  }
  async function fetchText(urls){
    let err;
    for(const u of urls){
      try{
        const r = await fetch(u, { credentials:'omit' });
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return decodeBuf(await r.arrayBuffer());
      }catch(e){ err = e; }
    }
    throw err || new Error('no url');
  }
  const nativeSubs = () => {
    const out = [], tt = video.textTracks;
    for(let i = 0; tt && i < tt.length; i++) if(tt[i].kind === 'subtitles' || tt[i].kind === 'captions') out.push(tt[i]);
    return out;
  };
  function buildSubs(){
    const keep = subList.filter(x => x.kind === 'ext');
    subList = keep.concat(nativeSubs().map((t, i) => ({ id:'t' + i, kind:'native', track:t, label:trackName(t, i, 'Subtitle'), sub:'embedded' })));
  }
  function renderSubs(){
    if(!subCues){ if(subShown){ subsEl.innerHTML = ''; subShown = ''; } return; }
    const t = video.currentTime - subDelay;
    let lo = 0, hi = subCues.length - 1, i = -1;
    while(lo <= hi){ const mid = (lo + hi) >> 1; if(subCues[mid].s <= t){ i = mid; lo = mid + 1; } else hi = mid - 1; }
    const out = [];
    for(let k = i; k >= 0 && k > i - 6; k--) if(subCues[k].e > t) out.unshift('<span>' + subCues[k].h + '</span>');
    const html = out.join('<br>');
    if(html !== subShown){ subShown = html; subsEl.innerHTML = html; }
  }
  function subLoop(){ renderSubs(); subRaf = (isOpen && !video.paused && subCues) ? requestAnimationFrame(subLoop) : 0; }
  function kickSubs(){ if(!subRaf && subCues && !video.paused) subRaf = requestAnimationFrame(subLoop); }
  function updateSubUI(){
    const s = subList[subSel];
    subName.textContent = s ? s.label : 'Off';
    ccBtn.classList.toggle('has-subs', !!s);
    if(panel.classList.contains('open') && panelMode === 'subs') renderPanel();
  }
  async function selectSub(i, quiet){
    subSel = i; const token = ++subToken;
    nativeSubs().forEach(t => { try{ t.mode = 'disabled'; }catch(e){} });
    subCues = null; renderSubs(); updateSubUI();
    if(i < 0){ lsSet('infinity_sub_' + movieKey, 'off'); if(!quiet) showHud(ICON.cc, 'Subtitles off'); return; }
    const s = subList[i];
    if(!s.local) lsSet('infinity_sub_' + movieKey, s.label);
    lastSub = i;
    if(s.kind === 'native'){ try{ s.track.mode = 'showing'; }catch(e){} if(!quiet) showHud(ICON.cc, s.label); return; }
    if(!s.cues){
      if(!quiet) showHud(ICON.cc, 'Loading subtitles…');
      try{ s.cues = parseSubs(await fetchText(s.urls)); if(!s.cues.length) throw new Error('empty'); }
      catch(e){
        if(token === subToken){
          toast("Couldn't load these subtitles (check the link / sharing, or load a .srt file).");
          subSel = -1; updateSubUI();
        }
        return;
      }
    }
    if(token !== subToken) return;
    subCues = s.cues; subShown = ''; renderSubs(); kickSubs(); updateSubUI();
    if(!quiet) showHud(ICON.cc, s.label);
  }
  function toggleSubs(){
    if(subSel >= 0){ selectSub(-1); return; }
    const i = lastSub >= 0 && subList[lastSub] ? lastSub : 0;
    if(subList[i]) selectSub(i);
    else { toast('No subtitles yet – open the CC menu to load a .srt / .vtt file.'); openPanel('subs'); }
  }
  function loadLocalSub(file){
    if(!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const cues = parseSubs(decodeBuf(rd.result));
      if(!cues.length){ toast('That file has no readable subtitles (use .srt or .vtt).'); return; }
      subList.push({ id:'f' + Date.now(), kind:'ext', label:file.name.replace(/\.[^.]+$/, ''), sub:'from your device', urls:[], cues:cues, local:true });
      selectSub(subList.length - 1);
    };
    rd.readAsArrayBuffer(file);
  }
  function setSubScale(v){
    subScale = clamp(Math.round(v * 20) / 20, 0.6, 2.2);
    subsEl.style.setProperty('--subsize', subScale); lsSet('infinity_subsize', String(subScale));
    if(panel.classList.contains('open')) renderPanel();
  }
  function setSubDelay(v){ subDelay = Math.round(v * 10) / 10; subShown = ''; renderSubs(); if(panel.classList.contains('open')) renderPanel(); }
  if(video.textTracks && video.textTracks.addEventListener){
    video.textTracks.addEventListener('addtrack', () => { buildSubs(); updateSubUI(); });
  }

  /* ----- audio / subtitle panel ----- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; };
  function opt(label, small, on, fn){
    const b = el('button', 'po' + (on ? ' on' : '')); b.type = 'button';
    b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.append(el('i'), el('span', '', label));
    if(small) b.append(el('small', '', small));
    b.addEventListener('click', fn);
    return b;
  }
  function xbtn(text, fn){ const b = el('button', '', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function renderPanel(){
    panelList.textContent = ''; panelExtra.textContent = '';
    if(panelMode === 'audio'){
      panelTitle.textContent = 'Audio track';
      audioList.forEach((a, i) => panelList.append(opt(a.label, a.sub, i === audioSel, () => { selectAudio(i); renderPanel(); })));
      if(audioList.length < 2){
        panelList.append(el('p', 'pnote', 'Only one audio track is available. Browsers cannot switch tracks inside a video file, so for dual-audio movies add each language as a separate AAC audio file (see README, "audio" in movies.js), or use the Drive player which has its own audio menu.'));
      }
      if(audioSilent) panelList.append(el('p', 'pnote', "The video's own audio could not be decoded (AC-3 / E-AC-3 / DTS)."));
      if(curId) panelExtra.append(xbtn('Use Drive player (has its own audio / CC menu)', () => { closeMenu(); switchToDrive(false); }));
    } else {
      panelTitle.textContent = 'Subtitles';
      panelList.append(opt('Off', '', subSel < 0, () => { selectSub(-1); }));
      subList.forEach((s, i) => panelList.append(opt(s.label, s.sub, i === subSel, () => { selectSub(i); })));
      if(!subList.length) panelList.append(el('p', 'pnote', 'No subtitles are attached to this movie. Load a .srt / .vtt file from your device below, or add links in movies.js (see README).'));
      panelExtra.append(el('span', 'lbl', 'Size ' + Math.round(subScale * 100) + '%   ·   Delay ' + (subDelay > 0 ? '+' : '') + subDelay.toFixed(1) + ' s'));
      panelExtra.append(xbtn('A−', () => setSubScale(subScale - 0.1)), xbtn('A+', () => setSubScale(subScale + 0.1)),
                        xbtn('Delay −0.5s', () => setSubDelay(subDelay - 0.5)), xbtn('Delay +0.5s', () => setSubDelay(subDelay + 0.5)));
      const lab = el('label', '', 'Load subtitle file…');
      const inp = el('input'); inp.type = 'file'; inp.accept = '.srt,.vtt,.txt,text/vtt,application/x-subrip';
      inp.addEventListener('change', () => { loadLocalSub(inp.files && inp.files[0]); inp.value = ''; });
      lab.append(inp); panelExtra.append(lab);
    }
  }
  function openPanel(mode){
    if(usingFallback) return;
    closeMenu(); panelMode = mode; renderPanel();
    panel.classList.add('open'); clearTimeout(hideTimer); setState('show', true);
  }
  function togglePanel(mode){ (panel.classList.contains('open') && panelMode === mode) ? (closeMenu(), showControls()) : openPanel(mode); }
  audioBtn.addEventListener('click', e => { e.stopPropagation(); togglePanel('audio'); });
  ccBtn.addEventListener('click',    e => { e.stopPropagation(); togglePanel('subs'); });
  audioItem.addEventListener('click', () => openPanel('audio'));
  subItem.addEventListener('click',   () => openPanel('subs'));
  panelBack.addEventListener('click', () => { closeMenu(); showControls(); });

  /* ----- set everything up for a movie ----- */
  function initTracks(m){
    curMovie = m;
    movieKey = curId || (hasDirectSrc(m) ? m.src.trim() : '');
    subList = []; subSel = -1; subCues = null; subDelay = 0; lastSub = -1; subShown = ''; subsEl.textContent = '';
    ((m.subtitles) || []).forEach((s, i) => {
      const urls = urlsFor(s, 'text'); if(!urls.length) return;
      subList.push({ id:'x' + i, kind:'ext', label:s.label || ('Subtitle ' + (i + 1)), sub:langName(s.lang), urls:urls, cues:null, def:!!s.default });
    });
    buildSubs(); updateSubUI();
    audioList = []; audioSel = 0; buildAudio(); updateAudioUI();

    const savedSub = lsGet('infinity_sub_' + movieKey);
    let si = -1;
    if(savedSub && savedSub !== 'off') si = subList.findIndex(s => s.label === savedSub);
    else if(!savedSub) si = subList.findIndex(s => s.def);
    if(si >= 0) selectSub(si, true);

    const savedAud = lsGet('infinity_audio_' + movieKey);
    if(savedAud){ const ai = audioList.findIndex(a => a.label === savedAud); if(ai > 0) selectAudio(ai, true); }
  }
  function resetTracks(){
    clearTimeout(silenceTimer); silenceDone = false; audioSilent = false; noticeOff = false; noticeEl.hidden = true;
    stopExt(); subToken++; subCues = null; subShown = ''; subsEl.textContent = '';
    if(subRaf){ cancelAnimationFrame(subRaf); subRaf = 0; }
    nativeSubs().forEach(t => { try{ t.mode = 'disabled'; }catch(e){} });
  }
  video.addEventListener('loadedmetadata', () => { buildAudio(); buildSubs(); updateAudioUI(); updateSubUI(); applyVolume(); });

  /* ----- open / close ----- */
  function resetPlayerUI(){
    usingFallback = false; metaLoaded = false; dragging = false; locked = false; g = null;
    video.hidden = false; iframe.hidden = true;
    ['fallback','locked','hide-cursor'].forEach(c => setState(c, false));
    setState('loading', true); setState('paused', true); setState('show', true);
    closeMenu(); hud.classList.remove('show');
    progBar.style.width = '0'; bufBar.style.width = '0'; thumbEl.style.left = '0';
    tCur.textContent = '00:00'; tEnd.textContent = '--:--';
    ppBtn.innerHTML = ICON.play;
    video.playbackRate = 1; video.style.filter = ''; brightness = 1;
    resetTracks();
    aspectIdx = 0; applyAspect();
    speedRow.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === 1));
  }

  function openPlayer(m, id){
    const direct = hasDirectSrc(m);
    if(!isValidId(id) && !direct){ toast('Coming soon'); return; }
    clearTimeout(clearTimer); clearTimeout(loadTimer);
    lastFocus = document.activeElement;
    curId = isValidId(id) ? id : '';
    mTitle.textContent = m.name || '';
    mSub.textContent = m.category || '';
    driveLink.href = curId ? 'https://drive.google.com/file/d/' + curId + '/view' : m.src;
    driveLink.hidden = false;
    switchBtn.hidden = !curId;

    resetPlayerUI();
    sources = [];
    if(direct) sources.push(m.src.trim());
    else if(curId){
      if(/^https?:$/.test(location.protocol)) sources.push(new URL('stream/' + curId, location.href).href);   // Netlify proxy (real seeking)
      sources.push(driveStream(curId));                                                                      // direct Drive stream
    }
    pendingResume = 0;
    pendingResume = loadProgress();

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('locked');
    isOpen = true;
    try{ history.pushState({ player:1 }, ''); }catch(e){}

    if(m.player === 'drive' && curId){ switchToDrive(false); }
    else { initTracks(m); applyVolume(); loadSource(0); setupMediaSession(m.name); }
    showControls();
    closeBtn.focus({ preventScroll:true });
  }

  function hidePlayer(){
    if(!isOpen) return;
    saveProgress();
    isOpen = false;
    clearTimeout(loadTimer); clearTimeout(hideTimer); clearTimeout(tapTimer); clearTimeout(hudTimer);
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('locked');
    if(fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    try{ video.pause(); }catch(e){}
    dropWake();
    resetTracks();
    clearTimer = setTimeout(() => {
      video.removeAttribute('src'); video.load();      // stops the download
      iframe.src = 'about:blank';
    }, 350);
    if(lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll:true });
  }
  function closePlayer(){
    if(!isOpen) return;
    if(history.state && history.state.player){ history.back(); } else hidePlayer();
  }

  iframe.addEventListener('load', () => { if(iframe.getAttribute('src') !== 'about:blank') setState('loading', false); });
  addEventListener('popstate', () => { if(isOpen) hidePlayer(); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) saveProgress(); else if(isOpen && !video.paused) takeWake(); });
  addEventListener('pagehide', saveProgress);

  /* ---------- installable app + offline shell ---------- */
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
