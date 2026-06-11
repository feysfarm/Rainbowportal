/** Prototype — demo data; wire to ESP32 APIs later */

const STORAGE_BYTES = 512 * 1024 * 1024;

const mediaFiles = [
  { id: 'm1', name: 'Frank Sinatra - The Way You Look Tonight.mp3', size: 2877757, durationSec: 180 },
  { id: 'm2', name: 'youareloved.mp3', size: 12952263, durationSec: 324 },
  { id: 'm3', name: 'Somewhere Over the Rainbow.mp3', size: 3841024, durationSec: 195 },
  { id: 'm4', name: 'What a Wonderful World.mp3', size: 4521984, durationSec: 228 },
  { id: 'm5', name: 'Moon River.mp3', size: 3145728, durationSec: 168 },
  { id: 'm6', name: 'Dream a Little Dream of Me.mp3', size: 2936012, durationSec: 176 },
];

const systemFiles = [
  { id: 's1', name: 'wifi_connected.mp3', size: 57678, role: 'Wi-Fi connected' },
  { id: 's2', name: 'balloon_tap.mp3', size: 18432, role: 'Balloon button tap' },
  { id: 's3', name: 'stage_on.mp3', size: 12288, role: 'Stage turned on' },
  { id: 's4', name: 'stage_off.mp3', size: 11264, role: 'Stage turned off' },
  { id: 's5', name: 'volume_change.mp3', size: 8192, role: 'Volume up / down' },
];

const playlists = [
  { id: 'p1', name: 'Favourites', mediaIds: ['m1', 'm2', 'm6'] },
  { id: 'p2', name: 'Bedtime', mediaIds: ['m3', 'm4', 'm5'] },
];

const player = {
  sourceId: 'all',
  shuffle: false,
  queue: [],
  index: 0,
  playing: false,
  positionSec: 0,
};

let sleepTimer = null;
let progressTimer = null;
let scrollLockCount = 0;
let toastTimer = null;

let fmActiveTab = 'media';
let lmEditingId = null;
let lmDraft = { name: '', mediaIds: [] };
let stHoursVal = 0;
let stMinsVal = 30;

/* ── DOM ── */

const elTitle = document.getElementById('playerTitle');
const elTime = document.getElementById('playerTime');
const elList = document.getElementById('trackList');
const elListLabel = document.getElementById('playerListLabel');
const elSource = document.getElementById('playerSource');
const btnPrev = document.getElementById('btnPrev');
const btnPlay = document.getElementById('btnPlay');
const btnNext = document.getElementById('btnNext');
const btnShuffle = document.getElementById('btnShuffle');

const fmOverlay = document.getElementById('fileManagerOverlay');
const fmClose = document.getElementById('fmClose');
const fmTabMedia = document.getElementById('fmTabMedia');
const fmTabSystem = document.getElementById('fmTabSystem');
const fmPanelMedia = document.getElementById('fmPanelMedia');
const fmPanelSystem = document.getElementById('fmPanelSystem');
const fmMediaList = document.getElementById('fmMediaList');
const fmSystemList = document.getElementById('fmSystemList');
const fmMediaEmpty = document.getElementById('fmMediaEmpty');
const fmSystemEmpty = document.getElementById('fmSystemEmpty');
const fmStorageFill = document.getElementById('fmStorageFill');
const fmStorageText = document.getElementById('fmStorageText');
const fmFileInput = document.getElementById('fmFileInput');
const fmUploadLabel = document.getElementById('fmUploadLabel');
const fmHint = document.getElementById('fmHint');

