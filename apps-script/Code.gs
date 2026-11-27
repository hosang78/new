/** @OnlyCurrentDoc */
/**
 * 슬기로운 신입생활 : AI 상황극 — 구글 시트 연동 (Apps Script)
 *
 * 사용법 요약 (자세한 내용은 README.md)
 *  1. 구글 시트 → 확장 프로그램 → Apps Script → 이 코드를 붙여넣고 저장
 *  2. 함수 목록에서 setup 선택 → 실행 (처음 1회, 권한 허용)
 *  3. 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포
 *  4. 나온 웹 앱 URL(…/exec)을 js/config.js 의 API_URL 에 넣기
 *
 * 시트 구성
 *  - '상황' 탭 : 휴대폰에 보이는 상황 문구 (여기서 수정하면 바로 반영)
 *  - '답변' 탭 : 신입직원 제출 답변이 한 줄씩 쌓임
 *               AI반응(긍정/부정) · AI대사 칸을 채우면 해당 휴대폰에 반응이 표시됨
 *               (나중에 만들 PC 화면이 이 두 칸을 채우게 됩니다)
 *  - '설정' 탭 : 관리자 비밀번호, 답변 잠금(Y/N)
 *               ★ setup 후 '관리자 비밀번호' 값을 꼭 직접 적어 넣으세요.
 */

const SHEET_SCENARIOS = '상황';
const SHEET_ANSWERS = '답변';
const SHEET_SETTINGS = '설정';
const SETTING_PASSWORD = '관리자 비밀번호';
const SETTING_LOCK = '답변 잠금';
const TOKEN_DAYS = 30;

const SCENARIO_HEADERS = ['id', '순서', '제목', '한줄 대사', '장소', '상대역', '상황 설명', '상대 대사', '질문', '평가 포인트(AI용·휴대폰 비공개)', '사용'];
const ANSWER_HEADERS = ['제출ID', '제출시각', '참여자(익명)', '상황ID', '상황', '답변', 'AI반응', 'AI대사', '반응시각'];

const MAX_ANSWER = 500;

const DEFAULT_SCENARIOS = [
  ['customer', 1, '까다로운 고객', '그래서 언제 됩니까?', '회원조합 고객 창구', '고객',
    '회원조합 창구에 고객이 찾아왔습니다. 이틀 전에 낸 신청서의 처리 상태는 아직 확인하지 못했습니다.',
    '이틀 전에 신청했는데 아직 연락이 없어요. 어제도 기다리라고만 하셨잖아요. 그래서 언제 되는 겁니까?',
    '고객에게 첫마디를 어떻게 하시겠어요?',
    '① 기다리게 한 점에 대한 사과·공감 ② 지금 바로 처리 상태를 확인하겠다는 구체적 행동 ③ 확인 결과를 언제까지 알려드릴지 시점 약속. "조금만 더 기다려 주세요"처럼 막연한 답을 반복하면 보완 필요.',
    'Y'],
  ['manager', 2, '업무를 지시하는 상사', '내일 회의는 신입님이 진행해요', '퇴근 직전 · 소회의실', '팀장',
    '내일 회원조합 담당자들과 새 신청 절차를 논의하는 회의가 있습니다. 회의자료는 직접 준비했지만, 회의를 진행해 본 경험은 없습니다. 퇴근을 앞두고 팀장이 말합니다.',
    '내일 회의는 신입님이 진행해요. 자료 만든 사람이 제일 잘 알잖아요. 나는 옆에서 듣고 있을게요.',
    '이 말을 듣고 팀장에게 뭐라고 답하시겠어요?',
    '① 맡겠다는 수용 의지 ② 진행 경험이 없다는 점을 솔직하게 공유 ③ 진행 순서·시간 배분 점검, 막힐 때 도와줄 부분 등 구체적인 요청. 이유 없이 거절하거나 아무 확인 없이 "네"만 하면 보완 필요.',
    'Y'],
  ['colleague', 3, '협업이 어려운 동료', '그냥 하던 대로 하죠', '팀 회의 · 공동 작업 공간', '동료',
    '팀 회의에서 회원조합 문의가 반복되는 이유를 이야기하고 있습니다. 신청 안내문에 제출서류 예시 한 줄을 넣자고 제안하자, 동료가 말을 끊습니다.',
    '양식 한번 바꾸면 여기저기 다 고쳐야 돼요. 그냥 하던 대로 하고, 다음 안건 보죠.',
    '다음 안건으로 넘어가기 전, 동료에게 뭐라고 말하시겠어요?',
    '① 수정 부담에 대한 공감 ② 반복 문의라는 근거 제시 ③ 범위를 줄인 대안(안내문 한 줄만, 시범 적용 등)이나 따로 이야기할 시점 제안. 감정적으로 반박하거나 그대로 포기하면 보완 필요.',
    'Y']
];

