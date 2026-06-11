/**
 * Rainbowportal — ESP32 AudioKit UI
 * Talks to /api/* on the device; CSS/images from jsDelivr.
 * Served from the device at /app.js (see CONTROL_HTML in firmware).
 */
const UI_VERSION = '18';
console.info(`Rainbowportal UI v${UI_VERSION} — file manager, playlists, sleep timer active`);

let storageTotal = 512 * 1024 * 1024;
let mediaFiles = [];
let systemFiles = [];
let playlists = [];

const player = {
  sourceId: 'all',
  shuffle: false,
  queue: [],
  index: 0,
  playing: false,
  positionSec: 0,
  durationSec: 0,
};

let sleepTimer = null;
let pollTimer = null;
let scrollLockCount = 0;
let toastTimer = null;
let fmActiveTab = 'media';
let lmEditingId = null;
let lmDraft = { name: '', mediaIds: [] };
let stHoursVal = 0;
let stMinsVal = 30;
let overlayDismissAfter = 0;
let sourceSelectOpen = false;
let lastPlaylistKey = '';

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

/* ── API ── */

async function apiGet(path) {
  const r = await fetch('/api/' + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function apiPost(path, opts) {
  const r = await fetch('/api/' + path, { method: 'POST', ...opts });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function normFile(f) {
  const path = f.path || f.name;
  return {
    id: path,
    path,
    name: (f.name || path).replace(/^\//, ''),
    size: f.size || 0,
    durationSec: f.durationSec || f.dur || 0,
    role: f.role || '',
  };
}

function normPlaylist(p) {
  const tracks = p.tracks || p.mediaIds || [];
  return {
    id: p.id,
    name: p.name,
    mediaIds: tracks.map((t) => (t.startsWith('/') ? t : '/' + t)),
    durationSec: p.durationSec || 0,
  };
}

async function refreshFiles() {
  try {
    const data = await apiGet('files');
    if (data.storageTotal) storageTotal = data.storageTotal;
    mediaFiles = (data.media || []).map(normFile);
    systemFiles = (data.system || []).map(normFile);
  } catch (e) {
    console.warn('refreshFiles failed', e);
  }
}

async function refreshPlaylists() {
  try {
    const data = await apiGet('playlists');
    playlists = (data.playlists || []).map(normPlaylist);
    lastPlaylistKey = '';
    renderSourceSelect(true);
  } catch (e) {
    console.warn('refreshPlaylists failed', e);
  }
}

async function refreshAll() {
  await Promise.all([refreshFiles(), refreshPlaylists()]);
}

function applyStatus(s) {
  if (!s) return;
  player.playing = !!s.playing;
  player.index = Number(s.index) || 0;
  player.positionSec = Number(s.positionSec) || 0;
  player.durationSec = Number(s.durationSec) || 0;
  player.sourceId = s.source || 'all';
  player.shuffle = !!s.shuffle;
  player.queue = Array.isArray(s.tracks) ? s.tracks.map((t) => (t.startsWith('/') ? t : '/' + t)) : [];

  if (s.sleep) {
    if (s.sleep.active) {
      sleepTimer = s.sleep.mode === 'end'
        ? { mode: 'end' }
        : { mode: 'duration', endsAt: Date.now() + (s.sleep.remainingSec || 0) * 1000 };
    } else {
      sleepTimer = null;
    }
  }

  renderPlayer();
  if (isOverlayOpen(stOverlay)) renderSleepTimerUI();
}

async function pollStatus() {
  try {
    const s = await apiGet('status');
    applyStatus(s);
  } catch (e) {
    console.warn('status poll failed', e);
  }
}

/* ── Helpers ── */

function mediaById(id) {
  return mediaFiles.find((f) => f.id === id || f.path === id);
}

function playlistById(id) {
  return playlists.find((p) => p.id === id);
}

function trackLabel(name) {
  return String(name || '').replace(/\.mp3$/i, '').replace(/^\//, '');
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

function lockScroll() {
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (!scrollLockCount) document.body.style.overflow = '';
}

function showOverlay(el) {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute('hidden');
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  lockScroll();
  overlayDismissAfter = Date.now() + 400;
}

function hideOverlay(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.remove('is-open');
  el.setAttribute('hidden', '');
  el.setAttribute('aria-hidden', 'true');
  unlockScroll();
}

function canDismissOverlay() {
  return Date.now() >= overlayDismissAfter;
}

function isOverlayOpen(el) {
  return !!(el && el.classList.contains('is-open'));
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
  if (!confirmOverlay || !confirmMessage || !confirmActions) {
    return Promise.resolve(choices[0]?.id ?? null);
  }
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmActions.innerHTML = '';
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'confirm-btn' + (choice.variant ? ` confirm-btn-${choice.variant}` : '');
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        hideOverlay(confirmOverlay);
        resolve(choice.id);
      });
      confirmActions.appendChild(btn);
    });
    showOverlay(confirmOverlay);
  });
}

