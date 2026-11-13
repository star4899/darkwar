'use strict';

const form = document.getElementById('draw-form');
const selectedCount = document.getElementById('selected-count');
const reserveCount = document.getElementById('reserve-count');
const countFields = [[selectedCount, 1, 20], [reserveCount, 0, 10]];
const teams = ['a', 'b'].map(id => ({
  id,
  input: document.getElementById(`roster-${id}`),
  list: document.getElementById(`roster-${id}-list`),
  confirm: document.getElementById(`roster-${id}-confirm`),
  toggle: document.getElementById(`roster-${id}-toggle`),
  random: document.getElementById(`team-${id}-random`),
  applicants: new Map()
}));
const message = document.getElementById('draw-message');
const resultStatus = document.getElementById('result-status');
const storageStatus = document.getElementById('storage-status');
const drawTime = document.getElementById('draw-time');
const resultGroups = document.getElementById('result-groups');
const resultsEmpty = document.getElementById('results-empty');
const resultTemplate = document.getElementById('result-template');
const downloadStatus = document.getElementById('download-status');
const storageKey = 'random-bgb-state';
const compareNames = new Intl.Collator('ko', { sensitivity: 'base', numeric: true }).compare;
const timeOptions = {
  // Etc/GMT+2 is UTC−02:00, 11 hours behind Korea.
  timeZone: 'Etc/GMT+2', year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
};
const formatters = {
  en: new Intl.DateTimeFormat('en-GB', timeOptions),
  ko: new Intl.DateTimeFormat('ko-KR', timeOptions)
};
const resultTitles = {
  selected: ['Selected Players', '선발 인원 명단'],
  reserve: ['Reserves', '예비 인원 명단'],
  unselected: ['Not Selected', '선정 탈락자 명단']
};
const { setText } = siteLanguage;
const drawCounts = Object.create(null);

function formatTime(date, language) {
  const label = language === 'ko' ? '게임 서버 시간' : 'Game server time';
  return `${formatters[language].format(date)} (${label})`;
}

function readNames(input) {
  return input.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}

function getCheckedRosters() {
  return teams.map(({ applicants }) => [...applicants].filter(([, checked]) => checked).map(([name]) => name));
}

function getRosterKey(rosters) {
  return JSON.stringify(rosters.map(names => [...names].sort()));
}

function updateDrawCount(count) {
  setText(document.getElementById('draw-count'), `Draws for this roster: ${count}`, `동일 명단 추첨 ${count}회`);
}

function renderList(container, result, draw) {
  const { id, titles: [en, ko], kind, names } = result;
  const card = resultTemplate.content.firstElementChild.cloneNode(true);
  card.classList.add(`${kind}-card`);
  card.querySelector('details').id = `${id}-details`;
  setText(card.querySelector('.result-label'), en, ko);
  card.querySelector('.result-total').textContent = String(names.length);
  const list = card.querySelector('ol');
  list.id = `${id}-list`;
  setText(list, en, ko, 'aria-label');
  names.forEach((name, index) => {
    const item = document.createElement('li');
    const number = document.createElement('span');
    const text = document.createElement('span');
    number.className = 'person-number';
    number.textContent = String(index + 1).padStart(2, '0');
    text.className = 'person-name';
    text.textContent = name;
    item.append(number, text);
    list.append(item);
  });
  list.hidden = names.length === 0;
  card.querySelector('.result-empty').hidden = names.length > 0;
  setText(card.querySelector('.result-empty'), 'No one in this group.', '해당 인원이 없습니다.');
  const button = card.querySelector('button');
  button.id = `${id}-download`;
  setText(button, `Download ${en} as PNG`, `${ko} PNG 다운로드`, 'aria-label');
  button.disabled = false;
  button.addEventListener('click', () => downloadResult(button, result, draw));
  container.append(card);
}

function clearResults() {
  resultGroups.querySelectorAll('.result-card').forEach(card => card.remove());
  resultGroups.hidden = true;
  resultsEmpty.hidden = false;
  drawTime.hidden = true;
  drawTime.textContent = '';
  setText(resultStatus, 'Waiting for a draw', '추첨 대기 중');
  resultStatus.classList.remove('is-complete');
  setText(message, '', '');
  setText(downloadStatus, '', '');
}

