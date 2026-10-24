// 시험공부 사이트 프론트엔드 (해시 라우팅 SPA)
const $app = document.getElementById('app');
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- 공통 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NO = '①②③④⑤';
const MODE_NAME = { variant: '변형 문제', original: '원본 문제' };
function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
}
function dday(iso) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(iso + 'T00:00:00') - t) / 86400000);
  if (diff > 0) return { text: `D-${diff}`, past: false };
  if (diff === 0) return { text: 'D-DAY', past: false };
  return { text: '지난 시험', past: true };
}
function toast(msg, ms = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
async function api(path, body) {
  const base = (window.EXAM_API || '').replace(/\/$/, '');
  const res = await fetch(base + '/api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({ error: '서버 응답을 읽을 수 없습니다.' }));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}
const KW = 'if|else|for|while|do|break|continue|return|new|public|private|protected|void|class|const|var|static|this|true|false|using|null';
const TY = 'int|float|bool|string|char|double|MonoBehaviour|Debug';
const TOK = new RegExp(`(\\/\\/.*$)|("(?:[^"\\\\]|\\\\.)*")|('(?:[^'\\\\]|\\\\.)*')|\\b(\\d+(?:\\.\\d+)?f?)\\b|\\b(${KW})\\b|\\b(${TY})\\b`, 'gm');
function highlight(code) {
  let out = '', last = 0, m;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(code))) {
    out += esc(code.slice(last, m.index));
    const cls = m[1] ? 'cm' : m[2] || m[3] ? 'str' : m[4] ? 'num' : m[5] ? 'kw' : 'type';
    out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
    last = TOK.lastIndex;
  }
  return out + esc(code.slice(last));
}
const codeBlock = (code) => (code ? `<pre class="code"><code>${highlight(code)}</code></pre>` : '');
function overlay(html) {
  const el = document.createElement('div');
  el.className = 'overlay'; el.innerHTML = `<div class="card" style="text-align:center;min-width:280px">${html}</div>`;
  document.body.appendChild(el);
  return () => el.remove();
}

// ---------- 테마 / 닉네임 ----------
const themeBtn = document.getElementById('theme-btn');
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme(LS.get('theme'));
themeBtn.onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark'; LS.set('theme', next); applyTheme(next);
};
const nickChip = document.getElementById('nick-chip');
const getNick = () => LS.get('nick');
function renderNickChip() {
  const n = getNick();
  nickChip.hidden = !n; nickChip.textContent = n ? `👤 ${n}` : '';
  nickChip.title = '닉네임 변경';
}
nickChip.onclick = () => { if (confirm('닉네임을 바꿀까요?')) { LS.del('nick'); renderNickChip(); location.hash = '#/'; route(); } };

// ---------- 라우터 ----------
let timerHandle = null;
window.addEventListener('hashchange', route);
async function route() {
  clearInterval(timerHandle); timerHandle = null;
  window.onkeydown = null; window.onbeforeunload = null;
  renderNickChip();
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg] = h.split('/');
  if (!getNick()) return viewEnter();
  try {
    if (!page) return await viewHome();
    if (page === 'exam') return await viewExam(decodeURIComponent(arg));
    if (page === 'take') return viewTake(decodeURIComponent(arg));
    if (page === 'result') return await viewResult(decodeURIComponent(arg));
    if (page === 'ranking') return await viewRanking(decodeURIComponent(arg));
    location.hash = '#/';
  } catch (e) {
    $app.innerHTML = `<div class="card empty">오류: ${esc(e.message)}<br><br><a class="btn" href="#/">처음으로</a></div>`;
  }
}

// ---------- 입장 ----------
function viewEnter() {
  $app.innerHTML = `
    <div class="enter">
      <h1>시험공부</h1>
      <p class="muted">닉네임을 정하고 들어가세요. 시험이 끝나면 점수와 시간이 이 이름으로 랭킹에 올라갑니다.</p>
      <form class="card stack" id="f">
        <div>
          <label class="lbl" for="nick">닉네임 <span class="hint">1~16자</span></label>
          <input class="input" id="nick" maxlength="16" autocomplete="nickname" placeholder="예: 츄킨" required>
        </div>
        <button class="btn primary big" style="width:100%">입장하기</button>
      </form>
    </div>`;
  const inp = document.getElementById('nick');
  inp.focus();
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const v = inp.value.replace(/[<>]/g, '').trim();
    if (!v) return toast('닉네임을 입력하세요.');
    LS.set('nick', v.slice(0, 16));
    route();
  };
}