function showConfirm(message, okLabel = 'OK', cancelLabel = 'Cancel') {
  return showChoice(message, [
    { id: false, label: cancelLabel },
    { id: true, label: okLabel, variant: 'danger' },
  ]).then((id) => id === true);
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

function getSourceLabel() {
  if (player.sourceId === 'all') return 'All media';
  return playlistById(player.sourceId)?.name || 'Playlist';
}

function pathFromQueueIndex(i) {
  return player.queue[i] || '';
}

function getCurrentPath() {
  return pathFromQueueIndex(player.index);
}

/* ── Player UI ── */

function playlistKey() {
  return playlists.map((pl) => `${pl.id}:${pl.name}`).join('|');
}

function renderSourceSelect(force = false) {
  const key = playlistKey();
  if (!force && sourceSelectOpen) return;
  if (!force && key === lastPlaylistKey && elSource.options.length > 0) {
    elSource.value = player.sourceId;
    return;
  }
  lastPlaylistKey = key;
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
  elSource.value = (prev === 'all' || playlistById(prev)) ? prev : player.sourceId;
}

function renderPlayerTime() {
  const dur = player.durationSec || mediaById(getCurrentPath())?.durationSec || 0;
  const path = getCurrentPath();
  if (!path) {
    elTime.textContent = '—';
    return;
  }
  const remaining = Math.max(0, dur - player.positionSec);
  const prefix = player.playing ? '' : 'Paused · ';
  elTime.textContent = `${prefix}${formatDuration(remaining)} remaining`;
}

function renderPlayer() {
  renderSourceSelect();
  if (elSource.value !== player.sourceId) elSource.value = player.sourceId;

  const path = getCurrentPath();
  const file = mediaById(path);
  const title = file ? file.name : (path ? trackLabel(path) : '—');
  elTitle.textContent = player.playing
    ? trackLabel(title)
    : `${trackLabel(title)}${path ? ' (paused)' : ''}`;

  btnPlay.classList.toggle('is-playing', player.playing);
  btnPlay.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  btnShuffle.setAttribute('aria-pressed', player.shuffle ? 'true' : 'false');
  btnShuffle.setAttribute('aria-label', player.shuffle ? 'Shuffle on' : 'Shuffle off');

  elListLabel.textContent = player.sourceId === 'all' ? 'All media' : getSourceLabel();
  renderPlayerTime();

  elList.innerHTML = '';
  player.queue.forEach((trackPath, i) => {
    const f = mediaById(trackPath);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-track' + (i === player.index ? ' active' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', i === player.index ? 'true' : 'false');
    btn.addEventListener('click', async () => {
      try {
        await apiPost('select?i=' + i);
        await pollStatus();
      } catch (e) {
        showToast('Could not select track');
      }
    });

    const name = document.createElement('span');
    name.className = 'player-track-name';
    name.textContent = trackLabel(f?.name || trackPath);

    const dur = document.createElement('span');
    dur.className = 'player-track-dur';
    const trackDur = f?.durationSec || 0;
    if (i === player.index && player.playing && player.durationSec) {
      dur.textContent = formatDuration(Math.max(0, player.durationSec - player.positionSec));
    } else {
      dur.textContent = formatDuration(trackDur);
    }

    btn.appendChild(name);
    btn.appendChild(dur);
    elList.appendChild(btn);
  });
}