const lmOverlay = document.getElementById('listManagerOverlay');
const lmClose = document.getElementById('lmClose');
const lmBack = document.getElementById('lmBack');
const lmBrowseView = document.getElementById('lmBrowseView');
const lmEditView = document.getElementById('lmEditView');
const lmNewBtn = document.getElementById('lmNewBtn');
const lmPlaylistList = document.getElementById('lmPlaylistList');
const lmPlaylistEmpty = document.getElementById('lmPlaylistEmpty');
const lmNameInput = document.getElementById('lmNameInput');
const lmTotalTime = document.getElementById('lmTotalTime');
const lmTrackList = document.getElementById('lmTrackList');
const lmTrackEmpty = document.getElementById('lmTrackEmpty');
const lmPickList = document.getElementById('lmPickList');
const lmSaveBtn = document.getElementById('lmSaveBtn');

const stOverlay = document.getElementById('sleepTimerOverlay');
const stClose = document.getElementById('stClose');
const stStatus = document.getElementById('stStatus');
const stEndPlaylist = document.getElementById('stEndPlaylist');
const stHours = document.getElementById('stHours');
const stMins = document.getElementById('stMins');
const stHoursUp = document.getElementById('stHoursUp');
const stHoursDown = document.getElementById('stHoursDown');
const stMinsUp = document.getElementById('stMinsUp');
const stMinsDown = document.getElementById('stMinsDown');
const stStartDuration = document.getElementById('stStartDuration');
const stCancel = document.getElementById('stCancel');
const stPresets = document.getElementById('stPresets');

const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMessage = document.getElementById('confirmMessage');
const confirmActions = document.getElementById('confirmActions');

/* ── Helpers ── */

function mediaById(id) {
  return mediaFiles.find((f) => f.id === id);
}

function playlistById(id) {
  return playlists.find((p) => p.id === id);
}

function trackLabel(name) {
  return name.replace(/\.mp3$/i, '').replace(/^\//, '');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function playlistDuration(mediaIds) {
  return mediaIds.reduce((sum, id) => sum + (mediaById(id)?.durationSec || 0), 0);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function lockScroll() {
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (!scrollLockCount) document.body.style.overflow = '';
}

function showToast(message) {
  let toast = document.getElementById('fmToast');
  if (!toast) {
    toast = document.createElement('p');
    toast.id = 'fmToast';
    toast.className = 'fm-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function showChoice(message, choices) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmActions.innerHTML = '';
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'confirm-btn' + (choice.variant ? ` confirm-btn-${choice.variant}` : '');
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        confirmOverlay.hidden = true;
        confirmOverlay.setAttribute('aria-hidden', 'true');
        unlockScroll();
        resolve(choice.id);
      });
      confirmActions.appendChild(btn);
    });
    confirmOverlay.hidden = false;
    confirmOverlay.setAttribute('aria-hidden', 'false');
    lockScroll();
  });
}

function showConfirm(message, okLabel = 'OK', cancelLabel = 'Cancel') {
  return showChoice(message, [
    { id: false, label: cancelLabel },
    { id: true, label: okLabel, variant: 'danger' },
  ]).then((id) => id === true);
}

function isModalOpen() {
  return [fmOverlay, lmOverlay, stOverlay, confirmOverlay].some(
    (el) => el && !el.hidden
  );
}

function removeMediaFromPlaylists(mediaId) {
  playlists.forEach((pl) => {
    pl.mediaIds = pl.mediaIds.filter((id) => id !== mediaId);
  });
}

function purgeMissingMediaFromPlaylists() {
  playlists.forEach((pl) => {
    pl.mediaIds = pl.mediaIds.filter((id) => mediaById(id));
  });
}

function nextPlaylistId() {
  let n = playlists.length + 1;
  let id;
  do {
    id = 'p' + n;
    n += 1;
  } while (playlistById(id));
  return id;
}

/* ── Player queue ── */

