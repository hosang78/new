/* 관리자 화면: 한 번 로그인 → AI 상황극(답변 잠금·현황) + 내가 그리는 수협의 미래(제출 마감·결과 HTML 등록) */
(function () {
  const cfg = window.APP_CONFIG || {};
  const DRAW_URL = /^https:\/\//.test(cfg.DRAW_API_URL || "") ? cfg.DRAW_API_URL : "";
  const view = document.getElementById('view');
  const modeEl = document.getElementById('mode');
  const REFRESH_MS = 10000;
  const MAX_SLOTS = 30;
  let refreshTimer = null;
  let busy = false;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const timeText = iso => iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음';
  const kb = n => n > 1024 * 1024 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';

  const hasRole = API.isConnected();
  const hasDraw = !!DRAW_URL;
  modeEl.textContent = hasRole || hasDraw ? '시트 연결됨' : '데모 모드';
  modeEl.classList.toggle('on', hasRole || hasDraw);

  /* ---------- 그림 저장 API ---------- */
  const drawToken = () => API.store.get('draw-admin-token', null);
  async function drawPost(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    try {
      const res = await fetch(DRAW_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow' });
      const data = await res.json();
      if (!data.ok) { const e = new Error(data.message || '요청 실패'); e.code = data.error; throw e; }
      return data;
    } finally { clearTimeout(t); }
  }
  const drawAdmin = (action, extra) => drawPost(Object.assign({ action, token: drawToken() }, extra || {}));

  function stopRefresh() { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; } }
  const loggedIn = () => !!(API.admin.token() || drawToken());

  /* ---------- 로그인 ---------- */
  function renderLogin(message) {
    stopRefresh();
    view.innerHTML =
      '<section class="card"><h2>관리자 로그인</h2>' +
      '<p class="sub">관리자 비밀번호를 입력하세요. AI 상황극과 \'내가 그리는 수협의 미래\'에 함께 로그인되고, 이 기기에서는 30일 동안 다시 묻지 않아요.</p>' +
      '<form id="login" autocomplete="off">' +
        '<label class="sr-only" for="pw">비밀번호</label>' +
        '<input class="field" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" required>' +
        '<button class="btn" id="login-btn" type="submit">로그인</button>' +
        '<p class="status' + (message ? ' err' : '') + '" id="login-status">' + esc(message || '') + '</p>' +
      '</form></section>';
    const form = document.getElementById('login'), pw = document.getElementById('pw');
    const btn = document.getElementById('login-btn'), st = document.getElementById('login-status');
    pw.focus();
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!pw.value) return;
      btn.disabled = true; btn.textContent = '확인 중…'; st.className = 'status'; st.textContent = '';
      const tries = [];
      if (hasRole) tries.push(API.admin.login(pw.value).then(() => null, e => '상황극: ' + (e.code ? e.message : '연결 실패')));
      if (hasDraw) tries.push(drawPost({ action: 'admin_login', password: pw.value }).then(d => { API.store.set('draw-admin-token', d.token); return null; }, e => '수협의 미래: ' + (e.code ? e.message : '연결 실패')));
      const errs = (await Promise.all(tries)).filter(Boolean);
      if (loggedIn()) { renderDashboard(errs); return; }
      btn.disabled = false; btn.textContent = '로그인';
      st.className = 'status err'; st.textContent = errs.join(' / ') || '로그인하지 못했어요.';
    });
  }

  /* ---------- 대시보드 ---------- */
  function renderDashboard(notes) {
    stopRefresh();
    view.innerHTML =
      (notes && notes.length ? '<p class="status err" style="margin:0 0 12px">' + esc(notes.join(' / ')) + '</p>' : '') +
      '<h2 class="sec-title">AI 상황극</h2><div id="roleArea"></div>' +
      '<h2 class="sec-title">내가 그리는 수협의 미래</h2><div id="drawArea"></div>' +
      '<p style="text-align:center"><button class="btn ghost" id="logout" type="button">로그아웃</button></p>';
    document.getElementById('logout').onclick = logout;
    loadRole();
    loadDraw();
  }
  async function logout() {
    stopRefresh();
    const t = drawToken();
    API.store.set('draw-admin-token', null);
    if (t && hasDraw) drawPost({ action: 'admin_logout', token: t }).catch(() => {});
    await API.admin.logout();
    renderLogin('로그아웃했어요.');
  }
  function areaMsg(id, title, text) {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = '<section class="card"><p class="sub" style="margin:0"><b>' + esc(title) + '</b> ' + esc(text) + '</p></section>';
  }

  /* ----- AI 상황극 ----- */
  async function loadRole(silent) {
    const area = document.getElementById('roleArea'); if (!area) return;
    if (!hasRole) { areaMsg('roleArea', '시트 미연결.', 'js/config.js의 API_URL을 설정하세요.'); return; }
    if (!API.admin.token()) { areaMsg('roleArea', '로그인되지 않았어요.', '비밀번호가 상황극 시트(설정 탭)와 다를 수 있어요. 로그아웃 후 다시 로그인해 보세요.'); return; }
    if (!silent) area.innerHTML = '<p class="loading">불러오는 중…</p>';
    try {
      const data = await API.admin.stats();
      renderRole(data.locked, data.stats);
    } catch (e) {
      if (e.code === 'auth') { API.store.set('admin-token', null); areaMsg('roleArea', '로그인이 만료됐어요.', '로그아웃 후 다시 로그인해 주세요.'); return; }
      if (!silent) areaMsg('roleArea', '불러오지 못했어요.', e.message || '');
    }
    stopRefresh();
    refreshTimer = setTimeout(() => { if (!busy) loadRole(true); }, REFRESH_MS);
  }
  function renderRole(locked, st) {
    st = st || { scenarios: [] };
    const rows = (st.scenarios || []).map(s => '<tr><td>' + esc(s.title) + '</td><td>' + num(s.total) + '</td></tr>').join('');
    document.getElementById('roleArea').innerHTML =
      '<section class="card"><h2>메뉴 상태</h2>' +
        '<div class="lock-state' + (locked ? ' is-locked' : '') + '"><span class="light"></span><strong>' + (locked ? '비활성' : '활성') + '</strong></div>' +
        '<p class="sub">' + (locked ? '메인 화면에서 닫혀 있어 참여자가 들어올 수 없어요.' : '참여자가 들어와 답변할 수 있어요.') + '</p>' +
        '<button class="btn' + (locked ? '' : ' danger') + '" id="roleToggle" type="button">' + (locked ? '활성화' : '비활성화') + '</button>' +
        '<p class="status" id="roleStatus"></p></section>' +
      '<section class="card"><h2>제출 현황</h2>' +
        '<div class="tiles"><div class="tile"><span>전체 답변</span><b>' + num(st.total) + '</b></div><div class="tile"><span>참여자</span><b>' + num(st.participants) + '</b></div><div class="tile"><span>마지막 제출</span><b style="font-size:16px">' + esc(timeText(st.lastAt)) + '</b></div></div>' +
        '<table class="by-scene"><thead><tr><th>상황</th><th>답변</th></tr></thead><tbody>' + (rows || '<tr><td colspan="2">상황 없음</td></tr>') + '</tbody></table></section>';
    document.getElementById('roleToggle').onclick = async e => {
      const b = e.currentTarget; busy = true; b.disabled = true; b.textContent = '바꾸는 중…';
      try { await API.admin.setLocked(!locked); } catch (err) { document.getElementById('roleStatus').textContent = '바꾸지 못했어요.'; }
      busy = false; loadRole(true);
    };
  }

  /* ----- 내가 그리는 수협의 미래 ----- */
  async function loadDraw() {
    const area = document.getElementById('drawArea'); if (!area) return;
    if (!hasDraw) { areaMsg('drawArea', '드라이브 미연결.', 'js/config.js의 DRAW_API_URL을 설정하세요.'); return; }
    if (!drawToken()) { areaMsg('drawArea', '로그인되지 않았어요.', '그림 저장 Apps Script의 ADMIN_PASSWORD가 입력한 비밀번호와 같은지 확인하세요.'); return; }
    area.innerHTML = '<p class="loading">불러오는 중…</p>';
    try { renderDraw(await drawAdmin('admin_info')); }
    catch (e) {
      if (e.code === 'auth') { API.store.set('draw-admin-token', null); areaMsg('drawArea', '로그인이 만료됐어요.', '로그아웃 후 다시 로그인해 주세요.'); return; }
      areaMsg('drawArea', '불러오지 못했어요.', e.message || '');
    }
  }
  function renderDraw(d) {
    const pages = d.pages || [];
    const byNo = {}; pages.forEach(p => { byNo[p.no] = p; });
    const maxNo = Math.min(MAX_SLOTS, Math.max(3, pages.length ? pages[pages.length - 1].no + 1 : 1));
    let slots = '';
    for (let no = 1; no <= maxNo; no++) {
      const p = byNo[no];
      slots += '<li class="slot' + (p ? ' on' : '') + '"><b class="no">' + no + '</b>' +
        '<div class="meta">' + (p ? '<strong>' + esc(p.title || p.name) + '</strong><span>' + esc(p.name) + ' · ' + kb(p.size) + ' · ' + esc(p.updatedAt) + '</span>' : '<span>비어 있음</span>') + '</div>' +
        '<div class="acts"><label class="btn sm">' + (p ? '교체' : 'HTML 올리기') + '<input type="file" accept=".html,.htm,text/html" data-no="' + no + '" hidden></label>' +
        (p ? '<button class="btn sm ghost" type="button" data-del="' + no + '">삭제</button>' : '') + '</div></li>';
    }
    document.getElementById('drawArea').innerHTML =
      '<section class="card"><h2>메뉴 상태</h2>' +
        '<div class="lock-state' + (d.locked ? ' is-locked' : '') + '"><span class="light"></span><strong>' + (d.locked ? '비활성' : '활성') + '</strong></div>' +
        '<p class="sub">지금까지 저장된 작품 <b>' + num(d.count) + '</b>개. ' + (d.locked ? '메인 화면에서 닫혀 있어 그리기·제출을 할 수 없어요.' : '참여자가 들어와 그리고 제출할 수 있어요.') + '</p>' +
        '<button class="btn' + (d.locked ? '' : ' danger') + '" id="drawToggle" type="button">' + (d.locked ? '활성화' : '비활성화') + '</button>' +
        '<p class="status" id="drawStatus"></p></section>' +
      '<section class="card"><h2>결과 화면(HTML) 등록</h2>' +
        '<p class="sub">번호마다 HTML 파일을 올리면 참여자 화면 아래에 <b>1, 2, 3</b> 버튼이 생기고, 누르면 그 화면이 열려요. 파일이 있는 번호만 보여요.</p>' +
        '<label class="field-label" for="pageTitle">버튼 제목 (선택, 올릴 때 함께 저장)</label>' +
        '<input class="field" id="pageTitle" maxlength="40" placeholder="예: AI가 완성한 수협의 미래 갤러리">' +
        '<ul class="slots">' + slots + '</ul>' +
        '<p class="status" id="pageStatus"></p></section>';
    document.getElementById('drawToggle').onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = '바꾸는 중…';
      try { await drawAdmin('admin_lock', { locked: !d.locked }); loadDraw(); }
      catch (err) { b.disabled = false; document.getElementById('drawStatus').textContent = err.message || '바꾸지 못했어요.'; }
    };
    const ps = document.getElementById('pageStatus');
    document.querySelectorAll('#drawArea input[type=file]').forEach(inp => inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const no = Number(inp.dataset.no);
      if (f.size > 15 * 1024 * 1024) { ps.className = 'status err'; ps.textContent = '15MB 이하 파일만 올릴 수 있어요.'; return; }
      ps.className = 'status'; ps.textContent = no + '번에 올리는 중… (' + kb(f.size) + ')';
      try {
        const html = await f.text();
        await drawAdmin('admin_page_put', { no, name: f.name, title: document.getElementById('pageTitle').value.trim(), html });
        await loadDraw();
        const p2 = document.getElementById('pageStatus'); if (p2) p2.textContent = no + '번에 등록했어요. 참여자 화면에 ' + no + ' 버튼이 보여요.';
      } catch (err) { ps.className = 'status err'; ps.textContent = err.message || '올리지 못했어요.'; }
    }));
    document.querySelectorAll('#drawArea [data-del]').forEach(btn => {
      let armed = false;
      btn.addEventListener('click', async () => {
        const no = Number(btn.dataset.del);
        if (!armed) { armed = true; btn.textContent = '정말 삭제?'; btn.classList.add('danger'); setTimeout(() => { armed = false; btn.textContent = '삭제'; btn.classList.remove('danger'); }, 3000); return; }
        btn.disabled = true;
        try { await drawAdmin('admin_page_delete', { no }); loadDraw(); }
        catch (err) { ps.className = 'status err'; ps.textContent = err.message || '삭제하지 못했어요.'; }
      });
    });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && API.admin.token() && document.getElementById('roleToggle')) loadRole(true); });

  if (!hasRole && !hasDraw) {
    view.innerHTML = '<section class="card"><h2>연결된 시트가 없어요</h2><p class="sub">js/config.js의 API_URL, DRAW_API_URL을 설정하세요.</p><a class="btn ghost" href="index.html">메인으로</a></section>';
  } else if (loggedIn()) renderDashboard();
  else renderLogin();
})();