function setRosterExpanded({ list, toggle }, expanded) {
  list.classList.toggle('is-expanded', expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  if (!expanded) list.scrollTop = 0;
}

function updateRosterSummary() {
  const rosters = getCheckedRosters();
  teams.forEach((team, index) => {
    const { id, input, applicants, toggle } = team;
    const entered = readNames(input).length;
    const checked = rosters[index].length;
    document.getElementById(`roster-${id}-count`).textContent = `${entered}/${checked}`;
    setText(document.getElementById(`roster-${id}-stats`),
      `Entered: ${entered} · Listed: ${applicants.size} · Checked: ${checked}`,
      `입력 ${entered}명 · 목록 ${applicants.size}명 · 체크 ${checked}명`);
    toggle.hidden = applicants.size <= 5;
    if (toggle.hidden) setRosterExpanded(team, false);
  });
  updateDrawCount(drawCounts[getRosterKey(rosters)] ?? 0);
}

function updateApplicants() {
  clearResults();
  updateRosterSummary();
  saveState();
}

function appendApplicant(team, name) {
  const row = document.createElement('li');
  row.className = 'applicant-row';
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = team.applicants.get(name);
  checkbox.addEventListener('change', () => {
    team.applicants.set(name, checkbox.checked);
    updateApplicants();
  });
  const text = document.createElement('span');
  text.className = 'applicant-name';
  text.textContent = name;
  text.title = name;
  label.append(checkbox, text);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'applicant-delete';
  setText(remove, 'Remove', '삭제');
  setText(remove, `Remove ${name}`, `${name} 삭제`, 'aria-label');
  remove.addEventListener('click', () => {
    const nextRow = row.nextElementSibling ?? row.previousElementSibling;
    team.applicants.delete(name);
    row.remove();
    (nextRow?.querySelector('button') ?? team.confirm).focus();
    updateApplicants();
  });
  row.append(label, remove);
  team.list.append(row);
}

function saveState() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({
      rosterA: teams[0].input.value,
      rosterB: teams[1].input.value,
      applicants: teams.map(team => [...team.applicants]),
      selectedCount: selectedCount.value,
      reserveCount: reserveCount.value,
      randomSelection: teams.map(({ random }) => random.checked),
      drawCounts
    }));
    setText(storageStatus, 'Rosters, settings, and draw counts are saved in this tab.',
      '명단·설정·추첨 횟수는 이 탭에 자동으로 임시 저장됩니다.');
  } catch {
    setText(storageStatus, 'Unable to save in this tab. Refreshing will clear your changes.',
      '이 탭에 저장할 수 없습니다. 새로고침하면 변경 내용이 사라집니다.');
  }
}

function restoreState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (!saved || typeof saved !== 'object') return;
    const rosterA = saved.rosterA ?? saved.roster;
    if (typeof rosterA === 'string') teams[0].input.value = rosterA;
    if (typeof saved.rosterB === 'string') teams[1].input.value = saved.rosterB;
    teams.forEach(({ input, applicants, random }, index) => {
      const savedRandom = saved.randomSelection?.[index];
      if (typeof savedRandom === 'boolean') random.checked = savedRandom;
      const savedApplicants = saved.applicants?.[index];
      if (!Array.isArray(savedApplicants)) {
        readNames(input).forEach(name => applicants.set(name, true));
        return;
      }
      for (const entry of savedApplicants) {
        if (!Array.isArray(entry)) continue;
        const [name, checked] = entry;
        if (typeof name === 'string' && name.trim() && typeof checked === 'boolean') applicants.set(name.trim(), checked);
      }
    });
    for (const [input, min, max] of countFields) {
      const value = saved[input === selectedCount ? 'selectedCount' : 'reserveCount'];
      const count = Number(value);
      if (/^[0-9]+$/.test(String(value)) && count >= min && count <= max) {
        input.value = String(count);
      }
    }
    if (saved.drawCounts && typeof saved.drawCounts === 'object' && !Array.isArray(saved.drawCounts)) {
      for (const [key, count] of Object.entries(saved.drawCounts)) {
        if (Number.isSafeInteger(count) && count >= 0) drawCounts[key] = count;
      }
    }
    setText(storageStatus, 'Restored your rosters, settings, and draw counts.',
      '이전에 입력한 명단·설정·추첨 횟수를 불러왔습니다.');
  } catch {
    setText(storageStatus, 'Unable to restore saved data. Please re-enter the rosters.',
      '저장된 내용을 불러올 수 없습니다. 명단을 다시 입력해 주세요.');
  }
}