function buildQueue({ keepCurrentTrack = false, reshuffle = false } = {}) {
  const prevId = player.queue[player.index];
  let ids;
  if (player.sourceId === 'all') {
    ids = mediaFiles.map((f) => f.id);
  } else {
    const pl = playlistById(player.sourceId);
    ids = pl ? pl.mediaIds.filter((id) => mediaById(id)) : [];
  }

  if (player.shuffle && ids.length > 1) {
    if (reshuffle) {
      ids = shuffleArray(ids);
    } else if (keepCurrentTrack && player.queue.length) {
      const set = new Set(ids);
      const kept = player.queue.filter((id) => set.has(id));
      const added = ids.filter((id) => !kept.includes(id));
      ids = [...kept, ...added];
    }
  }

  player.queue = ids;
  if (keepCurrentTrack && prevId && ids.includes(prevId)) {
    player.index = ids.indexOf(prevId);
  } else if (player.index >= ids.length) {
    player.index = Math.max(0, ids.length - 1);
  }
  if (!keepCurrentTrack) player.positionSec = 0;
}

function getCurrentTrack() {
  const id = player.queue[player.index];
  return id ? mediaById(id) : null;
}

function getSourceLabel() {
  if (player.sourceId === 'all') return 'All media';
  return playlistById(player.sourceId)?.name || 'Playlist';
}

function renderSourceSelect() {
  const prev = elSource.value || player.sourceId;
  elSource.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All media';
  elSource.appendChild(allOpt);
  playlists.forEach((pl) => {
    const opt = document.createElement('option');
    opt.value = pl.id;
    opt.textContent = pl.name;
    elSource.appendChild(opt);
  });
  const valid = prev === 'all' || playlistById(prev);
  elSource.value = valid ? prev : player.sourceId;
}

function startProgress() {
  stopProgress();
  progressTimer = setInterval(() => {
    if (!player.playing) return;
    const track = getCurrentTrack();
    if (!track) return;

    player.positionSec += 1;
    if (player.positionSec >= track.durationSec) {
      if (player.index < player.queue.length - 1) {
        player.index += 1;
        player.positionSec = 0;
      } else {
        player.playing = false;
        player.positionSec = track.durationSec;
        if (sleepTimer?.mode === 'end') triggerSleepStop('Playlist finished');
        stopProgress();
      }
    }
    checkSleepTimerDuration();
    renderPlayerTime();
  }, 1000);
}

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function renderPlayerTime() {
  const track = getCurrentTrack();
  if (!track) {
    elTime.textContent = '—';
    return;
  }
  const remaining = Math.max(0, track.durationSec - player.positionSec);
  const prefix = player.playing ? '' : 'Paused · ';
  elTime.textContent = `${prefix}${formatDuration(remaining)} remaining`;
}

function renderPlayer() {
  buildQueue({ keepCurrentTrack: true });
  renderSourceSelect();
  elSource.value = player.sourceId;

  const track = getCurrentTrack();
  const title = track ? track.name : '—';
  elTitle.textContent = player.playing
    ? trackLabel(title)
    : `${trackLabel(title)}${track ? ' (paused)' : ''}`;

  btnPlay.classList.toggle('is-playing', player.playing);
  btnPlay.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  btnShuffle.setAttribute('aria-pressed', player.shuffle ? 'true' : 'false');
  btnShuffle.setAttribute('aria-label', player.shuffle ? 'Shuffle on' : 'Shuffle off');

  elListLabel.textContent = player.sourceId === 'all' ? 'All media' : getSourceLabel();
  renderPlayerTime();

  elList.innerHTML = '';
  player.queue.forEach((mediaId, i) => {
    const file = mediaById(mediaId);
    if (!file) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-track' + (i === player.index ? ' active' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', i === player.index ? 'true' : 'false');
    btn.addEventListener('click', () => {
      player.index = i;
      player.positionSec = 0;
      player.playing = true;
      startProgress();
      renderPlayer();
      scrollActiveTrackIntoView();
    });

    const name = document.createElement('span');
    name.className = 'player-track-name';
    name.textContent = trackLabel(file.name);

    const dur = document.createElement('span');
    dur.className = 'player-track-dur';
    if (i === player.index && player.playing) {
      dur.textContent = formatDuration(Math.max(0, file.durationSec - player.positionSec));
    } else {
      dur.textContent = formatDuration(file.durationSec);
    }

    btn.appendChild(name);
    btn.appendChild(dur);
    elList.appendChild(btn);
  });

  if (player.playing) startProgress();
  else stopProgress();
}

