'use strict';

const canvas = document.getElementById('strategy-canvas');
const surface = canvas.parentElement;
const selection = document.getElementById('strategy-selection');
const cellCount = 150;
const cellSize = 100 / cellCount;

const viewport = document.getElementById('strategy-viewport');
const zoomOut = document.getElementById('strategy-zoom-out');
const zoomIn = document.getElementById('strategy-zoom-in');
const zoomLevel = document.getElementById('strategy-zoom-level');
const minimapView = document.getElementById('strategy-minimap-view');
const minimap = document.getElementById('strategy-minimap');
const minimapToggle = document.getElementById('strategy-minimap-toggle');
const { setText } = siteLanguage;
const mapFrame = document.getElementById('strategy-map');
const fullscreenButton = document.getElementById('strategy-fullscreen');

if (document.fullscreenEnabled && typeof mapFrame.requestFullscreen === 'function') {
  fullscreenButton.hidden = false;
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === mapFrame) await document.exitFullscreen();
      else await mapFrame.requestFullscreen();
    } catch {
      // Fullscreen may be denied by the browser.
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.setAttribute('aria-pressed', String(document.fullscreenElement === mapFrame));
  });
}
minimapToggle.addEventListener('click', () => {
  minimap.hidden = !minimap.hidden;
  minimapToggle.setAttribute('aria-expanded', String(!minimap.hidden));
  setText(minimapToggle, minimap.hidden ? 'Show minimap' : 'Hide minimap',
    minimap.hidden ? '미니맵 펴기' : '미니맵 접기', 'aria-label');
});
const visibleColumnsAt100Percent = 24;
const initialVisibleArea = 0.043;
const minimumVisibleArea = 0.005;
const zoomStorageKey = 'bgb-strategy-zoom';
const positionStorageKey = 'bgb-strategy-position';
let defaultZoom = zoomForVisibleArea(initialVisibleArea);
let maxZoom = zoomForVisibleArea(minimumVisibleArea);
let minZoom = defaultZoom ** 2 / maxZoom;
let zoom = defaultZoom;
let tap = null;

function zoomForVisibleArea(visibleArea) {
  const width = viewport.clientWidth || window.innerWidth || 1;
  const height = viewport.clientHeight || window.innerHeight || 1;
  const mapSize = Math.min(
    Math.sqrt(width * height / visibleArea),
    Math.min(width, height) / visibleArea,
  );
  return mapSize / width * visibleColumnsAt100Percent / cellCount * 100;
}

function zoomProgress() {
  return Math.log(zoom / minZoom) / Math.log(maxZoom / minZoom);
}

function zoomAtProgress(progress) {
  return minZoom * (maxZoom / minZoom) ** progress;
}

function readSavedZoom() {
  try {
    const progress = Number.parseFloat(localStorage.getItem(zoomStorageKey));
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      return zoomAtProgress(progress);
    }
  } catch {
    // The strategy board can run with storage disabled.
  }
  return defaultZoom;
}

function readSavedPosition() {
  try {
    const position = JSON.parse(localStorage.getItem(positionStorageKey));
    if (Array.isArray(position) && position.length === 2 &&
        position.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      return position;
    }
  } catch {
    // Use the map center if the saved position is unavailable.
  }
  return [0.5, 0.5];
}

function savePosition() {
  if (!canvas.offsetWidth || !canvas.offsetHeight) return;
  const x = (viewport.scrollLeft + viewport.clientWidth / 2) / canvas.offsetWidth;
  const y = (viewport.scrollTop + viewport.clientHeight / 2) / canvas.offsetHeight;
  try {
    localStorage.setItem(positionStorageKey, JSON.stringify([x, y]));
  } catch {
    // Keep map movement usable with storage disabled.
  }
}