function randomIndex(range) {
  const buffer = new Uint32Array(1);
  // 나머지 연산으로 생기는 편향을 없애 각 인원의 확률을 동일하게 유지합니다.
  const limit = Math.floor(4294967296 / range) * range;
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % range;
}

function createResultImage({ titles, names, kind }, { count, date }, language) {
  const korean = language === 'ko';
  const time = formatTime(date, language);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  const font = getComputedStyle(document.body).fontFamily;
  context.font = `24px ${font}`;
  const rows = names.map(name => {
    const lines = [];
    let line = '';
    for (const character of name) {
      if (line && context.measureText(line + character).width > 640) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
    lines.push(line);
    return { lines, height: lines.length * 34 + 24 };
  });
  const height = 208 + rows.reduce((total, row) => total + row.height, 0) + (rows.length ? 40 : 64);
  canvas.width = 1600;
  canvas.height = height * 2;
  context.scale(2, 2);
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 800, height);
  const accent = kind === 'selected' ? '#16705b' : kind === 'reserve' ? '#84612d' : '#657585';
  context.fillStyle = accent;
  context.fillRect(0, 0, 800, 8);
  context.font = `700 16px ${font}`;
  context.fillText('Random BGB', 48, 40);
  context.font = `700 38px ${font}`;
  context.fillText(titles[korean ? 1 : 0], 48, 78);
  context.fillStyle = '#6d7c74';
  context.font = `18px ${font}`;
  context.fillText(korean ? `총 ${names.length}명 · 동일 명단 ${count}회 추첨` : `Total: ${names.length} · Draws for this roster: ${count}`, 48, 134);
  context.fillText(korean ? `추첨 일시: ${time}` : `Draw time: ${time}`, 48, 162);
  if (!rows.length) context.fillText(korean ? '해당 인원이 없습니다.' : 'No one in this group.', 48, 208);
  let y = 208;
  rows.forEach((row, index) => {
    context.fillStyle = kind === 'selected' ? '#f2f7f0' : kind === 'reserve' ? '#faf6ee' : '#f0f3f6';
    context.fillRect(48, y, 704, row.height - 8);
    context.fillStyle = accent;
    context.font = `18px ${font}`;
    context.fillText(String(index + 1).padStart(2, '0'), 62, y + 13);
    context.fillStyle = '#24362f';
    context.font = `24px ${font}`;
    row.lines.forEach((line, lineIndex) => context.fillText(line, 110, y + 10 + lineIndex * 34));
    y += row.height;
  });
  return canvas;
}

async function downloadResult(button, result, draw) {
  const language = siteLanguage.value;
  button.disabled = true;
  setText(downloadStatus, '', '');
  try {
    await document.fonts.ready;
    const canvas = createResultImage(result, draw, language);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export failed');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `random-bgb-${result.id}.png`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    if (button.isConnected) setText(downloadStatus, 'Unable to save the image. Please try again.',
      '이미지를 저장하지 못했습니다. 다시 시도해 주세요.');
  } finally {
    button.disabled = false;
  }
}

for (const [input] of countFields) {
  input.addEventListener('beforeinput', event => {
    if (event.data && /[^0-9]/.test(event.data)) event.preventDefault();
  });
  input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
}

form.addEventListener('input', event => {
  if (event.target.matches('.applicant-row input')) return;
  if (event.target.tagName !== 'TEXTAREA') clearResults();
  updateRosterSummary();
  saveState();
});