/* ---------------- 최초 설정 ---------------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sc = ss.getSheetByName(SHEET_SCENARIOS);
  if (!sc) {
    sc = ss.insertSheet(SHEET_SCENARIOS);
    sc.getRange(1, 1, 1, SCENARIO_HEADERS.length).setValues([SCENARIO_HEADERS]);
    sc.getRange(2, 1, DEFAULT_SCENARIOS.length, SCENARIO_HEADERS.length).setValues(DEFAULT_SCENARIOS);
  }
  styleHeader_(sc, SCENARIO_HEADERS.length);
  sc.setColumnWidths(1, 2, 80);
  sc.setColumnWidths(3, 4, 150);
  sc.setColumnWidths(7, 4, 320);
  sc.getRange(2, 7, sc.getMaxRows() - 1, 4).setWrap(true);
  sc.getRange(2, 11, sc.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Y', 'N'], true).build());

  let an = ss.getSheetByName(SHEET_ANSWERS);
  if (!an) {
    an = ss.insertSheet(SHEET_ANSWERS);
    an.getRange(1, 1, 1, ANSWER_HEADERS.length).setValues([ANSWER_HEADERS]);
  }
  styleHeader_(an, ANSWER_HEADERS.length);
  an.setColumnWidth(1, 110);
  an.setColumnWidth(2, 150);
  an.setColumnWidth(6, 380);
  an.setColumnWidth(8, 320);
  an.getRange(2, 6, an.getMaxRows() - 1, 3).setWrap(true);
  an.getRange(2, 7, an.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['긍정', '부정'], true).build());

  let st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) {
    st = ss.insertSheet(SHEET_SETTINGS);
    st.getRange(1, 1, 3, 3).setValues([
      ['항목', '값', '설명'],
      [SETTING_PASSWORD, '', '관리자 화면 비밀번호. 비워 두면 관리자 로그인이 되지 않습니다. 바꾸면 기존 로그인은 모두 풀립니다.'],
      [SETTING_LOCK, 'N', 'Y이면 신입직원이 답변을 제출할 수 없습니다. 관리자 화면에서도 바꿀 수 있습니다.']
    ]);
  }
  styleHeader_(st, 3);
  st.setColumnWidth(1, 140);
  st.setColumnWidth(2, 160);
  st.setColumnWidth(3, 480);
  st.getRange(3, 2).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Y', 'N'], true).build());

  const blank = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(blank);

  ss.toast("설정 완료! '설정' 탭에 관리자 비밀번호를 적은 뒤 \"배포 → 새 배포 → 웹 앱\"으로 배포하세요.");
}

function styleHeader_(sheet, n) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1d2b45').setFontColor('#fff6df');
}

/* ---------------- 웹 앱 ---------------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'scenarios': return json_({ ok: true, scenarios: readScenarios_(), locked: isLocked_() });
      case 'status': return json_({ ok: true, locked: isLocked_() });
      case 'result': return json_({ ok: true, result: readResult_(p.id) });
      default: return json_({ ok: true, message: '슬기로운 신입생활 API 작동 중' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'submit':
        if (isLocked_()) return json_({ ok: false, error: 'locked', message: '답변이 마감되었습니다.' });
        return json_({ ok: true, id: appendAnswer_(body) });
      case 'admin_login': return json_(adminLogin_(body.password));
      case 'admin_logout': removeToken_(body.token); return json_({ ok: true });
      case 'admin_stats':
        if (!checkToken_(body.token)) return json_({ ok: false, error: 'auth', message: '다시 로그인해 주세요.' });
        return json_({ ok: true, locked: isLocked_(), stats: readStats_() });
      case 'admin_lock':
        if (!checkToken_(body.token)) return json_({ ok: false, error: 'auth', message: '다시 로그인해 주세요.' });
        setSetting_(SETTING_LOCK, body.locked ? 'Y' : 'N');
        return json_({ ok: true, locked: isLocked_() });
      default:
        return json_({ ok: false, error: 'unknown', message: '알 수 없는 요청' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

/* ---------------- 내부 함수 ---------------- */
function readScenarios_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SCENARIOS);
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, SCENARIO_HEADERS.length).getDisplayValues();
  return rows
    .filter(r => r[0] && String(r[10]).trim().toUpperCase() !== 'N')
    .map(r => ({
      id: r[0].trim(), order: Number(r[1]) || 0, title: r[2], quote: r[3], scene: r[4],
      role: r[5], situation: r[6], line: r[7], question: r[8]
      // 평가 포인트(r[9])는 휴대폰으로 보내지 않습니다.
    }));
}

function appendAnswer_(body) {
  const answer = String(body.answer || '').trim().slice(0, MAX_ANSWER);
  const scenarioId = String(body.scenarioId || '').trim().slice(0, 40);
  const participant = String(body.participant || '').trim().slice(0, 20);
  if (answer.length < 2) throw new Error('답변이 비어 있습니다');
  if (!scenarioId) throw new Error('상황 ID가 없습니다');

  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANSWERS);
    if (!sh) throw new Error("'답변' 탭이 없습니다. setup을 먼저 실행하세요.");
    sh.appendRow([id, new Date(), participant, scenarioId,
      safe_(String(body.scenarioTitle || '').slice(0, 60)), safe_(answer), '', '', '']);
  } finally {
    lock.releaseLock();
  }
  return id;
}

