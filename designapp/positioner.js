/**
 * Rainbowportal design tool — position & resize elements as % of background.
 * left/top = position from top-left of background (% width / % height)
 * width/height = size as % of background dimensions
 */

const DEFAULT_ITEMS = [
  { id: 'balloonA', src: '../Images/balloonA.png', left: 8,  top: 12, width: 18, height: 22 },
  { id: 'balloonB', src: '../Images/balloonB.png', left: 28, top: 8,  width: 16, height: 20 },
  { id: 'balloonC', src: '../Images/balloonC.png', left: 52, top: 15, width: 17, height: 21 },
  { id: 'balloonD', src: '../Images/balloonD.png', left: 72, top: 10, width: 15, height: 19 },
  { id: 'balloonE', src: '../Images/balloonE.png', left: 18, top: 45, width: 14, height: 18 },
  { id: 'balloonF', src: '../Images/balloonF.png', left: 62, top: 42, width: 16, height: 20 },
];

const stage = document.getElementById('stage');
const stageBg = document.getElementById('stageBg');
const elementList = document.getElementById('elementList');
const coordsPanel = document.getElementById('coordsPanel');
const cssOutput = document.getElementById('cssOutput');
const jsonOutput = document.getElementById('jsonOutput');
const stageMeta = document.getElementById('stageMeta');

let items = structuredClone(DEFAULT_ITEMS);
let selectedId = null;
let dragState = null;

function round1(n) { return Math.round(n * 10) / 10; }

function getItem(id) { return items.find((it) => it.id === id); }

function stageRect() { return stage.getBoundingClientRect(); }

function pctToStyle(item) {
  return {
    left: item.left + '%',
    top: item.top + '%',
    width: item.width + '%',
    height: item.height + '%',
  };
}

function applyStyle(el, item) {
  const s = pctToStyle(item);
  el.style.left = s.left;
  el.style.top = s.top;
  el.style.width = s.width;
  el.style.height = s.height;
}

function uniqueId(base) {
  let id = base;
  let n = 2;
  while (items.some((it) => it.id === id)) {
    id = base + n;
    n++;
  }
  return id;
}

function renderHotspots() {
  stage.querySelectorAll('.hotspot').forEach((el) => el.remove());
  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'hotspot' + (item.id === selectedId ? ' selected' : '');
    el.dataset.id = item.id;
    applyStyle(el, item);

    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.id;
    el.appendChild(img);

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.dataset.resize = '1';
    el.appendChild(handle);

    el.addEventListener('pointerdown', onPointerDown);
    stage.appendChild(el);
  });
  renderList();
  renderOutputs();
  renderCoordsPanel();
}

function renderList() {
  elementList.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = item.id === selectedId ? 'active' : '';
    li.innerHTML =
      `<strong>${item.id}</strong><div class="sub">left ${item.left}% · top ${item.top}% · w ${item.width}% · h ${item.height}%</div>`;
    li.addEventListener('click', () => select(item.id));
    elementList.appendChild(li);
  });
}

function renderCoordsPanel() {
  const item = selectedId ? getItem(selectedId) : null;
  if (!item) {
    coordsPanel.innerHTML = '<p class="empty">Click an element on the stage</p>';
    return;
  }
  coordsPanel.innerHTML = `
    <label>left (x)<input type="number" id="inpLeft" step="0.1" min="0" max="100" value="${item.left}"><span class="unit">%</span></label>
    <label>top (y)<input type="number" id="inpTop" step="0.1" min="0" max="100" value="${item.top}"><span class="unit">%</span></label>
    <label>width<input type="number" id="inpWidth" step="0.1" min="1" max="100" value="${item.width}"><span class="unit">%</span></label>
    <label>height<input type="number" id="inpHeight" step="0.1" min="1" max="100" value="${item.height}"><span class="unit">%</span></label>
    <label>id<input type="text" id="inpId" value="${item.id}" style="grid-column:2/span 2"></label>
  `;
  ['Left', 'Top', 'Width', 'Height'].forEach((key) => {
    const inp = document.getElementById('inp' + key);
    inp.addEventListener('change', () => {
      const field = key.toLowerCase();
      item[field] = round1(parseFloat(inp.value) || 0);
      clampItem(item);
      renderHotspots();
    });
  });
  document.getElementById('inpId').addEventListener('change', (e) => {
    const val = e.target.value.trim().replace(/\s+/g, '_');
    if (!val || items.some((it) => it.id === val && it.id !== item.id)) return;
    item.id = val;
    selectedId = val;
    renderHotspots();
  });
}