function sizeMap() {
  surface.style.width = `${cellCount / visibleColumnsAt100Percent * zoom}%`;
  const viewportWidth = viewport.clientWidth || window.innerWidth || 1;
  const backgroundSize = viewportWidth * cellCount / visibleColumnsAt100Percent * minZoom / 100;
  surface.style.setProperty('--strategy-background-size', `${backgroundSize}px`);
  zoomLevel.value = `${Math.round(100 * zoomProgress())}%`;
  zoomOut.disabled = zoom === minZoom;
  zoomIn.disabled = zoom === maxZoom;
}

surface.style.setProperty('--cell-size', `${cellSize}%`);
const minimapMarkers = document.getElementById('strategy-minimap-markers');
minimapMarkers.style.setProperty('--cell-size', `${cellSize}%`);
for (const building of surface.querySelectorAll('.strategy-territory, .strategy-facility')) {
  minimapMarkers.append(building.cloneNode(false));
}

const baseSlots = [];
for (let diagonal = 0; diagonal <= 10; diagonal++) {
  // Fill the interior of each diagonal before its left and bottom ends.
  const rows = [];
  for (let row = 1; row < diagonal; row++) rows.push(row);
  rows.push(0);
  if (diagonal > 0) rows.push(diagonal);
  for (const row of rows) {
    const column = 5 - (diagonal - row);
    if (row < 6 && column >= 0 && !(row >= 4 && column < 2)) {
      baseSlots.push({ row, column });
    }
  }
}

function setBaseName(base, name) {
  const label = base.firstElementChild;
  if (name) {
    label.removeAttribute('data-en-text');
    label.removeAttribute('data-ko-text');
    label.textContent = name;
  } else {
    setText(label, base.dataset.defaultNameEn, base.dataset.defaultNameKo);
  }
}

for (const territory of surface.querySelectorAll('.strategy-territory')) {
  const isRed = territory.classList.contains('strategy-territory-red');

  for (const [index, slot] of baseSlots.slice(0, 20).entries()) {
    const row = isRed ? 5 - slot.row : slot.row;
    const column = isRed ? 5 - slot.column : slot.column;
    const base = document.createElement('div');
    base.className = 'strategy-player-base';
    base.dataset.nameKey = `bgb-strategy-tower-name-${isRed ? 'red' : 'blue'}-${index + 1}`;
    base.style.left = `${column / 6 * 100}%`;
    base.style.top = `${row / 6 * 100}%`;
    const label = document.createElement('span');
    label.className = 'strategy-building-name';
    base.dataset.defaultNameEn = `${isRed ? 'Red' : 'Blue'} Player ${index + 1}`;
    base.dataset.defaultNameKo = base.dataset.defaultNameEn;
    base.append(label);
    let savedName;
    try {
      savedName = localStorage.getItem(base.dataset.nameKey);
    } catch {
      // Keep the default name when storage is unavailable.
    }
    setBaseName(base, savedName);
    territory.append(base);
  }
}

function mapCellAt(x, y) {
  const map = canvas.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  if (x < view.left || x >= view.left + viewport.clientWidth || y < view.top || y >= view.top + viewport.clientHeight) return;

  const column = Math.floor((x - map.left) / map.width * cellCount);
  const row = Math.floor((y - map.top) / map.height * cellCount);
  if (column < 0 || column >= cellCount || row < 0 || row >= cellCount) return;
  return { column, row };
}

function selectCell({ column, row }) {
  selection.style.left = `${column * cellSize}%`;
  selection.style.top = `${row * cellSize}%`;
  selection.hidden = false;
}

function updateMinimap() {
  const map = canvas.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  const left = bounds.left + viewport.clientLeft;
  const top = bounds.top + viewport.clientTop;
  const visibleLeft = Math.max(left, map.left);
  const visibleTop = Math.max(top, map.top);
  const visibleRight = Math.min(left + viewport.clientWidth, map.right);
  const visibleBottom = Math.min(top + viewport.clientHeight, map.bottom);

  minimapView.style.left = `${100 * (visibleLeft - map.left) / map.width}%`;
  minimapView.style.top = `${100 * (visibleTop - map.top) / map.height}%`;
  minimapView.style.width = `${100 * (visibleRight - visibleLeft) / map.width}%`;
  minimapView.style.height = `${100 * (visibleBottom - visibleTop) / map.height}%`;
}

