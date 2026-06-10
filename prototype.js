/** Demo playlist — replace with /api/status tracks when wired to ESP32 */
const PLAYLIST = [
  'Frank Sinatra - The Way You Look Tonight',
  'youareloved',
  'Somewhere Over the Rainbow',
  'What a Wonderful World',
  'Moon River',
  'Dream a Little Dream of Me',
];

const player = {
  index: 0,
  playing: false,
};

const elTitle = document.getElementById('playerTitle');
const elList = document.getElementById('trackList');
const btnPrev = document.getElementById('btnPrev');
const btnPlay = document.getElementById('btnPlay');
const btnNext = document.getElementById('btnNext');

function trackLabel(name) {
  return name.replace(/\.mp3$/i, '').replace(/^\//, '');
}

function renderPlayer() {
  const title = PLAYLIST[player.index] || '—';
  elTitle.textContent = player.playing ? title : `${title} (paused)`;
  btnPlay.classList.toggle('is-playing', player.playing);
  btnPlay.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');

  elList.innerHTML = '';
  PLAYLIST.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-track' + (i === player.index ? ' active' : '');
    btn.textContent = trackLabel(name);
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', i === player.index ? 'true' : 'false');
    btn.addEventListener('click', () => {
      player.index = i;
      player.playing = true;
      renderPlayer();
      scrollActiveTrackIntoView();
    });
    elList.appendChild(btn);
  });
}

function scrollActiveTrackIntoView() {
  const active = elList.querySelector('.player-track.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function playPause() {
  if (PLAYLIST.length === 0) return;
  player.playing = !player.playing;
  renderPlayer();
}

function prevTrack() {
  if (PLAYLIST.length === 0) return;
  player.index = (player.index - 1 + PLAYLIST.length) % PLAYLIST.length;
  player.playing = true;
  renderPlayer();
  scrollActiveTrackIntoView();
}

function nextTrack() {
  if (PLAYLIST.length === 0) return;
  player.index = (player.index + 1) % PLAYLIST.length;
  player.playing = true;
  renderPlayer();
  scrollActiveTrackIntoView();
}

btnPrev.addEventListener('click', prevTrack);
btnNext.addEventListener('click', nextTrack);
btnPlay.addEventListener('click', playPause);
renderPlayer();

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

function onBalloonTap(btn) {
  const label = btn.getAttribute('aria-label') || btn.dataset.id;
  console.log('tap:', btn.dataset.id, '—', label);
}

document.querySelectorAll('.balloon-btn').forEach((btn) => {
  const id = btn.dataset.id;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
    createSparkles(btn);
  });

  btn.addEventListener('pointerup', () => {
    onBalloonTap(btn);
  });

  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tap-squish') btn.classList.remove('tapped');
  });
});