document.getElementById('reset-button').addEventListener('click', () => {
  if (!window.confirm(siteLanguage.value === 'ko'
    ? '이 탭의 신청 명단, 선발 설정, 결과와 추첨 기록을 모두 초기화할까요?'
    : 'Reset the rosters, settings, results, and draw history for this tab?')) return;
  form.reset();
  teams.forEach(({ input, list, applicants }, index) => {
    input.closest('details').open = index === 0;
    applicants.clear();
    list.replaceChildren();
  });
  Object.keys(drawCounts).forEach(key => { delete drawCounts[key]; });
  updateApplicants();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  clearResults();
  for (const [input, min, max] of countFields) {
    if (!input.checkValidity() || Number(input.value) < min || Number(input.value) > max) {
      const label = input === selectedCount ? 'player' : 'reserve';
      const koreanLabel = input === selectedCount ? '선발' : '예비';
      setText(message, `Enter a whole number from ${min} to ${max} for ${label} slots.`,
        `${koreanLabel} 인원은 ${min}~${max}명 사이의 정수로 입력해 주세요.`);
      input.focus();
      return;
    }
  }

  const rosters = getCheckedRosters();
  const bNames = new Set(rosters[1]);
  const duplicates = new Set(rosters[0].filter(name => bNames.has(name)));
  const eligible = rosters.map(names => names.filter(name => !duplicates.has(name)));
  const selected = Number(selectedCount.value);
  const reserve = Number(reserveCount.value);
  const required = selected + reserve;
  const shortTeam = eligible.findIndex(names => names.length < required);
  if (shortTeam !== -1) {
    const { input, id } = teams[shortTeam];
    const team = id.toUpperCase();
    const available = eligible[shortTeam].length;
    setText(message, `Not enough eligible applicants for Team ${team}: ${available} available, ${required} needed.`,
      `${team}팀 추첨 인원이 부족합니다. 중복 신청 제외 후 ${available}명이며, ${required}명이 필요합니다.`);
    input.closest('details').open = true;
    input.focus();
    return;
  }

  const rosterKey = getRosterKey(rosters);
  const count = Math.min((drawCounts[rosterKey] ?? 0) + 1, Number.MAX_SAFE_INTEGER);
  const date = new Date();
  const draw = { count, date };
  teams.forEach(({ id, random }, index) => {
    const names = eligible[index];
    if (random.checked) {
      for (let i = names.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [names[i], names[j]] = [names[j], names[i]];
      }
    }
    const container = document.getElementById(`team-${id}-results`);
    const team = id.toUpperCase();
    for (const [kind, group] of [
      ['selected', names.slice(0, selected)],
      ['reserve', names.slice(selected, required)],
      ['unselected', names.slice(required)]
    ]) {
      const [en, ko] = resultTitles[kind];
      if (random.checked) group.sort(compareNames);
      renderList(container, { id: `team-${id}-${kind}`, titles: [`Team ${team} ${en}`, `${team}팀 ${ko}`], kind, names: group }, draw);
    }
  });
  renderList(document.getElementById('duplicate-results'), {
    id: 'duplicates', titles: ['Duplicate Applicants', '중복 신청 탈락자 명단'], kind: 'unselected', names: [...duplicates].sort(compareNames)
  }, draw);
  drawCounts[rosterKey] = count;
  updateDrawCount(count);
  setText(drawTime, formatTime(date, 'en'), formatTime(date, 'ko'));
  drawTime.hidden = false;
  resultsEmpty.hidden = true;
  resultGroups.hidden = false;
  setText(resultStatus, 'Draw complete', 'A·B팀 추첨 완료');
  resultStatus.classList.add('is-complete');
  saveState();
});

restoreState();
for (const team of teams) {
  for (const name of team.applicants.keys()) appendApplicant(team, name);
  team.toggle.addEventListener('click', () => {
    const expanded = !team.list.classList.contains('is-expanded');
    setRosterExpanded(team, expanded);
    if (!expanded) team.toggle.scrollIntoView({ block: 'nearest' });
  });
  team.confirm.addEventListener('click', () => {
    team.applicants.clear();
    team.list.replaceChildren();
    for (const name of new Set(readNames(team.input))) {
      team.applicants.set(name, true);
      appendApplicant(team, name);
    }
    setRosterExpanded(team, false);
    updateApplicants();
  });
}
updateRosterSummary();
