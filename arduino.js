/** Rainbowportal UI — ESP32 AudioKit API + balloon interactions */

const state = {
  playing: false,
  index: 0,
  count: 0,
  vol: 0,
  volmax: 21,
  stage: false,
  track: '',
  tracks: [],
};

const elTitle = document.getElementById('playerTitle');
const elList = document.getElementById('trackList');
const btnPrev = document.getElementById('btnPrev');
const btnPlay = document.getElementById('btnPlay');
const btnNext = document.getElementById('btnNext');

function trackLabel(name) {
  return String(name || '')
    .replace(/\.mp3$/i, '')
    .replace(/^\//, '');
}

function renderPlayer() {
  const title = state.track || state.tracks[state.index] || '—';
  const label = trackLabel(title);
  elTitle.textContent = state.playing ? label : `${label} (paused)`;
  btnPlay.classList.toggle('is-playing', state.playing);
  btnPlay.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');

  elList.innerHTML = '';
  state.tracks.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-track' + (i === state.index ? ' active' : '');
    btn.textContent = trackLabel(name);
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', i === state.index ? 'true' : 'false');
    btn.addEventListener('click', () => apiPost(`select?i=${i}`));
    elList.appendChild(btn);
  });
}

function scrollActiveTrackIntoView() {
  const active = elList.querySelector('.player-track.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function applyStatus(data) {
  if (!data) return;
  state.playing = !!data.playing;
  state.index = Number(data.index) || 0;
  state.count = Number(data.count) || 0;
  state.vol = Number(data.vol) || 0;
  state.volmax = Number(data.volmax) || 21;
  state.stage = !!data.stage;
  state.track = data.track || '';
  state.tracks = Array.isArray(data.tracks) ? data.tracks : [];
  renderPlayer();
}

function apiPost(path) {
  return fetch('/api/' + path, { method: 'POST' })
    .then((r) => r.json())
    .then(applyStatus)
    .catch((err) => console.warn('API error:', path, err));
}

function pollStatus() {
  fetch('/api/status', { cache: 'no-store' })
    .then((r) => r.json())
    .then(applyStatus)
    .catch((err) => console.warn('status poll failed:', err));
}

/* --- Balloon actions: wired vs placeholder --- */

function dummyReplayLastList() {
  console.log('[stub] Replay last list — not implemented on device yet');
}

function dummyManageLists() {
  console.log('[stub] Manage lists — not implemented on device yet');
}

function dummySleepTimer() {
  console.log('[stub] Set sleep timer — not implemented on device yet');
}

function onBalloonAction(id) {
  switch (id) {
    case 'balloonA':
      dummyReplayLastList();
      break;
    case 'balloonB':
      dummyManageLists();
      break;
    case 'balloonC':
      apiPost('stage');
      break;
    case 'balloonD':
      dummySleepTimer();
      break;
    case 'balloonE':
      apiPost('vol?d=1');
      break;
    case 'balloonF':
      apiPost('vol?d=-1');
      break;
    default:
      console.log('unknown balloon:', id);
  }
}

/* --- Transport controls --- */

btnPrev.addEventListener('click', () => apiPost('prev'));
btnNext.addEventListener('click', () => apiPost('next'));
btnPlay.addEventListener('click', () => apiPost('playpause'));

/* --- Tap sparkles (prototype UI) --- */

const SPARKLE_COLORS = [
  '#00ffff',
  '#ff00ff',
  '#00ff00',
  '#ff3300',
  '#ffea00',
  '#ff007f',
  '#39ff14',
];

function createSparkles(button) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const sparkle = document.createElement('span');
    sparkle.className = 'sparkle';

    const inner = document.createElement('div');
    inner.className = 'sparkle-inner';
    sparkle.appendChild(inner);

    sparkle.style.setProperty('--tx', (Math.random() - 0.5) * 140 + 'px');
    sparkle.style.setProperty('--ty', (Math.random() - 0.5) * 140 + 'px');

    const size = Math.random() * 8 + 8;
    sparkle.style.width = size + 'px';
    sparkle.style.height = size + 'px';
    sparkle.style.setProperty(
      '--sparkle-color',
      SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]
    );

    button.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 560);
  }
}

document.querySelectorAll('.balloon-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
    createSparkles(btn);
  });

  btn.addEventListener('pointerup', () => {
    onBalloonAction(btn.dataset.id);
  });

  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tap-squish') btn.classList.remove('tapped');
  });
});

/* --- Boot --- */

pollStatus();
setInterval(pollStatus, 1500);
