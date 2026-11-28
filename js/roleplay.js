/* 슬기로운 신입생활 : AI 상황극 — 휴대폰 화면 */
(function () {
  const cfg = window.APP_CONFIG || {};
  const view = document.getElementById('view');
  const titleEl = document.getElementById('title');
  const backEl = document.getElementById('back');
  const modeEl = document.getElementById('mode');
  const MAX_LEN = 500;
  const MIN_LEN = 5;
  const ACCENT = { customer: '#efbf87', manager: '#a9c8ff', colleague: '#a9dcbb' };

  let scenarios = [];
  let locked = false;     // 관리자가 답변을 마감했는지
  let current = null;     // 지금 보고 있는 상황
  let pollTimer = null;
  let pollGen = 0;
  let pollStarted = 0;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const art = (id, key) => 'assets/mobile/' + (ACCENT[id] ? id : 'customer') + '/' + key + (key === 'background' ? '.webp' : '.gif');
  const rookie = key => 'assets/mobile/rookie/' + key + '.gif';
  const pad = n => String(n).padStart(2, '0');

  const subs = () => API.store.get('subs', {});
  const getSub = id => subs()[id] || null;
  function saveSub(id, data) {
    const all = subs();
    if (data) all[id] = data; else delete all[id];
    API.store.set('subs', all);
  }

  function stopPoll() { pollGen++; if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  const lockNotice = () =>
    '<div class="lock-banner" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' +
    '<div><b>답변이 마감됐어요</b><span>지금은 새 답변을 제출할 수 없어요. 낸 답과 AI 반응은 계속 볼 수 있어요.</span></div></div>';

  // 잠금 상태가 바뀌면 현재 화면에 반영
  document.addEventListener("adminlock", e => { if (e.detail && e.detail.kind === "roleplay") setLocked(e.detail.locked); });
  function setLocked(v) {
    if (v == null || v === locked) return;
    locked = v;
    if (!current) { renderList(); return; }
    const sub = getSub(current.id);
    stopPoll();
    if (sub) showSubmitted(current, sub); else showEditor(current);
  }

  /* ---------- 목록 ---------- */
  function renderList() {
    stopPoll();
    current = null;
    titleEl.textContent = '슬기로운 신입생활 : AI 상황극';
    backEl.href = 'index.html';
    view.className = '';
    const items = scenarios.map((s, i) => {
      const sub = getSub(s.id);
      let state = '<span class="scene-state">아직 답하지 않았어요</span>';
      if (sub && sub.result) state = '<span class="scene-state feedback">AI 반응 도착 · 확인하기</span>';
      else if (sub) state = '<span class="scene-state done">✓ 답변 제출 완료</span>';
      return '<li><a class="scene-card" href="#' + encodeURIComponent(s.id) + '">' +
        '<div class="scene-thumb"><img class="bg" src="' + art(s.id, 'background') + '" alt="" loading="lazy">' +
        '<img class="who" src="' + art(s.id, 'idle') + '" width="320" height="384" alt="" loading="lazy"></div>' +
        '<div class="scene-info"><span class="scene-num">상황 ' + pad(i + 1) + '</span>' +
        '<h3>' + esc(s.title) + '</h3><q>' + esc(s.quote) + '</q>' + state + '</div></a></li>';
    }).join('');
    view.innerHTML =
      '<section class="intro"><h2>어떤 상황부터 해볼까요?</h2>' +
      '<p>상황을 하나 골라 내 답을 적어 주세요. 순서는 자유예요. AI가 상대역이 되어 내 답에 반응합니다.</p>' +
      (locked ? lockNotice() : '') + '</section>' +
      '<ul class="scene-list">' + items + '</ul>' +
      '<p class="anon" style="padding-bottom:24px">이름 없이 익명으로 참여합니다 · ' + esc(API.participantId()) + '</p>';
  }

  /* ---------- 플레이 ---------- */
  function renderPlay(s) {
    stopPoll();
    current = s;
    const idx = scenarios.indexOf(s);
    const sub = getSub(s.id);
    titleEl.textContent = pad(idx + 1) + ' · ' + s.title;
    backEl.href = '#';
    view.className = '';
    view.style.setProperty('--accent', ACCENT[s.id] || 'var(--tangerine)');

    view.innerHTML =
      '<section class="stage" aria-label="' + esc(s.scene) + '">' +
        '<img class="bg" src="' + art(s.id, 'background') + '" alt="">' +
        '<img class="actor" id="actor" src="' + art(s.id, 'idle') + '" width="320" height="384" alt="' + esc(s.role) + '">' +
        '<div class="bubble" id="bubble"></div>' +
        '<span class="place">' + esc(s.scene) + '</span>' +
        '<div class="me"><img id="me" src="' + rookie('idle') + '" width="320" height="384" alt="나(신입직원)"><b>나</b></div>' +
      '</section>' +
      '<section class="panel">' +
        '<p class="situation"><b>상황</b>' + esc(s.situation) + '</p>' +
        '<p class="question"><span>질문</span>' + esc(s.question) + '</p>' +
        '<div id="lock-slot"></div>' +
        '<div class="answer-box">' +
          '<label class="sr-only" for="answer">내 답변</label>' +
          '<textarea id="answer" maxlength="' + MAX_LEN + '" placeholder="' + esc(s.role) + '에게 실제로 말하듯 적어 주세요."></textarea>' +
          '<span class="counter" id="counter">0 / ' + MAX_LEN + '</span>' +
        '</div>' +
        '<div id="actions"></div>' +
        '<p class="status" id="status" role="status"></p>' +
        '<p class="anon">익명 참여 · ' + esc(API.participantId()) + '</p>' +
      '</section>';

    const ta = document.getElementById('answer');
    const counter = document.getElementById('counter');
    const me = document.getElementById('me');
    let typing = false;

    ta.addEventListener('input', () => {
      counter.textContent = ta.value.length + ' / ' + MAX_LEN;
      const now = ta.value.trim().length > 0;
      if (now !== typing) { typing = now; me.src = rookie(now ? 'typing' : 'idle'); }
      try { sessionStorage.setItem('sgr-draft-' + s.id, ta.value); } catch (e) {}
    });

    setBubble(s, null);

    if (sub) {
      showSubmitted(s, sub);
    } else {
      let draft = '';
      try { draft = sessionStorage.getItem('sgr-draft-' + s.id) || ''; } catch (e) {}
      ta.value = draft;
      ta.dispatchEvent(new Event('input'));
      showEditor(s);
    }
    window.scrollTo(0, 0);
    // 들어올 때마다 마감 여부를 다시 확인
    API.getLocked().then(v => { if (current === s) setLocked(v); });
  }

  function setBubble(s, result) {
    const b = document.getElementById('bubble');
    const actor = document.getElementById('actor');
    if (!b) return;
    if (result && (result.reaction === 'positive' || result.reaction === 'negative')) {
      const label = result.reaction === 'positive' ? '긍정 반응' : '보완 필요';
      b.innerHTML = '<span class="who"><i></i>' + esc(s.role) + '<em class="react ' + result.reaction + '">' + label + '</em></span>' +
        esc(result.line || (result.reaction === 'positive' ? '좋아요, 그렇게 해 주세요.' : '음… 조금 더 구체적으로 말해 줄 수 있을까요?'));
      actor.src = art(s.id, result.reaction);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    } else {
      b.innerHTML = '<span class="who"><i></i>' + esc(s.role) + '</span>' + esc(s.line);
      actor.src = art(s.id, 'idle');
    }
  }

  function nextHref(s) {
    const i = scenarios.indexOf(s);
    return i < scenarios.length - 1 ? '#' + encodeURIComponent(scenarios[i + 1].id) : '#';
  }

  function showEditor(s) {
    const ta = document.getElementById('answer');
    const actions = document.getElementById('actions');
    const status = document.getElementById('status');
    document.getElementById('lock-slot').innerHTML = locked ? lockNotice() : '';
    ta.readOnly = locked;
    status.className = 'status';
    status.textContent = '';
    if (locked) {
      actions.innerHTML = '<div class="btn-row"><a class="btn ghost" href="#">목록으로</a>' +
        '<button class="btn" type="button" disabled>제출 마감</button></div>';
      return;
    }
    actions.innerHTML = '<button class="btn" id="submit" type="button">답변 제출하기</button>';
    const btn = document.getElementById('submit');

    btn.addEventListener('click', async () => {
      const answer = ta.value.trim();
      if (answer.length < MIN_LEN) {
        status.className = 'status err';
        status.textContent = '조금만 더 구체적으로 적어 주세요. (' + MIN_LEN + '자 이상)';
        ta.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = '제출 중…';
      status.className = 'status';
      status.textContent = '';
      try {
        const res = await API.submitAnswer(s, answer);
        const sub = { id: res.id, answer, at: Date.now(), demo: res.demo, result: null };
        saveSub(s.id, sub);
        try { sessionStorage.removeItem('sgr-draft-' + s.id); } catch (e) {}
        showSubmitted(s, sub);
      } catch (e) {
        if (e.code === 'locked') { setLocked(true); return; }
        btn.disabled = false;
        btn.textContent = '다시 제출하기';
        status.className = 'status err';
        status.textContent = '제출하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.';
        console.error(e);
      }
    });
  }

  function showSubmitted(s, sub) {
    const ta = document.getElementById('answer');
    const actions = document.getElementById('actions');
    const status = document.getElementById('status');
    const me = document.getElementById('me');
    ta.value = sub.answer;
    ta.readOnly = true;
    document.getElementById('counter').textContent = '제출됨';
    me.src = rookie('submitted');
    document.getElementById('lock-slot').innerHTML = locked ? lockNotice() : '';

    const isLast = scenarios.indexOf(s) === scenarios.length - 1;
    actions.innerHTML = '<div class="btn-row">' +
      (locked
        ? '<button class="btn ghost" type="button" disabled>다시 답하기 마감</button>'
        : '<button class="btn ghost" id="retry" type="button">다시 답하기</button>') +
      '<a class="btn" href="' + nextHref(s) + '">' + (isLast ? '목록으로' : '다음 상황 →') + '</a></div>';

    if (!locked) document.getElementById('retry').addEventListener('click', () => {
      stopPoll();
      saveSub(s.id, null);
      try { sessionStorage.setItem('sgr-draft-' + s.id, sub.answer); } catch (e) {}
      renderPlay(s);
      const t = document.getElementById('answer');
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });

    if (sub.result) {
      setBubble(s, sub.result);
      status.className = 'status';
      status.textContent = sub.result.reaction === 'positive'
        ? '잘 대응했어요! 다른 상황도 도전해 보세요.'
        : '상대의 반응을 보고 다시 답해 볼 수 있어요.';
      return;
    }

    status.className = 'status';
    if (sub.demo) {
      status.textContent = '데모 모드: 답변이 이 휴대폰에만 저장됐어요. (구글 시트 미연결)';
      return;
    }
    // AI 채점 결과는 진행자 화면(앞 화면)에서 함께 봅니다.
    status.textContent = '제출 완료! AI 점수와 칭찬 도장은 앞 화면에서 함께 확인해요.';
  }

  async function poll(s, sub, gen) {
    if (gen !== pollGen) return;
    const interval = cfg.POLL_INTERVAL_MS || 5000;
    const maxMs = (cfg.POLL_MAX_MINUTES || 30) * 60000;
    if (Date.now() - pollStarted > maxMs) return;
    try {
      const result = await API.fetchResult(sub.id);
      const latest = getSub(s.id);
      if (gen !== pollGen) return;
      if (!latest || latest.id !== sub.id) return; // 그새 다시 답함
      if (result && result.reaction) {
        latest.result = result;
        saveSub(s.id, latest);
        if (location.hash.slice(1) === s.id) {
          showSubmitted(s, latest);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
    } catch (e) { /* 일시적 오류는 무시하고 계속 확인 */ }
    if (gen !== pollGen) return;
    pollTimer = setTimeout(() => poll(s, sub, gen), document.hidden ? interval * 3 : interval);
  }

  /* ---------- 라우팅 ---------- */
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const s = scenarios.find(x => x.id === id);
    if (s) renderPlay(s); else renderList();
  }

  async function init() {
    modeEl.textContent = API.isConnected() ? '시트 연결됨' : '데모 모드';
    modeEl.classList.toggle('on', API.isConnected());
    const loaded = await API.loadScenarios();
    locked = loaded.locked;
    scenarios = loaded.scenarios.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