function scrollActiveTrackIntoView() {
  const active = elList.querySelector('.player-track.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function playPause() {
  try {
    await apiPost('playpause');
    await pollStatus();
  } catch (e) {
    showToast('Playback failed');
  }
}

async function prevTrack() {
  try {
    await apiPost('prev');
    await pollStatus();
    scrollActiveTrackIntoView();
  } catch (e) {
    showToast('Previous failed');
  }
}

async function nextTrack() {
  try {
    await apiPost('next');
    await pollStatus();
    scrollActiveTrackIntoView();
  } catch (e) {
    showToast('Next failed');
  }
}

elSource.addEventListener('focus', () => { sourceSelectOpen = true; });
elSource.addEventListener('blur', () => { sourceSelectOpen = false; });
elSource.addEventListener('change', async () => {
  sourceSelectOpen = false;
  try {
    await apiPost(`source?src=${encodeURIComponent(elSource.value)}&shuffle=${player.shuffle ? 1 : 0}`);
    await pollStatus();
  } catch (e) {
    showToast('Could not change source');
  }
});

btnShuffle.addEventListener('click', async () => {
  try {
    const shuffle = !player.shuffle;
    await apiPost(`source?src=${encodeURIComponent(player.sourceId)}&shuffle=${shuffle ? 1 : 0}`);
    await pollStatus();
  } catch (e) {
    showToast('Shuffle failed');
  }
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
  if (!stStatus || !stCancel || !stHours || !stMins || !stPresets) return;
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
    btn.classList.toggle('is-active', stHoursVal === Math.floor(mins / 60) && stMinsVal === mins % 60);
  });
}

function setSleepDuration(hours, mins) {
  stHoursVal = Math.max(0, Math.min(12, hours));
  stMinsVal = Math.max(0, Math.min(59, mins));
  if (stHoursVal === 0 && stMinsVal === 0) stMinsVal = 15;
  renderSleepTimerUI();
}

async function startSleepTimer(mode, totalMins) {
  try {
    if (mode === 'end') {
      await apiPost('sleep?mode=end');
    } else {
      await apiPost(`sleep?mode=duration&mins=${totalMins}`);
    }
    await pollStatus();
    showToast(mode === 'end' ? 'Sleep timer: until playlist ends' : 'Sleep timer started');
    closeSleepTimer();
  } catch (e) {
    showToast('Sleep timer failed');
  }
}

async function clearSleepTimer() {
  try {
    await apiPost('sleep?mode=off');
    await pollStatus();
    showToast('Sleep timer cancelled');
  } catch (e) {
    showToast('Cancel failed');
  }
}

function openSleepTimer() {
  if (!stOverlay) {
    showToast('UI outdated — reflash firmware');
    return;
  }
  renderSleepTimerUI();
  showOverlay(stOverlay);
}

function closeSleepTimer() {
  hideOverlay(stOverlay);
}