// ---------- 시험 목록 ----------
let examsCache = null;
async function loadExams() { if (!examsCache) examsCache = (await api('exams')).exams; return examsCache; }
async function viewHome() {
  $app.innerHTML = '<div class="empty">불러오는 중…</div>';
  const exams = await loadExams();
  const active = LS.get('activeAttempt');
  const activeData = active ? LS.get('attempt:' + active) : null;
  // 다가오는 시험 먼저(날짜순), 지난 시험은 뒤로(최근순)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const up = exams.filter((e) => new Date(e.date + 'T00:00:00') >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = exams.filter((e) => new Date(e.date + 'T00:00:00') < today).sort((a, b) => b.date.localeCompare(a.date));
  const card = (e) => {
    const d = dday(e.date);
    return `<div class="card exam-card">
      <div class="date">${fmtDate(e.date)} <span class="dday ${d.past ? 'past' : ''}">${d.text}</span></div>
      <h3>${esc(e.title)}</h3>
      <div class="muted small">${esc(e.subject)} · ${e.questionCount}문항</div>
      <div class="tags">${e.sections.map((s) => `<span class="tag">${esc(s.title)} ${s.count}</span>`).join('')}</div>
      <div class="row" style="margin-top:6px">
        <a class="btn primary" href="#/exam/${encodeURIComponent(e.id)}">응시하기</a>
        <a class="btn" href="#/ranking/${encodeURIComponent(e.id)}">랭킹</a>
      </div>
    </div>`;
  };
  $app.innerHTML = `
    <div class="stack">
      <div><h1>시험 목록</h1><p class="muted" style="margin:0">${esc(getNick())}님, 공부할 시험을 고르세요.</p></div>
      ${activeData ? `<div class="card row"><div><b>진행 중인 시험이 있어요</b><div class="muted small">${esc(activeData.exam.title)} · ${MODE_NAME[activeData.mode]} · ${Object.keys(activeData.answers || {}).length}/${activeData.questions.length} 작성</div></div><div class="spacer"></div><a class="btn primary" href="#/take/${active}">이어서 풀기</a><button class="btn" id="drop">포기</button></div>` : ''}
      ${up.length ? `<h2>다가오는 시험</h2><div class="exam-grid">${up.map(card).join('')}</div>` : ''}
      ${past.length ? `<h2>지난 시험</h2><div class="exam-grid">${past.map(card).join('')}</div>` : ''}
      ${!exams.length ? '<div class="card empty">등록된 시험이 없습니다.</div>' : ''}
    </div>`;
  const drop = document.getElementById('drop');
  if (drop) drop.onclick = () => { if (confirm('진행 중인 시험을 포기할까요? (랭킹에 기록되지 않습니다)')) { LS.del('attempt:' + active); LS.del('activeAttempt'); route(); } };
}