function readResult_(id) {
  if (!id) return null;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANSWERS);
  if (!sh || sh.getLastRow() < 2) return null;
  const cell = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!cell) return null;
  const row = sh.getRange(cell.getRow(), 7, 1, 2).getDisplayValues()[0];
  const reaction = normalizeReaction_(row[0]);
  if (!reaction) return null;
  return { reaction: reaction, line: row[1] };
}

/* ---------------- 설정 · 잠금 ---------------- */
function settingsSheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!sh) throw new Error("'설정' 탭이 없습니다. setup을 다시 실행하세요.");
  return sh;
}

function getSetting_(name) {
  const sh = settingsSheet_();
  const rows = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getDisplayValues();
  const row = rows.find(r => String(r[0]).trim() === name);
  return row ? String(row[1]).trim() : '';
}

function setSetting_(name, value) {
  const sh = settingsSheet_();
  const rows = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getDisplayValues();
  const i = rows.findIndex(r => String(r[0]).trim() === name);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(value);
  else sh.appendRow([name, value, '']);
}

function isLocked_() {
  try { return getSetting_(SETTING_LOCK).toUpperCase() === 'Y'; } catch (e) { return false; }
}

/* ---------------- 관리자 인증 ---------------- */
function hash_(s) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

function adminLogin_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('adminFails') || 0);
  if (fails >= 5) return { ok: false, error: 'wait', message: '비밀번호를 여러 번 틀렸습니다. 5분 뒤 다시 시도하세요.' };

  const real = getSetting_(SETTING_PASSWORD);
  if (!real) return { ok: false, error: 'nopassword', message: "시트 '설정' 탭에 관리자 비밀번호를 먼저 적어 주세요." };
  if (String(password || '') !== real) {
    cache.put('adminFails', String(fails + 1), 300);
    return { ok: false, error: 'wrong', message: '비밀번호가 맞지 않습니다.' };
  }
  cache.remove('adminFails');

  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tokens = loadTokens_();
    tokens[hash_(token)] = { exp: Date.now() + TOKEN_DAYS * 86400000, pw: hash_(real) };
    saveTokens_(tokens);
  } finally { lock.releaseLock(); }
  return { ok: true, token: token };
}

function checkToken_(token) {
  if (!token) return false;
  const t = loadTokens_()[hash_(token)];
  if (!t || t.exp < Date.now()) return false;
  return t.pw === hash_(getSetting_(SETTING_PASSWORD)); // 비밀번호를 바꾸면 기존 로그인 무효
}

function removeToken_(token) {
  if (!token) return;
  const tokens = loadTokens_();
  delete tokens[hash_(token)];
  saveTokens_(tokens);
}

function loadTokens_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('adminTokens') || '{}'); }
  catch (e) { return {}; }
}

function saveTokens_(tokens) {
  const now = Date.now();
  const live = Object.keys(tokens).filter(k => tokens[k].exp > now)
    .sort((a, b) => tokens[b].exp - tokens[a].exp).slice(0, 30);
  const out = {};
  live.forEach(k => { out[k] = tokens[k]; });
  PropertiesService.getScriptProperties().setProperty('adminTokens', JSON.stringify(out));
}

/* ---------------- 제출 현황 ---------------- */
function readStats_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANSWERS);
  const byScenario = {};
  readScenarios_().forEach(s => { byScenario[s.id] = { id: s.id, title: s.title, total: 0, positive: 0, negative: 0, pending: 0 }; });
  const stats = { total: 0, participants: 0, pending: 0, positive: 0, negative: 0, lastAt: null, scenarios: [] };
  if (sh && sh.getLastRow() >= 2) {
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    const people = {};
    rows.forEach(r => {
      if (!r[0]) return;
      const sid = String(r[3]);
      const b = byScenario[sid] || (byScenario[sid] = { id: sid, title: String(r[4] || sid), total: 0, positive: 0, negative: 0, pending: 0 });
      const reaction = normalizeReaction_(r[6]);
      stats.total++; b.total++;
      if (reaction) { stats[reaction]++; b[reaction]++; } else { stats.pending++; b.pending++; }
      if (r[2]) people[r[2]] = 1;
      if (r[1] instanceof Date && (!stats.lastAt || r[1] > stats.lastAt)) stats.lastAt = r[1];
    });
    stats.participants = Object.keys(people).length;
  }
  stats.lastAt = stats.lastAt ? stats.lastAt.toISOString() : null;
  stats.scenarios = Object.keys(byScenario).map(k => byScenario[k]);
  return stats;
}

function normalizeReaction_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['긍정', 'positive', 'good', 'o'].indexOf(s) >= 0) return 'positive';
  if (['부정', '보완', 'negative', 'bad', 'x'].indexOf(s) >= 0) return 'negative';
  return '';
}

// 수식으로 해석되지 않도록 (=, +, -, @ 로 시작하는 입력 방지)
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
