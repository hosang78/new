/**
 * 내가 그리는 수협의 미래 — 그림 저장 Apps Script (독립 프로젝트)
 *
 * 하는 일
 *  - 신입직원 휴대폰 그림판에서 제출한 작품을 구글 드라이브에 저장합니다.
 *    원본 그림(PNG) · 선 좌표와 그린 순서(JSON) · 작품 정보(JSON/MD)
 *  - 작품번호(SF-0001 …)를 차례로 붙이고, 한 기기에서 한 작품만 받습니다.
 *  - 동시에 여러 명이 제출해도 번호가 겹치지 않도록 잠금(LockService)을 씁니다.
 *
 * 처음 한 번만
 *  1. script.google.com → 새 프로젝트 → 이 코드를 붙여 넣고 저장
 *  2. 함수 선택에서 setup → 실행 (권한 허용)
 *     → 내 드라이브에 '수협의 미래 그림 (신입 AI 교육)' 폴더와 작품목록 시트, README가 만들어집니다.
 *     → 실행 로그에 폴더 주소가 나옵니다.
 *  3. 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포
 *  4. 웹 앱 주소(…/exec)를 GitHub 저장소 js/config.js 의 DRAW_API_URL 에 넣기
 *
 * 드라이브 구조
 *  수협의 미래 그림 (신입 AI 교육)/
 *  ├─ README_저장구조.md            ← 파일 구조·JSON 형식 설명 (AI가 먼저 읽을 문서)
 *  ├─ 작품목록_index                ← 구글 시트: 작품번호·제목·설명·파일 링크
 *  └─ artworks/
 *     └─ SF-0001_바다위스마트어선/
 *        ├─ SF-0001_drawing.png      원본 그림 1200×1600, 흰 배경
 *        ├─ SF-0001_strokes.json     선 좌표·색·굵기·시간(그린 순서 재생용)
 *        ├─ SF-0001_info.json        제목·설명·제출시각·통계 (기계용)
 *        └─ SF-0001_info.md          제목·설명·이미지 생성 안내 (사람·AI용)
 */

const ROOT_NAME = '수협의 미래 그림 (신입 AI 교육)';
const ART_FOLDER = 'artworks';
const INDEX_NAME = '작품목록_index';
const README_NAME = 'README_저장구조.md';
const ID_PREFIX = 'SF';
const CANVAS = { width: 1200, height: 1600 };
const MAX_PNG_BYTES = 10 * 1024 * 1024;
const MAX_STROKES_CHARS = 8 * 1024 * 1024;
const HEADERS = ['작품번호', '제출시각', '제목', '설명', '상태', '폴더', '원본그림(PNG)', '선데이터(JSON)', '작품정보(JSON)',
  '그린시간(초)', '획수', '점수', '기기ID', '제출ID'];
const COL = { id: 1, at: 2, title: 3, desc: 4, status: 5, folder: 6, png: 7, strokes: 8, info: 9, secs: 10, count: 11, points: 12, device: 13, sub: 14 };

/* ---------------- 처음 설정 ---------------- */
function setup() {
  const root = rootFolder_(true);
  artFolder_(root);
  indexSheet_(root);
  writeReadme_(root);
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('NEXT_NO')) p.setProperty('NEXT_NO', '1');
  Logger.log('준비 완료! 저장 폴더: ' + root.getUrl());
}

function rootFolder_(create) {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 지워졌으면 새로 */ } }
  if (!create) throw new Error('저장 폴더가 없습니다. Apps Script에서 setup을 먼저 실행하세요.');
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
  p.setProperty('ROOT_ID', folder.getId());
  return folder;
}

function artFolder_(root) {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ART_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = root.getFoldersByName(ART_FOLDER);
  const f = it.hasNext() ? it.next() : root.createFolder(ART_FOLDER);
  p.setProperty('ART_ID', f.getId());
  return f;
}