zoom = readSavedZoom();
sizeMap();
const [savedX, savedY] = readSavedPosition();
centerMapAt(savedX, savedY);
minimap.addEventListener('click', (event) => {
  const bounds = minimap.getBoundingClientRect();
  const x = (event.clientX - bounds.left - minimap.clientLeft) / minimap.clientWidth;
  const y = (event.clientY - bounds.top - minimap.clientTop) / minimap.clientHeight;
  centerMapAt(x, y);
  updateMinimap();
  savePosition();
});
viewport.addEventListener('scroll', () => {
  updateMinimap();
  savePosition();
}, { passive: true });
new ResizeObserver(() => {
  if (!viewport.clientWidth || !viewport.clientHeight) return;
  const progress = zoomProgress();
  defaultZoom = zoomForVisibleArea(initialVisibleArea);
  maxZoom = zoomForVisibleArea(minimumVisibleArea);
  minZoom = defaultZoom ** 2 / maxZoom;
  changeZoom(zoomAtProgress(progress) - zoom, false);
}).observe(viewport);
updateMinimap();

function centerMapAt(x, y) {
  viewport.scrollLeft = x * canvas.offsetWidth - viewport.clientWidth / 2;
  viewport.scrollTop = y * canvas.offsetHeight - viewport.clientHeight / 2;
}

function setZoom(nextZoom, from, to = from, save = true) {
  if (!Number.isFinite(nextZoom) || !viewport.clientWidth || !viewport.clientHeight) return;
  tap = null;
  const before = canvas.getBoundingClientRect();
  const anchorX = (from.x - before.left) / before.width;
  const anchorY = (from.y - before.top) / before.height;

  zoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
  sizeMap();
  if (save) {
    try {
      localStorage.setItem(zoomStorageKey, String(zoomProgress()));
    } catch {
      // Keep zoom controls usable with storage disabled.
    }
  }

  const after = canvas.getBoundingClientRect();
  viewport.scrollLeft += after.left + anchorX * after.width - to.x;
  viewport.scrollTop += after.top + anchorY * after.height - to.y;
  if (save) savePosition();
  updateMinimap();
}

function changeZoom(step, save = true) {
  const bounds = viewport.getBoundingClientRect();
  const center = {
    x: bounds.left + viewport.clientLeft + viewport.clientWidth / 2,
    y: bounds.top + viewport.clientTop + viewport.clientHeight / 2,
  };
  setZoom(zoom + step, center, center, save);
}

zoomOut.addEventListener('click', () => changeZoom(-25));
zoomIn.addEventListener('click', () => changeZoom(25));
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (!(event.metaKey || event.ctrlKey)) {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    window.scrollBy(0, event.deltaY * unit);
    return;
  }
  if (event.deltaY === 0) return;
  const progress = zoomProgress() - Math.sign(event.deltaY) / 10;
  setZoom(zoomAtProgress(progress), { x: event.clientX, y: event.clientY });
}, { passive: false });

const touchPoints = new Map();
let twoFingerStart = null;
let twoFingerMode = null;
let spaceHeld = false;

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.target.closest('button, input, textarea, select, [contenteditable]')) return;
  event.preventDefault();
  spaceHeld = true;
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') spaceHeld = false;
});
window.addEventListener('blur', () => { spaceHeld = false; });
const baseInfo = document.getElementById('strategy-base-info');
const baseInfoName = document.getElementById('strategy-base-info-name');
let lastBaseTap = null;
let selectedBase = null;
const moveStatus = document.getElementById('strategy-move-status');
const movePreview = document.getElementById('strategy-move-preview');
const moveConfirm = document.getElementById('strategy-move-confirm');
let destination = null;
const territories = [...surface.querySelectorAll('.strategy-territory')];
const buildings = [...surface.querySelectorAll('.strategy-hq, .strategy-facility, .strategy-player-base')];