function scrollActiveTrackIntoView() {
  const active = elList.querySelector('.player-track.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function playPause() {
  if (player.queue.length === 0) return;
  player.playing = !player.playing;
  if (player.playing) startProgress();
  else stopProgress();
  renderPlayer();
}

function prevTrack() {
  if (player.queue.length === 0) return;
  player.index = (player.index - 1 + player.queue.length) % player.queue.length;
  player.positionSec = 0;
  player.playing = true;
  startProgress();
  renderPlayer();
  scrollActiveTrackIntoView();
}

function nextTrack() {
  if (player.queue.length === 0) return;
  player.index = (player.index + 1) % player.queue.length;
  player.positionSec = 0;
  player.playing = true;
  startProgress();
  renderPlayer();
  scrollActiveTrackIntoView();
}

elSource.addEventListener('change', () => {
  player.sourceId = elSource.value;
  player.index = 0;
  player.positionSec = 0;
  buildQueue({ reshuffle: player.shuffle });
  renderPlayer();
});

btnShuffle.addEventListener('click', () => {
  player.shuffle = !player.shuffle;
  buildQueue({ keepCurrentTrack: true, reshuffle: player.shuffle });
  renderPlayer();
});

btnPrev.addEventListener('click', prevTrack);
btnNext.addEventListener('click', nextTrack);
btnPlay.addEventListener('click', playPause);

/* ── Sleep timer ── */

function formatSleepRemaining(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderSleepTimerUI() {
  if (sleepTimer) {
    if (sleepTimer.mode === 'end') {
      stStatus.textContent = 'Timer active — stops when this playlist ends';
    } else {
      const left = sleepTimer.endsAt - Date.now();
      stStatus.textContent = left > 0
        ? `Timer active — ${formatSleepRemaining(left)} left`
        : 'Timer ending…';
    }
    stStatus.hidden = false;
    stCancel.hidden = false;
  } else {
    stStatus.hidden = true;
    stCancel.hidden = true;
  }
  stHours.textContent = String(stHoursVal);
  stMins.textContent = String(stMinsVal);
  stPresets.querySelectorAll('.st-preset').forEach((btn) => {
    const mins = Number(btn.dataset.mins);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    btn.classList.toggle('is-active', stHoursVal === h && stMinsVal === m);
  });
}

function setSleepDuration(hours, mins) {
  stHoursVal = Math.max(0, Math.min(12, hours));
  stMinsVal = Math.max(0, Math.min(59, mins));
  if (stHoursVal === 0 && stMinsVal === 0) stMinsVal = 15;
  renderSleepTimerUI();
}

function startSleepTimer(mode, durationMs = 0) {
  if (mode === 'duration' && durationMs <= 0) {
    showToast('Set a duration first');
    return;
  }
  sleepTimer = mode === 'end'
    ? { mode: 'end' }
    : { mode: 'duration', endsAt: Date.now() + durationMs };
  renderSleepTimerUI();
  showToast(mode === 'end' ? 'Sleep timer: until playlist ends' : 'Sleep timer started');
  closeSleepTimer();
}

function clearSleepTimer() {
  sleepTimer = null;
  renderSleepTimerUI();
}

function triggerSleepStop(reason) {
  player.playing = false;
  stopProgress();
  clearSleepTimer();
  renderPlayer();
  showToast(reason || 'Sleep timer ended');
}

function checkSleepTimerDuration() {
  if (sleepTimer?.mode === 'duration' && Date.now() >= sleepTimer.endsAt) {
    triggerSleepStop('Sleep timer ended');
  }
}

function openSleepTimer() {
  renderSleepTimerUI();
  stOverlay.hidden = false;
  stOverlay.setAttribute('aria-hidden', 'false');
  lockScroll();
}

function closeSleepTimer() {
  stOverlay.hidden = true;
  stOverlay.setAttribute('aria-hidden', 'true');
  unlockScroll();
}

stClose.addEventListener('click', closeSleepTimer);
stOverlay.addEventListener('click', (e) => {
  if (e.target === stOverlay) closeSleepTimer();
});
stEndPlaylist.addEventListener('click', () => startSleepTimer('end'));
stStartDuration.addEventListener('click', () => {
  const ms = (stHoursVal * 3600 + stMinsVal * 60) * 1000;
  startSleepTimer('duration', ms);
});
stCancel.addEventListener('click', () => {
  clearSleepTimer();
  showToast('Sleep timer cancelled');
});
stHoursUp.addEventListener('click', () => setSleepDuration(stHoursVal + 1, stMinsVal));
stHoursDown.addEventListener('click', () => setSleepDuration(stHoursVal - 1, stMinsVal));
stMinsUp.addEventListener('click', () => setSleepDuration(stHoursVal, stMinsVal + 5));
stMinsDown.addEventListener('click', () => setSleepDuration(stHoursVal, stMinsVal - 5));
stPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.st-preset');
  if (!btn) return;
  const mins = Number(btn.dataset.mins);
  setSleepDuration(Math.floor(mins / 60), mins % 60);
});

