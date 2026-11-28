/* 관리자 잠금 띠: 관리자로 로그인된 기기에서만 각 메뉴(카드·화면) 위에 '마감하기 / 다시 열기'를 보여 준다.
 * 사용: <div data-adminbar="roleplay"></div> 또는 data-adminbar="draw"
 * 잠금이 바뀌면 document에 'adminlock' 이벤트({kind, locked})를 보낸다. */
(function () {
  const cfg = window.APP_CONFIG || {};
  const DRAW_URL = /^https:\/\//.test(cfg.DRAW_API_URL || "") ? cfg.DRAW_API_URL : "";
  const store = window.API.store;

  const KINDS = {
    roleplay: {
      label: "AI 상황극", open: "답변 받는 중", closed: "답변 마감됨",
      token: () => window.API.isConnected() && window.API.admin.token(),
      get: async () => { const v = await window.API.getLocked(); if (v == null) throw new Error("확인 실패"); return v; },
      set: async v => (await window.API.admin.setLocked(v)).locked,
      clear: () => store.set("admin-token", null)
    },
    draw: {
      label: "수협의 미래", open: "제출 받는 중", closed: "제출 마감됨",
      token: () => DRAW_URL && store.get("draw-admin-token", null),
      get: async () => {
        const r = await fetch(DRAW_URL + "?action=pages&_=" + Date.now(), { redirect: "follow" });
        const j = await r.json(); if (!j.ok) throw new Error(j.message || "확인 실패"); return !!j.locked;
      },
      set: async v => {
        const r = await fetch(DRAW_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow",
          body: JSON.stringify({ action: "admin_lock", token: store.get("draw-admin-token", null), locked: !!v }) });
        const j = await r.json();
        if (!j.ok) { const e = new Error(j.message || "바꾸지 못했어요"); e.code = j.error; throw e; }
        return !!j.locked;
      },
      clear: () => store.set("draw-admin-token", null)
    }
  };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  async function mount(box) {
    const k = KINDS[box.dataset.adminbar];
    if (!k || !k.token()) { box.hidden = true; return; }
    box.hidden = false;
    box.className = "adminbar";
    box.replaceChildren();
    const tag = el("span", "ab-tag", "관리자");
    const dot = el("i", "ab-dot");
    const txt = el("span", "ab-text", k.label + " · 확인 중…");
    const btn = el("button", "ab-btn", "…"); btn.type = "button"; btn.disabled = true;
    box.append(tag, dot, txt, btn);
    let locked = null;
    const paint = () => {
      box.classList.toggle("is-locked", !!locked);
      txt.textContent = k.label + " · " + (locked ? k.closed : k.open);
      btn.textContent = locked ? "다시 열기" : "마감하기";
      btn.disabled = false;
    };
    try { locked = await k.get(); paint(); }
    catch (e) { txt.textContent = k.label + " · 상태를 확인하지 못했어요"; }
    btn.addEventListener("click", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      btn.disabled = true; btn.textContent = "바꾸는 중…";
      try {
        locked = await k.set(!locked);
        paint();
        document.dispatchEvent(new CustomEvent("adminlock", { detail: { kind: box.dataset.adminbar, locked } }));
      } catch (e) {
        if (e && e.code === "auth") { k.clear(); box.hidden = true; return; }
        txt.textContent = k.label + " · 바꾸지 못했어요. 다시 눌러 주세요";
        btn.disabled = false; btn.textContent = locked ? "다시 열기" : "마감하기";
      }
    });
  }

  window.AdminBar = { mountAll: () => document.querySelectorAll("[data-adminbar]").forEach(mount) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.AdminBar.mountAll);
  else window.AdminBar.mountAll();
})();
