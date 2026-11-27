/* 공통: 저장소, 익명 참여자 코드, 구글 시트(Apps Script) 통신 */
(function () {
  const cfg = window.APP_CONFIG || {};
  const PREFIX = 'sgr-';

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ }
    }
  };

  let memoryId = null;
  function participantId() {
    let id = store.get('participant', null);
    if (!id) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      const buf = new Uint32Array(6);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      buf.forEach(n => { code += chars[n % chars.length]; });
      id = 'R-' + code;
      store.set('participant', id);
      if (store.get('participant', null) !== id) { memoryId = memoryId || id; return memoryId; }
    }
    return id;
  }

  const isConnected = () => !!(cfg.API_URL && /^https:\/\//.test(cfg.API_URL));

  function withTimeout(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(t) };
  }

  async function getJSON(params) {
    const url = cfg.API_URL + '?' + new URLSearchParams(params).toString();
    const t = withTimeout(15000);
    try {
      const res = await fetch(url, { signal: t.signal, redirect: 'follow' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '요청 실패');
      return data;
    } finally { t.done(); }
  }

  async function postJSON(body) {
    const t = withTimeout(20000);
    try {
      // text/plain 으로 보내야 브라우저 사전요청(CORS preflight) 없이 Apps Script에 전달됩니다.
      const res = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: t.signal,
        redirect: 'follow'
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '저장 실패');
      return data;
    } finally { t.done(); }
  }

  window.API = {
    store,
    participantId,
    isConnected,

    async loadScenarios() {
      const fallback = (window.DEFAULT_SCENARIOS || []).slice();
      if (!isConnected()) return fallback;
      try {
        const data = await getJSON({ action: 'scenarios' });
        const list = (data.scenarios || []).filter(s => s && s.id);
        return list.length ? list : fallback;
      } catch (e) {
        console.warn('상황 데이터를 시트에서 불러오지 못해 기본값을 사용합니다.', e);
        return fallback;
      }
    },

    async submitAnswer(scenario, answer) {
      if (!isConnected()) {
        await new Promise(r => setTimeout(r, 600));
        return { id: 'local-' + Date.now(), demo: true };
      }
      const data = await postJSON({
        action: 'submit',
        participant: participantId(),
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        answer
      });
      return { id: data.id, demo: false };
    },

    async fetchResult(submissionId) {
      if (!isConnected() || !submissionId || submissionId.indexOf('local-') === 0) return null;
      const data = await getJSON({ action: 'result', id: submissionId });
      return data.result || null; // { reaction: 'positive'|'negative', line: '...' }
    }
  };
})();