setInterval(() => {
  if (sleepTimer?.mode === 'duration' && !stOverlay.hidden) renderSleepTimerUI();
  if (sleepTimer?.mode === 'duration' && player.playing) checkSleepTimerDuration();
}, 1000);

/* ── List manager ── */

function showLmBrowse() {
  lmEditingId = null;
  lmBrowseView.hidden = false;
  lmEditView.hidden = true;
  lmBack.hidden = true;
  document.getElementById('lmTitle').textContent = 'Manage lists';
}

function showLmEdit(id) {
  lmEditingId = id;
  if (id === 'new') {
    lmDraft = { name: '', mediaIds: [] };
    lmNameInput.value = '';
  } else {
    const pl = playlistById(id);
    if (!pl) return showLmBrowse();
    lmDraft = { name: pl.name, mediaIds: [...pl.mediaIds] };
    lmNameInput.value = pl.name;
  }
  lmBrowseView.hidden = true;
  lmEditView.hidden = false;
  lmBack.hidden = false;
  document.getElementById('lmTitle').textContent = id === 'new' ? 'New playlist' : 'Edit playlist';
  renderLmEdit();
}

function renderLmBrowse() {
  lmPlaylistList.innerHTML = '';
  const has = playlists.length > 0;
  lmPlaylistEmpty.hidden = has;
  lmPlaylistList.hidden = !has;

  playlists.forEach((pl) => {
    const ids = pl.mediaIds.filter((id) => mediaById(id));
    const li = document.createElement('li');
    li.className = 'fm-item';

    const name = document.createElement('p');
    name.className = 'fm-item-name';
    name.textContent = pl.name;

    const meta = document.createElement('p');
    meta.className = 'fm-item-meta';
    meta.textContent = `${ids.length} song${ids.length === 1 ? '' : 's'} · ${formatDuration(playlistDuration(ids))}`;

    const actions = document.createElement('div');
    actions.className = 'fm-item-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'fm-item-edit';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => showLmEdit(pl.id));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fm-item-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deletePlaylist(pl.id));

    actions.appendChild(edit);
    actions.appendChild(del);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(actions);
    lmPlaylistList.appendChild(li);
  });
}