// ---------- 시험 상세 / 시작 ----------
async function viewExam(id) {
  const exams = await loadExams();
  const e = exams.find((x) => x.id === id);
  if (!e) throw new Error('시험을 찾을 수 없습니다.');
  let mode = LS.get('lastMode', 'variant');
  const d = dday(e.date);
  $app.innerHTML = `
    <div class="stack" style="max-width:720px;margin:0 auto">
      <a href="#/" class="small">← 시험 목록</a>
      <div>
        <div class="muted small">${fmtDate(e.date)} · <span class="dday ${d.past ? 'past' : ''}">${d.text}</span></div>
        <h1>${esc(e.title)}</h1>
        <div class="muted">${esc(e.description)}</div>
      </div>
      <div class="card stack">
        <h2>출제 방식</h2>
        <div class="modes">
          <button class="mode" data-m="variant"><b>변형 문제 (자동 생성)</b><span class="muted small">원본과 같은 원리로 값·형태를 바꾼 새 문제. 매번 달라져요.</span></button>
          <button class="mode" data-m="original"><b>원본 문제</b><span class="muted small">평가문항 그대로 출제. 처음 연습할 때 추천.</span></button>
        </div>
        <h2 style="margin-top:8px">채점 규칙</h2>
        <ul class="rules">
          <li>총 ${e.questionCount}문항, 100점 만점 (문항당 동일 배점)</li>
          <li>모든 문항에 <b>정답</b>과 <b>원리(이유)</b>를 함께 적습니다.</li>
          <li>정답 + 원리가 맞으면 만점, <b>정답만 맞으면 절반</b>, 정답이 틀리면 0점</li>
          <li>원리는 제출 후 AI(GPT)가 판정합니다.</li>
          <li>제출하면 점수와 걸린 시간이 랭킹에 등록됩니다. 점수가 같으면 시간이 짧은 쪽이 위입니다.</li>
          <li>랭킹은 시험별·출제 방식별로 따로 집계됩니다.</li>
        </ul>
        <div class="row">
          <button class="btn primary big" id="go">시작하기</button>
          <a class="btn big" href="#/ranking/${encodeURIComponent(e.id)}">랭킹 보기</a>
        </div>
      </div>
    </div>`;
  const paint = () => document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('.mode').forEach((b) => (b.onclick = () => { mode = b.dataset.m; LS.set('lastMode', mode); paint(); }));
  paint();
  document.getElementById('go').onclick = async () => {
    const active = LS.get('activeAttempt');
    if (active && LS.get('attempt:' + active) && !confirm('진행 중인 다른 시험이 있습니다. 새로 시작할까요? (이전 시험은 포기됩니다)')) return;
    const btn = document.getElementById('go'); btn.disabled = true; btn.textContent = '문제 만드는 중…';
    try {
      const r = await api('start', { examId: e.id, nickname: getNick(), mode });
      if (active) LS.del('attempt:' + active);
      const data = { attemptId: r.attemptId, exam: r.exam, mode: r.mode, questions: r.questions, answers: {}, cur: 0, localStart: Date.now() };
      LS.set('attempt:' + r.attemptId, data); LS.set('activeAttempt', r.attemptId);
      location.hash = '#/take/' + r.attemptId;
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = '시작하기'; }
  };
}

