/* 관리자 화면: 로그인 → 답변 잠금 켜기/끄기, 제출 현황 */
(function () {
  const view = document.getElementById('view');
  const modeEl = document.getElementById('mode');
  const REFRESH_MS = 10000;
  let refreshTimer = null;
  let busy = false;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const timeText = iso => {
    if (!iso) return '아직 없음';
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  modeEl.textContent = API.isConnected() ? '시트 연결됨' : '데모 모드';
  modeEl.classList.toggle('on', API.isConnected());

  function stopRefresh() { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; } }

  /* ---------- 시트 미연결 ---------- */
  function renderNotConnected() {
    view.innerHTML = '<section class="card"><h2>구글 시트가 연결되지 않았어요</h2>' +
      '<p class="sub">관리자 기능은 시트와 연결된 뒤에 쓸 수 있어요. <code>js/config.js</code>의 <code>API_URL</code>에 Apps Script 웹 앱 주소를 넣어 주세요.</p>' +
      '<a class="btn ghost" href="index.html">메인으로</a></section>';
  }

  /* ---------- 로그인 ---------- */
  function renderLogin(message) {
    stopRefresh();
    view.innerHTML =
      '<section class="card"><h2>관리자 로그인</h2>' +
      '<p class="sub">구글 시트 \'설정\' 탭에 적어 둔 관리자 비밀번호를 입력하세요. 이 기기에서는 30일 동안 다시 묻지 않아요.</p>' +
      '<form id="login" autocomplete="off">' +
        '<label class="sr-only" for="pw">비밀번호</label>' +
        '<input class="field" id="pw" type="password" inputmode="text" autocomplete="current-password" placeholder="비밀번호" required>' +
        '<button class="btn" id="login-btn" type="submit">로그인</button>' +
        '<p class="status' + (message ? ' err' : '') + '" id="login-status">' + esc(message || '') + '</p>' +
      '</form></section>';
    const form = document.getElementById('login');
    const pw = document.getElementById('pw');
    const btn = document.getElementById('login-btn');
    const st = document.getElementById('login-status');
    pw.focus();
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!pw.value) return;
      btn.disabled = true; btn.textContent = '확인 중…';
      st.className = 'status'; st.textContent = '';
      try {
        await API.admin.login(pw.value);
        loadDashboard();
      } catch (e) {
        btn.disabled = false; btn.textContent = '로그인';
        st.className = 'status err';
        st.textContent = e.code ? e.message : '연결에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
      }
    });
  }

  /* ---------- 대시보드 ---------- */
  async function loadDashboard(silent) {
    stopRefresh();
    if (!silent) view.innerHTML = '<p class="loading">불러오는 중…</p>';
    try {
      const data = await API.admin.stats();
      renderDashboard(data.locked, data.stats);
    } catch (e) {
      if (e.code === 'auth') { API.store.set('admin-token', null); renderLogin('로그인이 만료됐어요. 다시 로그인해 주세요.'); return; }
      if (!silent) {
        view.innerHTML = '<section class="card"><h2>불러오지 못했어요</h2><p class="sub">' + esc(e.message || '네트워크를 확인해 주세요.') + '</p>' +
          '<button class="btn" id="again" type="button">다시 시도</button></section>';
        document.getElementById('again').onclick = () => loadDashboard();
        return;
      }
    }
    refreshTimer = setTimeout(() => { if (!busy) loadDashboard(true); else refreshTimer = setTimeout(() => loadDashboard(true), REFRESH_MS); }, REFRESH_MS);
  }

  function renderDashboard(locked, st) {
    st = st || { scenarios: [] };
    const rows = (st.scenarios || []).map(s =>
      '<tr><td>' + esc(s.title) + '</td><td>' + num(s.total) + '</td><td class="pos">' + num(s.positive) + '</td>' +
      '<td class="neg">' + num(s.negative) + '</td><td>' + num(s.pending) + '</td></tr>').join('');

    view.innerHTML =
      '<section class="card">' +
        '<h2>답변 잠금</h2>' +
        '<div class="lock-state' + (locked ? ' is-locked' : '') + '"><span class="light"></span><strong>' + (locked ? '답변 마감됨' : '답변 받는 중') + '</strong></div>' +
        '<p class="sub">' + (locked
          ? '신입직원은 지금 새 답변을 제출하거나 다시 답할 수 없어요. 상황과 이미 낸 답, AI 반응은 계속 볼 수 있어요.'
          : '신입직원이 답변을 자유롭게 제출할 수 있어요. 마감하면 새 답변 제출과 다시 답하기가 막혀요.') + '</p>' +
        '<button class="btn' + (locked ? '' : ' danger') + '" id="toggle" type="button">' + (locked ? '답변 다시 받기' : '답변 마감하기') + '</button>' +
        '<p class="status" id="lock-status"></p>' +
      '</section>' +
      '<section class="card">' +
        '<h2>제출 현황</h2>' +
        '<p class="sub">10초마다 자동으로 새로 고쳐요.</p>' +
        '<div class="tiles">' +
          '<div class="tile"><span>전체 답변</span><b>' + num(st.total) + '</b></div>' +
          '<div class="tile"><span>참여자</span><b>' + num(st.participants) + '</b></div>' +
          '<div class="tile wait"><span>AI 반응 대기</span><b>' + num(st.pending) + '</b></div>' +
        '</div>' +
        '<table class="by-scene"><thead><tr><th>상황</th><th>답변</th><th>긍정</th><th>부정</th><th>대기</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5">아직 상황이 없어요</td></tr>') + '</tbody></table>' +
        '<div class="meta"><span>마지막 제출 · ' + esc(timeText(st.lastAt)) + '</span>' +
          '<button class="link-btn" id="refresh" type="button">지금 새로고침</button></div>' +
      '</section>' +
      '<p style="text-align:center"><button class="link-btn" id="logout" type="button">로그아웃</button></p>';

    document.getElementById('refresh').onclick = () => loadDashboard(true);
    document.getElementById('logout').onclick = async () => { stopRefresh(); await API.admin.logout(); renderLogin(); };
    document.getElementById('toggle').onclick = async () => {
      const next = !locked;
      if (next && !confirm('답변을 마감할까요?\n신입직원은 더 이상 답변을 제출할 수 없게 됩니다.')) return;
      const btn = document.getElementById('toggle');
      const ls = document.getElementById('lock-status');
      busy = true; btn.disabled = true; btn.textContent = '바꾸는 중…';
      try {
        await API.admin.setLocked(next);
        busy = false;
        loadDashboard(true);
      } catch (e) {
        busy = false;
        if (e.code === 'auth') { API.store.set('admin-token', null); renderLogin('로그인이 만료됐어요. 다시 로그인해 주세요.'); return; }
        btn.disabled = false; btn.textContent = next ? '답변 마감하기' : '답변 다시 받기';
        ls.className = 'status err'; ls.textContent = '바꾸지 못했어요. 다시 눌러 주세요.';
      }
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && API.admin.token() && document.getElementById('toggle')) loadDashboard(true);
  });

  if (!API.isConnected()) renderNotConnected();
  else if (API.admin.token()) loadDashboard();
  else renderLogin();
})();