function moveBase(base, { column, row }, commit = false) {
  const map = canvas.getBoundingClientRect();
  const x = column - 1;
  const y = row - 1;
  const size = 3;
  if (x < 0 || y < 0 || x + size > cellCount || y + size > cellCount) {
    return '타워가 전장 경계를 벗어납니다.';
  }

  function mapBounds(element) {
    const rect = element.getBoundingClientRect();
    const gridX = px => Math.round((px - map.left) / map.width * cellCount * 2) / 2;
    const gridY = px => Math.round((px - map.top) / map.height * cellCount * 2) / 2;
    return { left: gridX(rect.left), top: gridY(rect.top), right: gridX(rect.right), bottom: gridY(rect.bottom) };
  }

  function overlaps(area) {
    return x < area.right && x + size > area.left && y < area.bottom && y + size > area.top;
  }

  if (territories.some(territory => overlaps(mapBounds(territory)))) {
    return '본진 영역에는 이동할 수 없습니다.';
  }
  if (buildings.some(building => building !== base && overlaps(mapBounds(building)))) {
    return '다른 건물의 점유 영역과 겹칩니다.';
  }

  if (commit) {
    const homeBounds = mapBounds(base.parentElement);
    base.style.left = `${100 * (x - homeBounds.left) / (homeBounds.right - homeBounds.left)}%`;
    base.style.top = `${100 * (y - homeBounds.top) / (homeBounds.bottom - homeBounds.top)}%`;
  }
  return '';
}

function clearMovePreview() {
  destination = null;
  movePreview.hidden = true;
  moveStatus.hidden = true;
}

function previewMove(cell, error = moveBase(selectedBase, cell)) {
  destination = cell;
  movePreview.style.left = `${(cell.column - 1) * cellSize}%`;
  movePreview.style.top = `${(cell.row - 1) * cellSize}%`;
  movePreview.classList.toggle('is-blocked', Boolean(error));
  movePreview.classList.toggle('is-near-bottom', cell.row >= cellCount - 5);
  moveConfirm.disabled = Boolean(error);
  moveStatus.hidden = !error;
  movePreview.hidden = false;
}

document.getElementById('strategy-move-cancel').addEventListener('click', clearMovePreview);
moveConfirm.addEventListener('click', () => {
  if (!selectedBase || !destination || moveConfirm.disabled) return;
  const error = moveBase(selectedBase, destination, true);
  if (error) {
    previewMove(destination, error);
    return;
  }
  hasMovedPlayer = true;
  playArrivalEffect(selectedBase);
  lastBaseTap = null;
  showBaseInfo(null);
});

function playArrivalEffect(base) {
  base.querySelector('.strategy-arrival')?.remove();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const arrival = document.createElement('span');
  arrival.className = 'strategy-arrival';
  arrival.setAttribute('aria-hidden', 'true');
  const buildingImage = document.createElement('span');
  const beam = document.createElement('i');
  arrival.append(buildingImage, beam);
  arrival.addEventListener('animationend', (event) => {
    if (event.target === buildingImage) arrival.remove();
  });
  base.append(arrival);
}

function showBaseInfo(base) {
  clearMovePreview();
  selectedBase?.classList.remove('is-selected');
  selectedBase = base;
  selectedBase?.classList.add('is-selected');
  viewport.classList.toggle('has-selected-base', Boolean(base));
  baseInfo.hidden = !base;
  baseInfo.classList.toggle('is-red-team', Boolean(base?.closest('.strategy-territory-red')));
  baseInfoName.textContent = base?.firstElementChild.textContent ?? '';
}

document.getElementById('strategy-base-info-clear').addEventListener('click', () => {
  lastBaseTap = null;
  showBaseInfo(null);
  viewport.focus({ preventScroll: true });
});