function renderLmEdit() {
  const ids = lmDraft.mediaIds.filter((id) => mediaById(id));
  lmDraft.mediaIds = ids;
  lmTotalTime.textContent = `Total: ${formatDuration(playlistDuration(ids))} · ${ids.length} song${ids.length === 1 ? '' : 's'}`;

  lmTrackList.innerHTML = '';
  lmTrackEmpty.hidden = ids.length > 0;
  lmTrackList.hidden = ids.length === 0;

  ids.forEach((mediaId) => {
    const file = mediaById(mediaId);
    if (!file) return;
    const li = document.createElement('li');
    li.className = 'fm-item';

    const name = document.createElement('p');
    name.className = 'fm-item-name';
    name.textContent = trackLabel(file.name);

    const meta = document.createElement('p');
    meta.className = 'fm-item-meta';
    meta.textContent = formatDuration(file.durationSec);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'fm-item-remove-track';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      lmDraft.mediaIds = lmDraft.mediaIds.filter((id) => id !== mediaId);
      renderLmEdit();
    });

    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(remove);
    lmTrackList.appendChild(li);
  });

  lmPickList.innerHTML = '';
  const available = mediaFiles.filter((f) => !lmDraft.mediaIds.includes(f.id));
  if (available.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'fm-empty';
    empty.textContent = 'All media files are already in this playlist.';
    lmPickList.appendChild(empty);
    return;
  }

  available.forEach((file) => {
    const li = document.createElement('li');
    li.className = 'lm-pick-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `pick-${file.id}`;
    const label = document.createElement('label');
    label.className = 'lm-pick-label';
    label.htmlFor = cb.id;
    label.textContent = trackLabel(file.name);
    const dur = document.createElement('span');
    dur.className = 'lm-pick-dur';
    dur.textContent = formatDuration(file.durationSec);

    const toggle = () => {
      if (cb.checked) {
        if (!lmDraft.mediaIds.includes(file.id)) lmDraft.mediaIds.push(file.id);
      } else {
        lmDraft.mediaIds = lmDraft.mediaIds.filter((id) => id !== file.id);
      }
      renderLmEdit();
    };

    li.addEventListener('click', (e) => {
      if (e.target === cb) return;
      cb.checked = !cb.checked;
      toggle();
    });
    cb.addEventListener('change', toggle);

    li.appendChild(cb);
    li.appendChild(label);
    li.appendChild(dur);
    lmPickList.appendChild(li);
  });
}

async function deletePlaylist(id) {
  const pl = playlistById(id);
  if (!pl) return;
  const mediaIds = pl.mediaIds.filter((mid) => mediaById(mid));
  const ok = await showConfirm(`Delete playlist "${pl.name}"?`, 'Delete playlist');
  if (!ok) return;

  let deleteFiles = false;
  if (mediaIds.length > 0) {
    const choice = await showChoice(
      `Also delete ${mediaIds.length} media file${mediaIds.length === 1 ? '' : 's'} from this playlist off the device?`,
      [
        { id: 'keep', label: 'Keep media files', variant: 'primary' },
        { id: 'delete', label: 'Delete files too', variant: 'danger' },
      ]
    );
    deleteFiles = choice === 'delete';
  }

  const idx = playlists.findIndex((p) => p.id === id);
  playlists.splice(idx, 1);

  if (deleteFiles) {
    mediaIds.forEach((mid) => {
      const fi = mediaFiles.findIndex((f) => f.id === mid);
      if (fi >= 0) mediaFiles.splice(fi, 1);
    });
    purgeMissingMediaFromPlaylists();
  }

  if (player.sourceId === id) player.sourceId = 'all';
  if (player.index >= player.queue.length) player.index = 0;
  renderPlayer();
  renderLmBrowse();
  showToast(deleteFiles ? 'Playlist and files deleted' : 'Playlist deleted');
}

function savePlaylist() {
  const name = lmNameInput.value.trim();
  if (!name) {
    showToast('Enter a playlist name');
    lmNameInput.focus();
    return;
  }
  const mediaIds = lmDraft.mediaIds.filter((id) => mediaById(id));
  if (lmEditingId === 'new') {
    playlists.push({ id: nextPlaylistId(), name, mediaIds });
    showToast('Playlist created');
  } else {
    const pl = playlistById(lmEditingId);
    if (pl) {
      pl.name = name;
      pl.mediaIds = mediaIds;
      showToast('Playlist saved');
    }
  }
  showLmBrowse();
  renderLmBrowse();
  renderPlayer();
}