function clampItem(item) {
  item.width = Math.max(1, Math.min(100, item.width));
  item.height = Math.max(1, Math.min(100, item.height));
  item.left = Math.max(0, Math.min(100 - item.width, item.left));
  item.top = Math.max(0, Math.min(100 - item.height, item.top));
}

function buildCss() {
  return items.map((it) => {
    const s = pctToStyle(it);
    return `.${it.id} {\n  position: absolute;\n  left: ${s.left};\n  top: ${s.top};\n  width: ${s.width};\n  height: ${s.height};\n}`;
  }).join('\n\n');
}

function buildJson() {
  return JSON.stringify(
    items.map((it) => ({
      id: it.id,
      src: it.src,
      left: round1(it.left),
      top: round1(it.top),
      width: round1(it.width),
      height: round1(it.height),
    })),
    null,
    2
  );
}

function renderOutputs() {
  cssOutput.textContent = buildCss();
  jsonOutput.textContent = buildJson();
}

function select(id) {
  selectedId = id;
  renderHotspots();
}

function onPointerDown(e) {
  const hotspot = e.target.closest('.hotspot');
  if (!hotspot) return;
  const id = hotspot.dataset.id;
  const item = getItem(id);
  if (!item) return;
  select(id);

  const rect = stageRect();
  const isResize = e.target.dataset.resize === '1';

  dragState = {
    id,
    mode: isResize ? 'resize' : 'move',
    startX: e.clientX,
    startY: e.clientY,
    rectW: rect.width,
    rectH: rect.height,
    origLeft: item.left,
    origTop: item.top,
    origWidth: item.width,
    origHeight: item.height,
    aspect: item.width / item.height,
    shiftKey: e.shiftKey,
  };

  hotspot.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragState) return;
  const item = getItem(dragState.id);
  if (!item) return;

  const dx = ((e.clientX - dragState.startX) / dragState.rectW) * 100;
  const dy = ((e.clientY - dragState.startY) / dragState.rectH) * 100;

  if (dragState.mode === 'move') {
    item.left = round1(dragState.origLeft + dx);
    item.top = round1(dragState.origTop + dy);
    clampItem(item);
  } else {
    let w = dragState.origWidth + dx;
    let h = dragState.origHeight + dy;
    if (e.shiftKey || dragState.shiftKey) {
      w = Math.max(w, h * dragState.aspect);
      h = w / dragState.aspect;
    }
    item.width = round1(w);
    item.height = round1(h);
    clampItem(item);
  }

  const el = stage.querySelector(`.hotspot[data-id="${CSS.escape(item.id)}"]`);
  if (el) applyStyle(el, item);
  renderList();
  renderOutputs();
  renderCoordsPanel();
}

function onPointerUp() {
  dragState = null;
}

stage.addEventListener('pointermove', onPointerMove);
stage.addEventListener('pointerup', onPointerUp);
stage.addEventListener('pointercancel', onPointerUp);

stage.addEventListener('click', (e) => {
  if (e.target === stage || e.target === stageBg) {
    selectedId = null;
    renderHotspots();
  }
});

document.getElementById('btnDelete').addEventListener('click', () => {
  if (!selectedId) return;
  items = items.filter((it) => it.id !== selectedId);
  selectedId = items.length ? items[0].id : null;
  renderHotspots();
});

document.getElementById('btnDuplicate').addEventListener('click', () => {
  if (!selectedId) return;
  const src = getItem(selectedId);
  const copy = structuredClone(src);
  copy.id = uniqueId(src.id + '_copy');
  copy.left = round1(src.left + 3);
  copy.top = round1(src.top + 3);
  items.push(copy);
  selectedId = copy.id;
  renderHotspots();
});

function copyCssToClipboard(btn) {
  const text = buildCss();
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const label = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {});
}

document.getElementById('btnCopy').addEventListener('click', (e) => copyCssToClipboard(e.target));
document.getElementById('btnCopyCss').addEventListener('click', (e) => copyCssToClipboard(e.target));

document.getElementById('btnCopyJson').addEventListener('click', () => {
  navigator.clipboard.writeText(buildJson()).catch(() => {});
});

document.getElementById('addFile').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const id = uniqueId(base || 'element');
  items.push({ id, src: url, left: 10, top: 10, width: 20, height: 20 });
  selectedId = id;
  renderHotspots();
  e.target.value = '';
});

stageBg.addEventListener('load', () => {
  const w = stageBg.naturalWidth;
  const h = stageBg.naturalHeight;
  stageMeta.textContent = `Background: ${w} × ${h} px — all positions are % of this image`;
});

if (items.length) selectedId = items[0].id;
renderHotspots();