if (stClose) stClose.addEventListener('click', closeSleepTimer);
if (stOverlay) stOverlay.addEventListener('click', (e) => {
  if (e.target === stOverlay && canDismissOverlay()) closeSleepTimer();
});
if (stEndPlaylist) stEndPlaylist.addEventListener('click', () => startSleepTimer('end'));
if (stStartDuration) stStartDuration.addEventListener('click', () => {
  startSleepTimer('duration', stHoursVal * 60 + stMinsVal);
});
if (stCancel) stCancel.addEventListener('click', clearSleepTimer);
if (stHoursUp) stHoursUp.addEventListener('click', () => setSleepDuration(stHoursVal + 1, stMinsVal));
if (stHoursDown) stHoursDown.addEventListener('click', () => setSleepDuration(stHoursVal - 1, stMinsVal));
if (stMinsUp) stMinsUp.addEventListener('click', () => setSleepDuration(stHoursVal, stMinsVal + 5));
if (stMinsDown) stMinsDown.addEventListener('click', () => setSleepDuration(stHoursVal, stMinsVal - 5));
if (stPresets) stPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.st-preset');
  if (!btn) return;
  const mins = Number(btn.dataset.mins);
  setSleepDuration(Math.floor(mins / 60), mins % 60);
});

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
    cb.id = `pick-${file.id.replace(/[^a-z0-9]/gi, '_')}`;
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
  const ids = pl.mediaIds.filter((mid) => mediaById(mid));
  if (!(await showConfirm(`Delete playlist "${pl.name}"?`, 'Delete playlist'))) return;

  let deleteFiles = false;
  if (ids.length > 0) {
    const choice = await showChoice(
      `Also delete ${ids.length} media file${ids.length === 1 ? '' : 's'} from this playlist off the device?`,
      [
        { id: 'keep', label: 'Keep media files', variant: 'primary' },
        { id: 'delete', label: 'Delete files too', variant: 'danger' },
      ]
    );
    deleteFiles = choice === 'delete';
  }

  try {
    await apiPost(`playlists/delete?id=${encodeURIComponent(id)}&files=${deleteFiles ? 1 : 0}`);
    await refreshAll();
    await pollStatus();
    renderLmBrowse();
    showToast(deleteFiles ? 'Playlist and files deleted' : 'Playlist deleted');
  } catch (e) {
    showToast('Delete failed');
  }
}

async function savePlaylist() {
  const name = lmNameInput.value.trim();
  if (!name) {
    showToast('Enter a playlist name');
    lmNameInput.focus();
    return;
  }
  const tracks = lmDraft.mediaIds.filter((id) => mediaById(id)).join(';');
  const id = lmEditingId === 'new' ? nextPlaylistId() : lmEditingId;
  try {
    await apiPost(`playlists/save?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&tracks=${encodeURIComponent(tracks)}`);
    await refreshAll();
    await pollStatus();
    showLmBrowse();
    renderLmBrowse();
    showToast(lmEditingId === 'new' ? 'Playlist created' : 'Playlist saved');
  } catch (e) {
    showToast('Save failed');
  }
}

async function openListManager() {
  if (!lmOverlay) {
    showToast('UI outdated — reflash firmware');
    return;
  }
  showOverlay(lmOverlay);
  showLmBrowse();
  renderLmBrowse();
  try {
    await refreshAll();
    renderLmBrowse();
    if (lmEditView && !lmEditView.hidden) renderLmEdit();
  } catch (e) {
    showToast('Could not load playlists');
  }
}

function closeListManager() {
  hideOverlay(lmOverlay);
  showLmBrowse();
}

if (lmClose) lmClose.addEventListener('click', closeListManager);
if (lmBack) lmBack.addEventListener('click', () => { showLmBrowse(); renderLmBrowse(); });
if (lmOverlay) lmOverlay.addEventListener('click', (e) => {
  if (e.target === lmOverlay && canDismissOverlay()) closeListManager();
});
if (lmNewBtn) lmNewBtn.addEventListener('click', () => showLmEdit('new'));
if (lmSaveBtn) lmSaveBtn.addEventListener('click', savePlaylist);

/* ── File manager ── */

function totalUsedBytes() {
  return mediaFiles.reduce((s, f) => s + f.size, 0) + systemFiles.reduce((s, f) => s + f.size, 0);
}

function tabUsedBytes(tab) {
  return (tab === 'media' ? mediaFiles : systemFiles).reduce((s, f) => s + f.size, 0);
}