function openListManager() {
  showLmBrowse();
  renderLmBrowse();
  lmOverlay.hidden = false;
  lmOverlay.setAttribute('aria-hidden', 'false');
  lockScroll();
}

function closeListManager() {
  lmOverlay.hidden = true;
  lmOverlay.setAttribute('aria-hidden', 'true');
  showLmBrowse();
  unlockScroll();
}

lmClose.addEventListener('click', closeListManager);
lmBack.addEventListener('click', () => {
  showLmBrowse();
  renderLmBrowse();
});
lmOverlay.addEventListener('click', (e) => {
  if (e.target === lmOverlay) closeListManager();
});
lmNewBtn.addEventListener('click', () => showLmEdit('new'));
lmSaveBtn.addEventListener('click', savePlaylist);

/* ── File manager ── */

function totalUsedBytes() {
  return mediaFiles.reduce((s, f) => s + f.size, 0)
    + systemFiles.reduce((s, f) => s + f.size, 0);
}

function tabUsedBytes(tab) {
  const list = tab === 'media' ? mediaFiles : systemFiles;
  return list.reduce((s, f) => s + f.size, 0);
}

function renderStorage() {
  const used = totalUsedBytes();
  const free = Math.max(0, STORAGE_BYTES - used);
  const pct = Math.min(100, (used / STORAGE_BYTES) * 100);
  fmStorageFill.style.width = `${pct}%`;
  fmStorageFill.classList.toggle('is-warn', pct > 85);
  const tabLabel = fmActiveTab === 'media' ? 'Media' : 'System';
  fmStorageText.textContent =
    `${formatBytes(used)} of ${formatBytes(STORAGE_BYTES)} used · ${formatBytes(free)} free · ${tabLabel}: ${formatBytes(tabUsedBytes(fmActiveTab))}`;
}