function indexSheet_(root) {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('INDEX_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) {} }
  const ss = SpreadsheetApp.create(INDEX_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  const sh = ss.getSheets()[0];
  sh.setName('작품목록');
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#0b3c6b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(COL.title, 200); sh.setColumnWidth(COL.desc, 360);
  p.setProperty('INDEX_ID', ss.getId());
  return sh;
}

function writeReadme_(root) {
  const text = [
    '# 내가 그리는 수협의 미래 — 저장 구조 안내',
    '',
    '신입직원이 스마트폰에서 손가락으로 그린 "수협의 미래" 그림입니다. 작품 하나마다 폴더 하나입니다.',
    '',
    '## 폴더 구조',
    '```',
    ROOT_NAME + '/',
    '├─ ' + README_NAME + '   (이 문서)',
    '├─ ' + INDEX_NAME + '         (구글 시트: 모든 작품의 번호·제목·설명·파일 링크)',
    '└─ ' + ART_FOLDER + '/',
    '   └─ SF-0001_작품제목/',
    '      ├─ SF-0001_drawing.png    원본 그림 (1200×1600 px, 세로 3:4, 흰 배경)',
    '      ├─ SF-0001_strokes.json   선 데이터 (좌표·색·굵기·시간, 그린 순서대로)',
    '      ├─ SF-0001_info.json      작품 정보 (제목·설명·제출시각·통계)',
    '      └─ SF-0001_info.md        작품 정보 (읽기 쉬운 글 + 이미지 완성 안내)',
    '```',
    '- 작품번호는 제출 순서대로 SF-0001, SF-0002 … 로 매겨집니다. 파일명은 모두 작품번호로 시작합니다.',
    '- 참여자는 익명입니다. 이름은 저장하지 않습니다.',
    '',
    '## 이미지 완성 시 지켜 주세요',
    '1. 원본 PNG의 선 위치·형태·구도(무엇이 어디에 얼마나 크게 있는지)를 최대한 유지합니다.',
    '2. info.md의 제목과 설명에 담긴 "미래의 모습"을 살려 완성도를 높입니다.',
    '3. 결과 이미지는 원본과 같은 세로 3:4 비율을 권장합니다. 슬라이드에서는 왼쪽 원본 / 오른쪽 완성본으로 나란히 놓을 예정입니다.',
    '',
    '## strokes.json 형식 (schema: suhyup-future-drawing/v1)',
    '- canvas: { width: 1200, height: 1600, background: "#ffffff", origin: "top-left", unit: "px" }',
    '- strokes: 최종 그림에 남아 있는 선, 그린 순서대로',
    '  - { n: 선 번호, tool: "pen" | "eraser", color: "#RRGGBB", width: 선 굵기(px), points: [[x, y, t], …] }',
    '  - x, y: 캔버스 좌표(px), t: 그리기를 시작한 뒤 지난 시간(ms)',
    '  - 지우개는 흰색(#ffffff)으로 덧칠하는 선입니다.',
    '- removedStrokes: 되돌리기·전체 지우기로 최종 그림에서 빠진 선 (형식은 strokes와 같음)',
    '- timeline: 그리는 동안의 모든 동작을 시간 순서대로 (빠른 배속 재생용)',
    '  - { type: "stroke", t, n }  선 n을 그림 (n은 strokes 또는 removedStrokes의 선 번호)',
    '  - { type: "undo", t }  바로 앞 동작 취소 · { type: "redo", t }  취소한 동작 되살리기 · { type: "clear", t }  전체 지우기',
    '  - timeline을 처음부터 차례로 적용하면 최종 그림과 같아집니다. 각 선은 points의 t 순서대로 그리면 실제 속도로 재생됩니다.',
    '- stats: strokeCount(최종 선 수), totalStrokes(그린 선 전체), pointCount, drawSeconds(실제 그린 시간), sessionSeconds',
    ''
  ].join('\n');
  const it = root.getFilesByName(README_NAME);
  if (it.hasNext()) it.next().setContent(text);
  else root.createFile(README_NAME, text, MimeType.PLAIN_TEXT);
}

/* ---------------- 웹 앱 ---------------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'status') return json_({ ok: true, result: deviceStatus_(String(p.deviceId || '')) });
    return json_({ ok: true, message: '수협의 미래 그림 저장소 작동 중' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'submit') return json_(submit_(body));
    return json_({ ok: false, error: 'unknown', message: '알 수 없는 요청' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function deviceStatus_(deviceId) {
  if (!deviceId) return { submitted: false };
  const sh = indexSheet_(rootFolder_(false));
  const row = findRow_(sh, COL.device, deviceId, true);
  if (!row) return { submitted: false };
  const v = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return { submitted: v[COL.status - 1] === '완료', id: v[0], title: v[COL.title - 1] };
}

function submit_(b) {
  // ---- 입력 확인 ----
  const submissionId = clean_(b.submissionId, 64);
  const deviceId = clean_(b.deviceId, 40);
  const title = clean_(b.title, 40);
  const desc = clean_(b.description, 400);
  if (!submissionId || !deviceId) return { ok: false, error: 'bad', message: '제출 정보가 올바르지 않습니다.' };
  if (!title) return { ok: false, error: 'bad', message: '작품 제목을 적어 주세요.' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png || ''));
  if (!m) return { ok: false, error: 'bad', message: '그림 파일이 올바르지 않습니다.' };
  if (m[1].length * 0.75 > MAX_PNG_BYTES) return { ok: false, error: 'too_large', message: '그림 파일이 너무 큽니다.' };
  const strokes = b.strokes || {};
  const strokesText = JSON.stringify(strokes);
  if (strokesText.length > MAX_STROKES_CHARS) return { ok: false, error: 'too_large', message: '선 데이터가 너무 큽니다.' };
  if (!Array.isArray(strokes.strokes) || !strokes.strokes.length) return { ok: false, error: 'bad', message: '그림이 비어 있습니다.' };

  const root = rootFolder_(false);
  const sh = indexSheet_(root);
  const lock = LockService.getScriptLock();
  let id, row;

  // ---- 번호 받기 (잠금 안에서 짧게) ----
  lock.waitLock(30000);
  try {
    // 같은 제출(재전송) → 이미 받은 번호 돌려주기
    let r = findRow_(sh, COL.sub, submissionId, false);
    if (r) {
      const st = sh.getRange(r, COL.status).getValue();
      id = sh.getRange(r, COL.id).getValue();
      if (st === '완료') return { ok: true, id, duplicate: true };
      if (st === '저장중') return { ok: false, error: 'busy', message: '저장 중입니다. 잠시 후 다시 확인합니다.', id };
      row = r; // 실패했던 제출 → 같은 번호로 다시 저장
      sh.getRange(row, COL.status).setValue('저장중');
    } else {
      // 1인 1작품: 이 기기에서 이미 완료한 작품이 있으면 그 번호를 돌려줌
      const d = findRow_(sh, COL.device, deviceId, true);
      if (d && sh.getRange(d, COL.status).getValue() === '완료') {
        return { ok: true, id: sh.getRange(d, COL.id).getValue(), duplicate: true, already: true };
      }
      const p = PropertiesService.getScriptProperties();
      const no = Number(p.getProperty('NEXT_NO') || '1');
      p.setProperty('NEXT_NO', String(no + 1));
      id = ID_PREFIX + '-' + ('000' + no).slice(-4);
      sh.appendRow([id, new Date(), safe_(title), safe_(desc), '저장중', '', '', '', '',
        Number(b.stats && b.stats.drawSeconds) || '', Number(b.stats && b.stats.strokeCount) || '',
        Number(b.stats && b.stats.pointCount) || '', deviceId, submissionId]);
      row = sh.getLastRow();
    }
  } finally {
    lock.releaseLock();
  }

  // ---- 파일 저장 (잠금 밖, 여러 명이 동시에 진행 가능) ----
  try {
    const art = artFolder_(root);
    const folderName = id + '_' + fileSafe_(title);
    const old = art.getFoldersByName(folderName);
    const folder = old.hasNext() ? old.next() : art.createFolder(folderName);
    const submittedAt = new Date();
    const tz = Session.getScriptTimeZone() || 'Asia/Seoul';
    const when = Utilities.formatDate(submittedAt, tz, 'yyyy-MM-dd HH:mm:ss');

    const pngFile = put_(folder, id + '_drawing.png', Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/png'));
    const strokesDoc = Object.assign({ schema: 'suhyup-future-drawing/v1', id }, strokes, { canvas: strokes.canvas || CANVAS });
    const strokesFile = put_(folder, id + '_strokes.json', Utilities.newBlob(JSON.stringify(strokesDoc), 'application/json'));
    const info = {
      schema: 'suhyup-future-info/v1', id, title, description: desc, submittedAt: when, timezone: tz,
      participant: '익명', canvas: strokesDoc.canvas, stats: b.stats || {},
      files: { drawing: id + '_drawing.png', strokes: id + '_strokes.json', info: id + '_info.json', story: id + '_info.md' },
      guide: '원본 그림의 선·형태·구도를 최대한 유지하고, 제목과 설명의 미래상을 살려 세로 3:4 고품질 이미지로 완성해 주세요.'
    };
    const infoFile = put_(folder, id + '_info.json', Utilities.newBlob(JSON.stringify(info, null, 2), 'application/json'));
    put_(folder, id + '_info.md', Utilities.newBlob([
      '# ' + id + ' · ' + title, '',
      '- 주제: 내가 그리는 수협의 미래',
      '- 제출: ' + when + ' (' + tz + ')',
      '- 그린 시간: 약 ' + ((b.stats && b.stats.drawSeconds) || '?') + '초 · 획수 ' + ((b.stats && b.stats.strokeCount) || '?'),
      '', '## 작품 설명', desc || '(설명 없음)', '',
      '## 이미지 완성 안내',
      '- 원본: ' + id + '_drawing.png (1200×1600, 세로 3:4)',
      '- 원본의 선 위치·형태·구도를 최대한 그대로 살리고, 위 제목과 설명의 미래상을 표현해 주세요.',
      '- 그린 순서와 시간은 ' + id + '_strokes.json 에 있습니다.', ''
    ].join('\n'), 'text/markdown'));

    sh.getRange(row, COL.status, 1, 5).setValues([[ '완료', folder.getUrl(), pngFile.getUrl(), strokesFile.getUrl(), infoFile.getUrl() ]]);
    return { ok: true, id };
  } catch (err) {
    sh.getRange(row, COL.status).setValue('실패');
    return { ok: false, error: 'save_failed', message: '드라이브 저장에 실패했습니다. 다시 시도해 주세요.', id };
  }
}

/* ---------------- 도구 ---------------- */
function put_(folder, name, blob) {
  blob.setName(name);
  const it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true); // 재시도 때 같은 이름 정리
  return folder.createFile(blob);
}

function findRow_(sh, col, value, last) {
  if (sh.getLastRow() < 2) return 0;
  const tf = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true);
  const all = tf.findAll();
  if (!all.length) return 0;
  return (last ? all[all.length - 1] : all[0]).getRow();
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function fileSafe_(s) {
  return String(s).replace(/[\\/:*?"<>|#%{}~&]/g, '').replace(/\s+/g, '').slice(0, 24) || '무제';
}
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
