(() => {
  if (document.getElementById('avr-overlay')) {
    toggle();
    return;
  }

  // ── Build DOM ──────────────────────────────────────────────────────────
  const overlay = el('div', 'avr-overlay', `
    <div id="avr-bg"></div>

    <div id="avr-input-screen">
      <h2>📖 AudioVisual Reader</h2>
      <textarea id="avr-textarea" placeholder="Вставьте текст сюда..."></textarea>
      <button id="avr-start">▶ Начать</button>
    </div>

    <div id="avr-scroll" style="display:none">
      <div id="avr-text"></div>
    </div>

    <div id="avr-controls" style="display:none">
      <div id="avr-progress-wrap">
        <svg viewBox="0 0 52 52">
          <circle class="avr-track" cx="26" cy="26" r="20"/>
          <circle class="avr-bar"   cx="26" cy="26" r="20" id="avr-bar"/>
        </svg>
        <button id="avr-play">▶</button>
      </div>
      <button class="avr-btn" id="avr-prev">⏮</button>
      <button class="avr-btn" id="avr-next">⏭</button>
      <select id="avr-voice"></select>
      <button class="avr-btn" id="avr-slower">🐢</button>
      <span id="avr-speed">1×</span>
      <button class="avr-btn" id="avr-faster">🐇</button>
      <button class="avr-btn" id="avr-hide">👁</button>
      <button id="avr-close">✕</button>
    </div>
  `);
  document.body.appendChild(overlay);

  // ── State ──────────────────────────────────────────────────────────────
  let sentences = [], idx = 0, rate = 1, speaking = false, textVisible = true;
  let voices = [], selVoice = null;
  const CIRC = 2 * Math.PI * 20; // ≈ 125.7

  // ── Refs ───────────────────────────────────────────────────────────────
  const bg       = $('avr-bg');
  const textDiv  = $('avr-text');
  const scroll   = $('avr-scroll');
  const controls = $('avr-controls');
  const inputScr = $('avr-input-screen');
  const playBtn  = $('avr-play');
  const bar      = $('avr-bar');
  const speedLbl = $('avr-speed');
  const voiceSel = $('avr-voice');

  // ── Voices ─────────────────────────────────────────────────────────────
  function loadVoices() {
    voices = speechSynthesis.getVoices();
    const ru = voices.filter(v => v.lang.startsWith('ru'));
    const list = ru.length ? ru : voices;
    voiceSel.innerHTML = list.map((v,i) => `<option value="${i}">${v.name.slice(0,16)}</option>`).join('');
    selVoice = list[0] || null;
    voices = list;
  }
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
  voiceSel.onchange = () => { selVoice = voices[+voiceSel.value] || null; };

  // ── Image ──────────────────────────────────────────────────────────────
  const imgCache = {};
  async function loadBg(text) {
    const kw = keywords(text);
    if (imgCache[kw]) { setBg(imgCache[kw]); return; }
    const seed = [...kw].reduce((a,c) => a + c.charCodeAt(0), 0) % 1000;
    const url = `https://picsum.photos/seed/${seed}/800/1200`;
    imgCache[kw] = url;
    setBg(url);
  }
  function setBg(url) { bg.style.backgroundImage = `url('${url}')`; }

  function keywords(text) {
    const stop = new Set('и в на с по к за из от до что как это не но а же бы ли то так уже ещё всё все был была были есть быть он она они мы вы я его её их им нам вам мне тебе'.split(' '));
    return text.toLowerCase().replace(/[^а-яёa-z\s]/gi,'').split(/\s+/)
      .filter(w => w.length > 3 && !stop.has(w)).slice(0,4).join(' ') || text.slice(0,30);
  }

  // ── Parse & Render ─────────────────────────────────────────────────────
  function parse(text) {
    return text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map(s=>s.trim()).filter(Boolean) || [text];
  }

  function render() {
    textDiv.innerHTML = sentences.map((s,i) =>
      `<span class="avr-s" data-i="${i}">${s} </span>`
    ).join('');
    textDiv.querySelectorAll('.avr-s').forEach(s =>
      s.addEventListener('click', () => { stop(); speakFrom(+s.dataset.i); })
    );
  }

  function highlight(i) {
    textDiv.querySelectorAll('.avr-s').forEach(s => s.classList.remove('avr-active'));
    const s = textDiv.querySelector(`.avr-s[data-i="${i}"]`);
    if (s) { s.classList.add('avr-active'); s.scrollIntoView({behavior:'smooth',block:'center'}); }
    bar.style.strokeDashoffset = CIRC * (1 - i / Math.max(1, sentences.length - 1));
  }

  // ── TTS ────────────────────────────────────────────────────────────────
  function speakFrom(i) {
    if (i >= sentences.length) { stop(); return; }
    idx = i;
    highlight(i);
    if (i % 5 === 0) loadBg(sentences.slice(i, i+3).join(' '));

    const u = new SpeechSynthesisUtterance(sentences[i]);
    u.rate = rate;
    if (selVoice) u.voice = selVoice;
    u.onend = () => speakFrom(i + 1);
    u.onerror = () => speakFrom(i + 1);
    speechSynthesis.speak(u);
    speaking = true;
    playBtn.textContent = '⏸';
  }

  function stop() {
    speechSynthesis.cancel();
    speaking = false;
    playBtn.textContent = '▶';
  }

  function togglePlay() { speaking ? stop() : speakFrom(idx); }

  // ── Controls wiring ────────────────────────────────────────────────────
  $('avr-start').onclick = () => {
    const raw = $('avr-textarea').value.trim();
    if (!raw) return;
    sentences = parse(raw);
    idx = 0;
    render();
    inputScr.style.display = 'none';
    scroll.style.display = '';
    controls.style.display = '';
    loadBg(sentences.slice(0,3).join(' '));
  };

  playBtn.onclick = togglePlay;
  $('avr-prev').onclick = () => { stop(); speakFrom(Math.max(0, idx-1)); };
  $('avr-next').onclick = () => { stop(); speakFrom(Math.min(sentences.length-1, idx+1)); };

  $('avr-slower').onclick = () => { rate = Math.max(0.5, +(rate-0.25).toFixed(2)); speedLbl.textContent = rate+'×'; };
  $('avr-faster').onclick = () => { rate = Math.min(3,   +(rate+0.25).toFixed(2)); speedLbl.textContent = rate+'×'; };

  $('avr-hide').onclick = () => {
    textVisible = !textVisible;
    textDiv.style.opacity = textVisible ? '1' : '0';
    $('avr-hide').textContent = textVisible ? '👁' : '🙈';
  };

  $('avr-close').onclick = () => { stop(); toggle(); };

  // ── Toggle overlay ─────────────────────────────────────────────────────
  function toggle() { overlay.classList.toggle('avr-visible'); }

  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'TOGGLE_PANEL') toggle(); });

  // ── Helpers ────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, id, html) {
    const e = document.createElement(tag);
    e.id = id;
    e.innerHTML = html;
    return e;
  }
})();