// ---------- 응시 ----------
const KIND_LABEL = { full: '만점', half: '절반', wrong: '오답' };
const kindOf = (r) => (r.units === 2 ? 'full' : r.units === 1 ? 'half' : 'wrong');
function viewTake(id) {
  const st = LS.get('attempt:' + id);
  if (!st) { toast('진행 중인 시험이 없습니다.'); location.hash = '#/'; return; }
  st.checks = st.checks || {};
  const qs = st.questions;
  const save = () => LS.set('attempt:' + id, st);
  const ans = (q) => st.answers[q.id] || {};
  const hasAns = (q) => { const a = ans(q); return q.type === 'mc' ? a.answer !== undefined && a.answer !== null && a.answer !== '' : !!String(a.answer || '').trim(); };
  const hasPr = (q) => !!String(ans(q).principle || '').trim();
  const answeredCount = () => qs.filter(hasAns).length;
  const checkedList = () => Object.values(st.checks);
  let busy = false;

  $app.innerHTML = `
    <div class="take">
      <aside class="side card">
        <div class="muted small">${esc(st.exam.title)} · ${MODE_NAME[st.mode]}</div>
        <div class="timer" id="timer">00:00</div>
        <div class="row small muted" style="margin:4px 0 8px"><span id="cnt"></span><span class="spacer"></span><span id="pcnt"></span></div>
        <div class="progress"><i id="bar"></i></div>
        <div class="live-score" id="live"></div>
        <div id="grid"></div>
        <button class="btn primary" id="submit" style="width:100%;margin-top:16px">제출하기</button>
        <div class="legend small muted"><span><i class="lg done"></i>작성</span><span><i class="lg c-full"></i>만점</span><span><i class="lg c-half"></i>절반</span><span><i class="lg c-wrong"></i>오답</span></div>
      </aside>
      <section class="card" id="qbox"></section>
    </div>`;
  const tick = () => { const t = fmtTime(Date.now() - st.localStart); document.getElementById('timer').textContent = t; const m = document.getElementById('mtimer'); if (m) m.textContent = `⏱ ${t} · ${answeredCount()}/${qs.length}`; };
  tick(); timerHandle = setInterval(tick, 1000);
  window.onbeforeunload = (e) => { e.preventDefault(); return ''; };

  function paintSide() {
    const n = answeredCount(), cl = checkedList();
    document.getElementById('cnt').textContent = `답 ${n}/${qs.length}`;
    document.getElementById('pcnt').textContent = `채점 ${cl.length}/${qs.length}`;
    document.getElementById('bar').style.width = `${(n / qs.length) * 100}%`;
    const u = cl.reduce((s, r) => s + r.units, 0);
    document.getElementById('live').innerHTML = cl.length
      ? `채점한 문항 기준 <b>${Math.round((u / (cl.length * 2)) * 1000) / 10}점</b> <span class="muted">(${cl.filter((r) => r.units === 2).length}만점 · ${cl.filter((r) => r.units === 1).length}절반 · ${cl.filter((r) => r.units === 0).length}오답)</span>`
      : '<span class="muted">문제마다 “채점하기”로 바로 확인할 수 있어요</span>';
    let html = '', sec = null;
    qs.forEach((q, i) => {
      if (q.sectionId !== sec) { if (sec) html += '</div>'; sec = q.sectionId; html += `<div class="qgrid-sec">${esc(q.sectionTitle)}</div><div class="qgrid">`; }
      const c = st.checks[q.id];
      const cls = c ? 'c-' + kindOf(c) : hasAns(q) ? (hasPr(q) ? 'done' : 'half') : '';
      html += `<button class="qn ${cls} ${i === st.cur ? 'cur' : ''}" data-i="${i}" title="${esc(q.id)}">${q.no}</button>`;
    });
    document.getElementById('grid').innerHTML = html + '</div>';
    document.querySelectorAll('.qn').forEach((b) => (b.onclick = () => go(+b.dataset.i)));
  }
  function feedbackHtml(r) {
    const k = kindOf(r);
    return `<div class="fb ${k}">
      <div class="fb-head"><span class="badge ${k}">${KIND_LABEL[k]}</span><b>${r.correct ? '정답이에요' : '틀렸어요'}</b>${r.correct && !r.principleOk ? '<span class="muted small">원리 설명이 부족해서 절반</span>' : ''}</div>
      <div class="kv">
        <div class="k">정답</div><div class="v ${qs[st.cur].type === 'text' ? 'mono' : ''}" style="color:var(--good);font-weight:700">${esc(r.answerDisplay)}</div>
        <div class="k">${r.correct ? '피드백' : '틀린 이유'}</div><div class="v">${esc(r.feedback || '')}</div>
        <div class="k">핵심 원리</div><div class="v muted">${esc(r.principle || '')}</div>
      </div>
    </div>`;
  }
  function paintQ() {
    const q = qs[st.cur], a = ans(q), c = st.checks[q.id];
    const lock = !!c;
    const mineIdx = a.answer !== undefined && a.answer !== null && a.answer !== '' ? Number(a.answer) : -1;
    const ansIdx = c && q.type === 'mc' ? NO.indexOf(String(c.answerDisplay)[0]) : -1;
    const box = document.getElementById('qbox');
    box.innerHTML = `
      <div class="qhead"><span class="qid">${q.no}. ${esc(q.id)}</span><span class="qsec">${esc(q.sectionTitle)}</span><span class="mtimer" id="mtimer"></span></div>
      ${q.sectionNote ? `<div class="note">${esc(q.sectionNote)}</div>` : ''}
      <div class="qprompt">${esc(q.prompt)}</div>
      ${codeBlock(q.code)}
      ${q.type === 'mc'
        ? `<div class="choices">${q.choices.map((ch, i) => `<button class="choice ${mineIdx === i ? 'on' : ''} ${lock && i === ansIdx ? 'is-ans' : ''} ${lock && mineIdx === i && i !== ansIdx ? 'is-wrong' : ''}" data-c="${i}" ${lock ? 'disabled' : ''}><span class="no">${i + 1}</span><span class="txt ${/[;=(){}\[\]]/.test(ch) ? 'mono' : ''}">${esc(ch)}</span></button>`).join('')}</div>`
        : `<div style="margin-bottom:16px"><label class="lbl" for="ta">답 <span class="hint">출력 순서대로 한 줄에 하나씩 (컴파일 오류면 "컴파일 오류")</span></label><textarea class="textarea mono" id="ta" rows="4" placeholder="예)\n보통\n75" ${lock ? 'readonly' : ''}>${esc(a.answer || '')}</textarea></div>`}
      <div>
        <label class="lbl" for="pr">원리 / 이유 <span class="hint">정답 + 원리가 맞으면 만점, 비워두면 정답이어도 절반</span></label>
        <textarea class="textarea" id="pr" rows="3" placeholder="왜 이 답이 나오는지 핵심 원리를 적으세요." ${lock ? 'readonly' : ''}>${esc(a.principle || '')}</textarea>
      </div>
      <div id="fbbox">${c ? feedbackHtml(c) : ''}</div>
      <div class="qnav">
        <button class="btn" id="prev" ${st.cur === 0 ? 'disabled' : ''}>← 이전</button>
        <span class="spacer"></span>
        ${lock ? '' : '<button class="btn check" id="chk">채점하기</button>'}
        ${st.cur < qs.length - 1 ? '<button class="btn primary" id="next">다음 →</button>' : '<button class="btn primary" id="last">제출하기</button>'}
      </div>
      ${lock ? '' : '<div class="muted small" style="margin-top:8px;text-align:right">채점하면 이 문항의 답은 더 이상 바꿀 수 없어요</div>'}`;
    const set = (k, v) => { st.answers[q.id] = { ...ans(q), [k]: v }; save(); paintSide(); };
    if (!lock) {
      box.querySelectorAll('.choice').forEach((b) => (b.onclick = () => { set('answer', +b.dataset.c); box.querySelectorAll('.choice').forEach((x) => x.classList.toggle('on', x === b)); }));
      const ta = document.getElementById('ta'); if (ta) ta.oninput = () => set('answer', ta.value);
      document.getElementById('pr').oninput = () => set('principle', document.getElementById('pr').value);
      document.getElementById('chk').onclick = () => doCheck(q);
    }
    document.getElementById('prev').onclick = () => go(st.cur - 1);
    const nx = document.getElementById('next'); if (nx) nx.onclick = () => go(st.cur + 1);
    const ls = document.getElementById('last'); if (ls) ls.onclick = submit;
  }
  async function doCheck(q) {
    if (busy) return;
    if (!hasAns(q)) return toast('답을 먼저 입력하세요.');
    if (!hasPr(q) && !confirm('원리를 비워두면 정답이어도 절반만 받아요. 그대로 채점할까요?')) return;
    busy = true;
    const btn = document.getElementById('chk'); btn.disabled = true; btn.innerHTML = '<span class="mini-spin"></span> 채점 중…';
    try {
      const a = ans(q);
      const r = await api('check', { attemptId: id, qid: q.id, answer: a.answer, principle: a.principle || '' });
      st.checks[q.id] = r; save();
      if (qs[st.cur].id === q.id) paintQ();
      paintSide();
    } catch (err) { toast(err.message, 3500); btn.disabled = false; btn.textContent = '채점하기'; } finally { busy = false; }
  }
  function go(i) {
    if (i < 0 || i >= qs.length) return;
    st.cur = i; save(); paintQ(); paintSide(); tick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.onkeydown = (e) => {
    if (/TEXTAREA|INPUT/.test(document.activeElement?.tagName)) return;
    const q = qs[st.cur];
    if (q.type === 'mc' && /^[1-4]$/.test(e.key)) document.querySelector(`.choice[data-c="${+e.key - 1}"]:not([disabled])`)?.click();
    if (e.key === 'ArrowRight') go(st.cur + 1);
    if (e.key === 'ArrowLeft') go(st.cur - 1);
    if (e.key === 'Enter' && !st.checks[q.id]) doCheck(q);
  };
  async function submit() {
    const noAns = qs.filter((q) => !hasAns(q)).length;
    const unchecked = qs.filter((q) => hasAns(q) && !st.checks[q.id]).length;
    const warn = [noAns ? `답을 안 쓴 문항 ${noAns}개` : '', unchecked ? `아직 채점 안 한 문항 ${unchecked}개(제출 때 한꺼번에 채점)` : ''].filter(Boolean).join(', ');
    if (!confirm(`${warn ? warn + '가 있습니다.\n' : ''}제출할까요? 제출 후에는 수정할 수 없습니다.`)) return;
    const close = overlay(`<div class="spinner"></div><b>제출 중…</b><div class="muted small">${unchecked ? 'AI가 남은 문항의 원리를 확인하고 있어요 (10~40초)' : '점수를 계산하고 있어요'}</div>`);
    try {
      const answers = {};
      for (const q of qs) { const a = ans(q); answers[q.id] = { answer: a.answer ?? null, principle: a.principle || '' }; }
      await api('submit', { attemptId: id, answers });
      LS.del('attempt:' + id); LS.del('activeAttempt');
      window.onbeforeunload = null;
      location.hash = '#/result/' + id;
    } catch (err) { toast(err.message, 4000); } finally { close(); }
  }
  document.getElementById('submit').onclick = submit;
  paintQ(); paintSide();
}

// ---------- 결과 ----------
async function viewResult(id) {
  $app.innerHTML = '<div class="empty">결과 불러오는 중…</div>';
  let r = await api('result?id=' + encodeURIComponent(id));
  for (let i = 0; r.status !== 'done' && i < 20; i++) { await new Promise((ok) => setTimeout(ok, 2000)); r = await api('result?id=' + encodeURIComponent(id)); }
  if (r.status !== 'done') throw new Error('아직 채점 중입니다. 잠시 후 새로고침하세요.');
  const qs = r.questions;
  const kind = (q) => (q.result?.units === 2 ? 'full' : q.result?.units === 1 ? 'half' : 'wrong');
  const cnt = { full: 0, half: 0, wrong: 0 }; qs.forEach((q) => cnt[kind(q)]++);
  let filter = 'all';
  $app.innerHTML = `
    <div class="stack">
      <a href="#/" class="small">← 시험 목록</a>
      <div><div class="muted small">${esc(r.examTitle)} · ${MODE_NAME[r.mode]} · ${esc(r.nickname)}</div><h1>시험 결과</h1></div>
      <div class="card stack">
        <div class="score-hero">
          <div class="stat"><div class="k">점수</div><div class="v">${r.score}<span class="small muted"> / 100</span></div></div>
          <div class="stat"><div class="k">걸린 시간</div><div class="v mono">${fmtTime(r.elapsedMs)}</div></div>
          <div class="stat"><div class="k">현재 순위</div><div class="v">${r.rank ?? '-'}<span class="small muted">위</span></div></div>
          <div class="stat"><div class="k">만점 / 절반 / 오답</div><div class="v"><span style="color:var(--good)">${cnt.full}</span> <span class="muted small">/</span> <span style="color:var(--half)">${cnt.half}</span> <span class="muted small">/</span> <span style="color:var(--bad)">${cnt.wrong}</span></div></div>
        </div>
        <div class="row"><a class="btn primary" href="#/ranking/${encodeURIComponent(r.examId)}?mode=${r.mode}">랭킹 보기</a><a class="btn" href="#/exam/${encodeURIComponent(r.examId)}">다시 풀기</a></div>
      </div>
      <div class="row"><h2 style="margin:0">문항별 채점</h2><span class="spacer"></span>
        <div class="filters">${[['all', '전체'], ['wrong', '오답'], ['half', '절반'], ['full', '만점']].map(([k, t]) => `<button class="pill" data-f="${k}">${t}</button>`).join('')}</div></div>
      <div id="list" class="stack"></div>
    </div>`;
  const label = { full: '만점', half: '절반', wrong: '오답' };
  function paint() {
    document.querySelectorAll('.pill').forEach((p) => p.classList.toggle('on', p.dataset.f === filter));
    const list = qs.filter((q) => filter === 'all' || kind(q) === filter);
    document.getElementById('list').innerHTML = list.map((q) => {
      const k = kind(q), res = q.result || {};
      const mine = q.type === 'mc'
        ? `<div>${q.choices.map((c, i) => `<div class="choice-mini ${i === res.given ? 'mine' : ''} ${q.answerDisplay.startsWith(NO[i]) ? 'ans' : ''}">${NO[i]} ${esc(c)}${i === res.given ? ' ← 내 답' : ''}</div>`).join('')}</div>`
        : `<div class="v mono">${esc(res.given || '(미작성)')}</div>`;
      return `<div class="card review ${k}">
        <div class="qhead"><span class="qid">${q.no}. ${esc(q.id)}</span><span class="badge ${k}">${label[k]}</span><span class="qsec">${esc(q.sectionTitle)}</span></div>
        <div class="qprompt" style="font-size:16px">${esc(q.prompt)}</div>
        ${codeBlock(q.code)}
        <div class="kv">
          <div class="k">${q.type === 'mc' ? '보기' : '내 답'}</div>${mine}
          <div class="k">정답</div><div class="v ${q.type === 'text' ? 'mono' : ''}" style="color:var(--good);font-weight:700">${esc(q.answerDisplay)}</div>
          <div class="k">내 원리</div><div class="v">${esc(res.principle || '(미작성)')}</div>
          ${res.feedback ? `<div class="k">판정</div><div class="v">${res.principleOk ? '✅' : '⚠️'} ${esc(res.feedback)}</div>` : ''}
          <div class="k">핵심 원리</div><div class="v muted">${esc(q.principle)}</div>
        </div>
      </div>`;
    }).join('') || '<div class="card empty">해당 문항이 없습니다.</div>';
  }
  document.querySelectorAll('.pill').forEach((p) => (p.onclick = () => { filter = p.dataset.f; paint(); }));
  paint();
}

// ---------- 랭킹 ----------
async function viewRanking(arg) {
  const [id, qsPart] = arg.split('?');
  let mode = new URLSearchParams(qsPart || '').get('mode') || 'variant';
  const exams = await loadExams();
  const e = exams.find((x) => x.id === id);
  if (!e) throw new Error('시험을 찾을 수 없습니다.');
  $app.innerHTML = `
    <div class="stack" style="max-width:820px;margin:0 auto">
      <a href="#/" class="small">← 시험 목록</a>
      <div><div class="muted small">${fmtDate(e.date)}</div><h1>${esc(e.title)} 랭킹</h1><div class="muted small">닉네임별 최고 기록 · 점수 높은 순, 같으면 시간 짧은 순</div></div>
      <div class="row"><div class="tabs">${['variant', 'original'].map((m) => `<button class="tab" data-m="${m}">${MODE_NAME[m]}</button>`).join('')}</div><span class="spacer"></span><a class="btn primary" href="#/exam/${encodeURIComponent(e.id)}">응시하기</a></div>
      <div class="card" style="padding:6px 6px;overflow-x:auto" id="tbl"><div class="empty">불러오는 중…</div></div>
    </div>`;
  async function load() {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
    const r = await api(`ranking?examId=${encodeURIComponent(e.id)}&mode=${mode}`);
    const me = getNick();
    document.getElementById('tbl').innerHTML = r.ranking.length ? `
      <table class="rank"><thead><tr><th>순위</th><th>닉네임</th><th>점수</th><th>시간</th><th>응시</th><th>기록일</th></tr></thead><tbody>
      ${r.ranking.map((x) => `<tr class="${x.nickname === me ? 'me' : ''}"><td><span class="medal ${x.rank <= 3 ? 'g' + x.rank : ''}">${x.rank}</span></td><td><b>${esc(x.nickname)}</b></td><td><b>${x.score}</b></td><td class="mono">${fmtTime(x.elapsed_ms)}</td><td class="muted">${x.tries}회</td><td class="muted small">${new Date(x.finished_at).toLocaleDateString('ko-KR')}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">아직 기록이 없습니다. 첫 번째 기록을 남겨보세요!</div>';
  }
  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { mode = t.dataset.m; history.replaceState(null, '', `#/ranking/${encodeURIComponent(e.id)}?mode=${mode}`); load(); }));
  await load();
}

route();