function renderStorage() {
  const used = totalUsedBytes();
  const free = Math.max(0, storageTotal - used);
  const pct = Math.min(100, storageTotal ? (used / storageTotal) * 100 : 0);
  fmStorageFill.style.width = `${pct}%`;
  fmStorageFill.classList.toggle('is-warn', pct > 85);
  const tabLabel = fmActiveTab === 'media' ? 'Media' : 'System';
  fmStorageText.textContent =
    `${formatBytes(used)} of ${formatBytes(storageTotal)} used · ${formatBytes(free)} free · ${tabLabel}: ${formatBytes(tabUsedBytes(fmActiveTab))}`;
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
    meta.textContent = `${role} · ${formatBytes(file.size)} · ${formatDuration(file.durationSec)}`;
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

async function openFileManager() {
  if (!fmOverlay) {
    showToast('UI outdated — reflash firmware');
    return;
  }
  showOverlay(fmOverlay);
  setFileManagerTab('media');
  renderFileManager();
  try {
    await refreshFiles();
    renderFileManager();
  } catch (e) {
    showToast('Could not load files');
  }
  if (fmClose) fmClose.focus();
}

function closeFileManager() {
  hideOverlay(fmOverlay);
  if (fmFileInput) fmFileInput.value = '';
}

async function removeFile(tab, file) {
  const f = mediaFiles.find((x) => x.id === file) || systemFiles.find((x) => x.id === file);
  if (!f) return;
  const msg = tab === 'system'
    ? `Remove system sound "${f.name}"?`
    : `Remove "${trackLabel(f.name)}" from the library?`;
  if (!(await showConfirm(msg, 'Remove'))) return;
  try {
    await apiPost(`delete?path=${encodeURIComponent(f.path || f.id)}`);
    await refreshAll();
    await pollStatus();
    renderFileManager();
    showToast(`Removed ${f.name}`);
  } catch (e) {
    showToast('Remove failed');
  }
}

async function uploadFiles(fileList) {
  const dest = fmActiveTab === 'media' ? 'media' : 'system';
  let ok = 0;
  for (const file of Array.from(fileList)) {
    const name = file.name || 'upload.mp3';
    const url = `/api/upload?dest=${encodeURIComponent(dest)}&name=${encodeURIComponent(name)}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      let j = {};
      try { j = await r.json(); } catch (e) { /* ignore */ }
      if (r.ok && j.uploadok) ok += 1;
      else showToast(j.uploadError || `Upload failed: ${name}`);
    } catch (e) {
      showToast(`Upload failed: ${name}`);
    }
  }
  if (ok > 0) {
    await refreshAll();
    await pollStatus();
    renderFileManager();
    showToast(ok === 1 ? 'File uploaded' : `${ok} files uploaded`);
  }
  fmFileInput.value = '';
}

if (fmClose) fmClose.addEventListener('click', closeFileManager);
if (fmOverlay) fmOverlay.addEventListener('click', (e) => {
  if (e.target === fmOverlay && canDismissOverlay()) closeFileManager();
});
if (fmTabMedia) fmTabMedia.addEventListener('click', () => setFileManagerTab('media'));
if (fmTabSystem) fmTabSystem.addEventListener('click', () => setFileManagerTab('system'));
if (fmFileInput) fmFileInput.addEventListener('change', () => {
  if (fmFileInput.files?.length) uploadFiles(fmFileInput.files);
});

/* ── Balloons ── */

const SPARKLE_COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ff3300', '#ffea00', '#ff007f', '#39ff14'];

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

async function onBalloonTap(btn) {
  const id = btn.dataset.id;
  if (id === 'balloonA') { openFileManager(); return; }
  if (id === 'balloonB') { openListManager(); return; }
  if (id === 'balloonD') { openSleepTimer(); return; }
  if (id === 'balloonC') {
    try { await apiPost('stage'); await pollStatus(); } catch (e) { showToast('Stage toggle failed'); }
    return;
  }
  if (id === 'balloonE') {
    try { await apiPost('vol?d=1'); await pollStatus(); } catch (e) { showToast('Volume failed'); }
    return;
  }
  if (id === 'balloonF') {
    try { await apiPost('vol?d=-1'); await pollStatus(); } catch (e) { showToast('Volume failed'); }
    return;
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
  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    onBalloonTap(btn);
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tap-squish') btn.classList.remove('tapped');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || isOverlayOpen(confirmOverlay)) return;
  if (isOverlayOpen(fmOverlay)) closeFileManager();
  else if (isOverlayOpen(lmOverlay)) closeListManager();
  else if (isOverlayOpen(stOverlay)) closeSleepTimer();
});

(async function boot() {
  try {
    await refreshAll();
    await pollStatus();
    pollTimer = setInterval(pollStatus, 1500);
  } catch (e) {
    console.warn('boot failed', e);
    renderPlayer();
  }
})();