function renderFileList(listEl, emptyEl, files, tab) {
  listEl.innerHTML = '';
  const hasFiles = files.length > 0;
  emptyEl.hidden = hasFiles;
  listEl.hidden = !hasFiles;
  files.forEach((file) => {
    const li = document.createElement('li');
    li.className = 'fm-item';
    const name = document.createElement('p');
    name.className = 'fm-item-name';
    name.textContent = file.name;
    const meta = document.createElement('p');
    meta.className = 'fm-item-meta';
    const role = tab === 'system' && file.role ? file.role : 'MP3 audio';
    const dur = file.durationSec ? ` · ${formatDuration(file.durationSec)}` : '';
    meta.textContent = `${role} · ${formatBytes(file.size)}${dur}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fm-item-delete';
    del.textContent = 'Remove';
    del.addEventListener('click', () => removeFile(tab, file.id));
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

function renderFileManager() {
  renderFileList(fmMediaList, fmMediaEmpty, mediaFiles, 'media');
  renderFileList(fmSystemList, fmSystemEmpty, systemFiles, 'system');
  renderStorage();
}

function setFileManagerTab(tab) {
  fmActiveTab = tab;
  const isMedia = tab === 'media';
  fmTabMedia.classList.toggle('is-active', isMedia);
  fmTabSystem.classList.toggle('is-active', !isMedia);
  fmTabMedia.setAttribute('aria-selected', isMedia ? 'true' : 'false');
  fmTabSystem.setAttribute('aria-selected', isMedia ? 'false' : 'true');
  fmPanelMedia.hidden = !isMedia;
  fmPanelSystem.hidden = isMedia;
  fmUploadLabel.textContent = isMedia ? 'Add audio files' : 'Add system sound';
  fmHint.textContent = isMedia
    ? 'MP3 files for playback in the library.'
    : 'Short MP3 chimes for Wi-Fi, buttons, and stage events.';
  renderStorage();
}

function openFileManager() {
  renderFileManager();
  setFileManagerTab('media');
  fmOverlay.hidden = false;
  fmOverlay.setAttribute('aria-hidden', 'false');
  lockScroll();
  fmClose.focus();
}

function closeFileManager() {
  fmOverlay.hidden = true;
  fmOverlay.setAttribute('aria-hidden', 'true');
  unlockScroll();
  fmFileInput.value = '';
}

function nextFileId(tab) {
  const list = tab === 'media' ? mediaFiles : systemFiles;
  let n = list.length + 1;
  let id;
  do {
    id = (tab === 'media' ? 'm' : 's') + n;
    n += 1;
  } while (list.some((f) => f.id === id));
  return id;
}

async function removeFile(tab, id) {
  const list = tab === 'media' ? mediaFiles : systemFiles;
  const file = list.find((f) => f.id === id);
  if (!file) return;
  const msg = tab === 'system'
    ? `Remove system sound "${file.name}"?`
    : `Remove "${trackLabel(file.name)}" from the library?`;
  if (!(await showConfirm(msg, 'Remove'))) return;

  list.splice(list.findIndex((f) => f.id === id), 1);
  if (tab === 'media') {
    removeMediaFromPlaylists(id);
    if (player.queue.length === 0) player.playing = false;
    renderPlayer();
  }
  renderFileManager();
  showToast(`Removed ${file.name}`);
}

function addUploadedFiles(fileList) {
  const tab = fmActiveTab;
  const list = tab === 'media' ? mediaFiles : systemFiles;
  let used = totalUsedBytes();
  let added = 0;

  Array.from(fileList).forEach((file) => {
    if (!file.name.toLowerCase().endsWith('.mp3') && !file.type.startsWith('audio/')) {
      showToast(`Skipped ${file.name} — MP3 only`);
      return;
    }
    if (list.some((f) => f.name === file.name)) {
      showToast(`"${file.name}" already exists`);
      return;
    }
    if (used + file.size > STORAGE_BYTES) {
      showToast('Not enough storage space');
      return;
    }
    const entry = {
      id: nextFileId(tab),
      name: file.name,
      size: file.size,
      durationSec: Math.max(60, Math.round(file.size / 16000)),
    };
    if (tab === 'system') entry.role = 'Custom sound';
    list.push(entry);
    used += file.size;
    added += 1;
  });

  if (added > 0) {
    if (tab === 'media') renderPlayer();
    renderFileManager();
    showToast(added === 1 ? 'File added' : `${added} files added`);
  }
  fmFileInput.value = '';
}

fmClose.addEventListener('click', closeFileManager);
fmOverlay.addEventListener('click', (e) => {
  if (e.target === fmOverlay) closeFileManager();
});
fmTabMedia.addEventListener('click', () => setFileManagerTab('media'));
fmTabSystem.addEventListener('click', () => setFileManagerTab('system'));
fmFileInput.addEventListener('change', () => {
  if (fmFileInput.files?.length) addUploadedFiles(fmFileInput.files);
});

/* ── Balloons ── */

const SPARKLE_COLORS = [
  '#00ffff', '#ff00ff', '#00ff00', '#ff3300', '#ffea00', '#ff007f', '#39ff14',
];

function createSparkles(button) {
  for (let i = 0; i < 12; i += 1) {
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
    sparkle.style.setProperty('--sparkle-color', SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]);
    button.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 560);
  }
}

function onBalloonTap(btn) {
  const id = btn.dataset.id;
  if (id === 'balloonA') openFileManager();
  else if (id === 'balloonB') openListManager();
  else if (id === 'balloonD') openSleepTimer();
  else console.log('tap:', id, '—', btn.getAttribute('aria-label') || id);
}

document.querySelectorAll('.balloon-btn').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
    createSparkles(btn);
  });
  btn.addEventListener('pointerup', () => onBalloonTap(btn));
  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tap-squish') btn.classList.remove('tapped');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!confirmOverlay.hidden) return;
  if (!fmOverlay.hidden) closeFileManager();
  else if (!lmOverlay.hidden) closeListManager();
  else if (!stOverlay.hidden) closeSleepTimer();
});

buildQueue({ reshuffle: player.shuffle });
renderPlayer();