const playerBases = [...surface.querySelectorAll('.strategy-player-base')];
const resetNamesButton = document.getElementById('strategy-reset-names');

function updateResetNamesButton() {
  resetNamesButton.disabled = playerBases.every(base => base.firstElementChild.hasAttribute('data-ko-text'));
}

document.addEventListener('site-language-change', () => {
  baseInfoName.textContent = selectedBase?.firstElementChild.textContent ?? '';
});

resetNamesButton.addEventListener('click', () => {
  if (resetNamesButton.disabled || !window.confirm(siteLanguage.value === 'ko'
    ? '모든 타워 이름을 기본 이름으로 되돌릴까요?'
    : 'Restore the default names for all towers?')) return;
  for (const base of playerBases) {
    setBaseName(base);
    try {
      localStorage.removeItem(base.dataset.nameKey);
    } catch {
      // Reset the displayed name even when storage is unavailable.
    }
  }
  baseInfoName.textContent = selectedBase?.firstElementChild.textContent ?? '';
  updateResetNamesButton();
});
updateResetNamesButton();

const playButton = document.getElementById('strategy-play');
const timeButtons = document.querySelectorAll('#strategy-record-controls [data-minute]');
const recordedPositions = new Map();
const saveStatus = document.getElementById('strategy-save-status');
let hasMovedPlayer = false;
let saveStatusTimer;

function capturePositions() {
  return playerBases.map(({ style }) => [style.left, style.top]);
}

const initialPositions = capturePositions();

function restorePositions(positions, animate = false) {
  saveStatus.hidden = true;
  lastBaseTap = null;
  showBaseInfo(null);
  selection.hidden = true;
  playerBases.forEach((base, index) => {
    const [left, top] = positions[index];
    const moved = base.style.left !== left || base.style.top !== top;
    base.style.left = left;
    base.style.top = top;
    if (animate && moved) playArrivalEffect(base);
    else base.querySelector('.strategy-arrival')?.remove();
  });
}

playButton.addEventListener('click', () => {
  const playing = playButton.getAttribute('aria-pressed') !== 'true';
  playButton.setAttribute('aria-pressed', String(playing));
  if (playing) restorePositions(initialPositions);
  for (const button of timeButtons) {
    button.disabled = playing && !recordedPositions.has(button.dataset.minute);
  }
});

function setRecordLabel(button, saved) {
  const minute = button.dataset.minute;
  setText(button, `${minute}-minute layout: ${saved ? 'saved' : 'not saved'}`,
    `${minute}분 배치 ${saved ? '저장됨' : '미저장'}`, 'aria-label');
}

for (const button of timeButtons) {
  setRecordLabel(button, false);
  button.addEventListener('click', () => {
    const minute = button.dataset.minute;
    if (playButton.getAttribute('aria-pressed') === 'false') {
      if (!hasMovedPlayer) {
        clearMovePreview();
        clearTimeout(saveStatusTimer);
        saveStatus.hidden = false;
        saveStatusTimer = setTimeout(() => { saveStatus.hidden = true; }, 3000);
        return;
      }
      saveStatus.hidden = true;
      recordedPositions.set(minute, capturePositions());
      playButton.disabled = false;
      button.classList.add('is-recorded');
      setRecordLabel(button, true);
    } else if (recordedPositions.has(minute)) {
      restorePositions(recordedPositions.get(minute), true);
    }
  });
}

document.getElementById('strategy-record-reset').addEventListener('click', () => {
  recordedPositions.clear();
  hasMovedPlayer = false;
  playButton.setAttribute('aria-pressed', 'false');
  playButton.disabled = true;
  for (const button of timeButtons) {
    button.disabled = false;
    button.classList.remove('is-recorded');
    setRecordLabel(button, false);
  }
  restorePositions(initialPositions);
});

function touchCenter() {
  const [first, second = first] = touchPoints.values();
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y),
  };
}

viewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.strategy-move-actions')) return;
  const base = event.target.closest('.strategy-player-base');
  const onMap = event.target === canvas || base || (selectedBase && surface.contains(event.target));
  if (event.pointerType !== 'touch' && (event.button !== 0 || !surface.contains(event.target))) return;
  if (touchPoints.size >= (event.pointerType === 'touch' ? 2 : 1)) return;
  if (event.pointerType === 'mouse') viewport.focus({ preventScroll: true });
  const spaceDrag = spaceHeld && (event.pointerType === 'mouse' || event.pointerType === 'touch');
  tap = touchPoints.size === 0 && onMap && !spaceDrag
    ? { id: event.pointerId, x: event.clientX, y: event.clientY, base }
    : null;
  if (!tap?.base) lastBaseTap = null;
  viewport.setPointerCapture(event.pointerId);
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPoints.size === 2) twoFingerStart = touchCenter();
});

viewport.addEventListener('pointermove', (event) => {
  if (!touchPoints.has(event.pointerId)) return;
  if (spaceHeld && (event.pointerType === 'mouse' || event.pointerType === 'touch')) {
    tap = null;
    lastBaseTap = null;
  }
  if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) {
    tap = null;
    lastBaseTap = null;
  }
  const before = touchCenter();
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const after = touchCenter();

  if (touchPoints.size === 2 && before.distance > 0) {
    if (event.pointerType === 'touch') {
      if (!twoFingerMode) {
        const travel = Math.hypot(after.x - twoFingerStart.x, after.y - twoFingerStart.y);
        const spread = Math.abs(after.distance - twoFingerStart.distance);
        if (Math.max(travel, spread) < 8) return;
        twoFingerMode = travel > spread || twoFingerStart.distance === 0 ? 'pan' : 'pinch';
        if (twoFingerMode === 'pan') {
          viewport.scrollLeft += twoFingerStart.x - after.x;
          viewport.scrollTop += twoFingerStart.y - after.y;
        } else {
          setZoom(zoom * after.distance / twoFingerStart.distance, twoFingerStart, after);
        }
        return;
      }
      if (twoFingerMode === 'pan') {
        viewport.scrollLeft += before.x - after.x;
        viewport.scrollTop += before.y - after.y;
        return;
      }
    }
    setZoom(zoom * after.distance / before.distance, before, after);
  } else if (touchPoints.size === 1 && event.pointerType === 'touch' && !spaceHeld) {
    if (!tap) window.scrollBy(0, before.y - after.y);
  } else if (touchPoints.size === 1) {
    viewport.scrollLeft += before.x - after.x;
    viewport.scrollTop += before.y - after.y;
  }
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  viewport.addEventListener(type, (event) => {
    if (touchPoints.delete(event.pointerId)) {
      twoFingerStart = null;
      twoFingerMode = null;
    }
    if (tap?.id !== event.pointerId) return;
    const { base } = tap;
    const distance = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    tap = null;
    if (type !== 'pointerup' || distance > 6) {
      lastBaseTap = null;
      return;
    }
    if (base) {
      selection.hidden = true;
      const label = base.firstElementChild;
      if (lastBaseTap?.base === base && event.timeStamp - lastBaseTap.time <= 500) {
        lastBaseTap = null;
        const name = window.prompt(siteLanguage.value === 'ko' ? '타워 이름을 입력하세요.' : 'Enter a tower name.', label.textContent)?.trim();
        if (name) {
          setBaseName(base, name);
          try {
            localStorage.setItem(base.dataset.nameKey, name);
          } catch {
            // Keep the edited name for the current session.
          }
          updateResetNamesButton();
        }
      } else {
        lastBaseTap = { base, time: event.timeStamp };
      }
      showBaseInfo(base);
      return;
    }
    lastBaseTap = null;
    const cell = mapCellAt(event.clientX, event.clientY);
    if (!cell) return;
    if (selectedBase) {
      previewMove(cell);
    } else {
      selectCell(cell);
    }
  });
}
