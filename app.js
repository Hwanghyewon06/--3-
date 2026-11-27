/* 화면 동작. 서버와 통신하지 않고, 데이터는 이 기기의 브라우저(localStorage)에만 저장한다. */
(function () {
  "use strict";
  var E = window.Engine;
  var KEY = "priority-picker-v1";
  var board = new E.Board();
  var storageOk = true;
  var lastRemoved = null;
  var clearTimer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;     // textContent만 사용 → 입력 내용이 코드로 실행되지 않음
    return n;
  }

  /* ───────── 저장 / 불러오기 ───────── */
  /* 예전 버전의 가짜 예시 할 일이 이 기기에 남아 있으면 한 번만 걷어낸다(사용자가 직접 쓴 할 일은 그대로) */
  var LEGACY = ["수학 과제 제출하기", "팀 회의 자료 만들기", "영어 단어 30개 외우기", "친구에게 답장하기", "방 청소하기",
    "내일 마감 과제·보고서 끝내기", "병원·은행 예약 전화하기", "공과금·카드값 납부하기", "장보고 저녁 준비하기", "빨래·방 정리하기"];
  function dropLegacy(b) {
    b.tasks = b.tasks.filter(function (t) { return LEGACY.indexOf(t.title) < 0; });
    return b;
  }
  function load() {
    var keys = [KEY, KEY + "-bak"];
    for (var i = 0; i < keys.length; i++) {
      try {
        var s = localStorage.getItem(keys[i]);
        if (s) {
          var b = E.Board.fromJSON(JSON.parse(s));
          if (!localStorage.getItem(KEY + "-clean")) { dropLegacy(b); localStorage.setItem(KEY + "-clean", "1"); }
          return b;
        }
      } catch (e) { /* 다음(백업)으로 */ }
    }
    return new E.Board();
  }
  function save() {
    try {
      var cur = localStorage.getItem(KEY);
      if (cur) localStorage.setItem(KEY + "-bak", cur);
      localStorage.setItem(KEY, JSON.stringify(board.toJSON()));
      storageOk = true;
    } catch (e) {
      if (storageOk) say("이 브라우저에서는 저장이 안 될 수 있어요. 페이지를 닫으면 목록이 사라질 수 있어요.", "warn");
      storageOk = false;
    }
  }

  /* ───────── 안내 메시지 ───────── */
  function say(text, kind, undoFn) {
    var m = $("msg");
    m.className = "msg" + (kind ? " " + kind : "");
    m.textContent = text || "";
    if (undoFn) {
      var b = el("button", "", "되돌리기");
      b.type = "button";
      b.addEventListener("click", undoFn);
      m.appendChild(b);
    }
  }

  /* ───────── 그리기 ───────── */
  function badgeClass(label) {
    return label === E.LABEL_URGENT ? "b-urgent" : label === E.LABEL_IMPORTANT ? "b-important" : "b-must";
  }
  function actButton(act, id, text, aria, on) {
    var b = el("button", on ? "on" : "", text);
    b.type = "button";
    b.setAttribute("data-act", act);
    b.setAttribute("data-id", String(id));
    b.setAttribute("aria-label", aria);
    return b;
  }
  function actions(t) {
    var box = el("div", "acts");
    box.appendChild(actButton("pin", t.id, t.pinned ? "📍 고정됨" : "📍", (t.pinned ? "고정 풀기: " : "1순위로 고정: ") + t.title, t.pinned));
    box.appendChild(actButton("del", t.id, "✕", "삭제: " + t.title));
    return box;
  }
  function topCard(t, rank) {
    var card = el("article", "task" + (t.done ? " done" : "") + (t.pinned ? " pinned" : ""));
    var chk = el("label", "check");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = t.done;
    input.setAttribute("data-act", "toggle");
    input.setAttribute("data-id", String(t.id));
    input.setAttribute("aria-label", "완료 체크: " + t.title);
    chk.appendChild(input);
    chk.appendChild(el("span", "box"));
    card.appendChild(chk);

    var body = el("div", "body");
    var badges = el("div", "badges");
    badges.appendChild(el("span", "rank", String(rank)));
    var label = E.labelOf(t);
    if (label) badges.appendChild(el("span", "badge " + badgeClass(label), label));   // 둘 다 3점 이하면 배지 없음
    if (t.pinned) badges.appendChild(el("span", "badge b-pin", E.LABEL_PIN));
    body.appendChild(badges);
    body.appendChild(el("div", "title", t.title));
    body.appendChild(el("div", "why", board.reason(t)));
    card.appendChild(body);
    card.appendChild(actions(t));
    return card;
  }
  function smallRow(t) {
    var row = el("article", "small");
    row.appendChild(el("span", "score", E.scoreOf(t) + "점"));
    var body = el("div", "body");
    body.appendChild(el("div", "title", t.title));
    body.appendChild(el("div", "why", "긴급 " + t.urgency + " · 중요 " + t.importance));
    row.appendChild(body);
    row.appendChild(actions(t));
    return row;
  }

  function render() {
    var top = board.top3(), wait = board.waiting();
    var topList = $("topList");
    topList.textContent = "";
    top.forEach(function (t, i) { topList.appendChild(topCard(t, i + 1)); });
    if (!board.tasks.length) {
      topList.appendChild(el("p", "empty", "아직 할 일이 없어요.\n위의 태그를 누르거나 직접 적고 '＋ 추가'를 눌러 보세요."));
      topList.lastChild.style.whiteSpace = "pre-line";
    }
    $("notice").textContent = board.tasks.length ? board.notice() : "";
    renderTags();
    var nd = board.tasks.filter(function (t) { return t.done; }).length;   // 정리 버튼은 항상 보이고, 완료 수를 알려 줌
    $("btnFinished").textContent = nd ? "완료한 일 정리 (" + nd + ")" : "완료한 일 정리";

    var waitList = $("waitList");
    waitList.textContent = "";
    wait.forEach(function (t) { waitList.appendChild(smallRow(t)); });
    $("waitSec").hidden = !wait.length;
    $("waitCount").textContent = wait.length ? wait.length + "개" : "";

    var p = board.progress();
    $("progText").textContent = p.total
      ? (p.pct === 100 ? "🎉 오늘의 3개를 모두 끝냈어요! " : "") + "완료율 " + p.pct + "% (" + p.done + "/" + p.total + "개 완료)"
      : "완료율 0% (아직 3개가 없어요)";
    $("fill").style.width = p.pct + "%";
    $("fill").className = "fill" + (p.pct === 100 ? " full" : "");
    $("bar").setAttribute("aria-valuenow", String(p.pct));
  }

  /* 자주 쓰는 할 일 태그: 누르면 입력창에 이름이 채워지고, 점수만 고르면 바로 추가 */
  var QUICK_TAGS = ["업무 메일·메신저 확인", "기획안·보고서 초안", "회의 자료 준비", "영수증·경비 처리",
    "병원·은행 용무", "운동·건강관리", "보고서 작성", "과제 제출", "공부·복습", "장보기·집안일"];
  function renderTags() {
    var box = $("tags"), used = {};
    board.tasks.forEach(function (t) { used[E.cleanTitle(t.title).toLowerCase()] = true; });
    box.textContent = "";
    QUICK_TAGS.forEach(function (name) {
      if (used[name.toLowerCase()]) return;          // 이미 목록에 있는 태그는 숨김
      var b = el("button", "", "#" + name);
      b.type = "button";
      b.setAttribute("data-tag", name);
      box.appendChild(b);
    });
    $("quickGuide").hidden = board.tasks.length > 0;  // 안내 문구는 처음(할 일 0개)에만
    if (!tagsTouched) setTags(board.tasks.length === 0);   // 처음(0개)엔 펼쳐 두고, 할 일이 생기면 접어 둠(버튼으로 언제든 열기)
  }
  var tagsTouched = false;
  function setTags(open) {
    $("tagPanel").hidden = !open;
    $("btnTags").setAttribute("aria-expanded", open ? "true" : "false");
  }
  var onTagsToggle = guarded(function () {
    tagsTouched = true;
    setTags($("tagPanel").hidden);
  });
  var onTag = guarded(function (ev) {
    var n = ev.target.closest ? ev.target.closest("[data-tag]") : null;
    if (!n) return;
    var input = $("title");
    input.value = n.getAttribute("data-tag");
    say("점수(긴급도·중요도)를 고르고 '＋ 추가'를 눌러 주세요.", "");
    input.focus();
  });

  function refocus(act, id) {   // 다시 그린 뒤에도 키보드 위치가 유지되도록
    try {
      var n = document.querySelector('[data-act="' + act + '"][data-id="' + id + '"]');
      if (n) n.focus({ preventScroll: true });
    } catch (e) { /* 무시 */ }
  }

  /* ───────── 동작 ───────── */
  function guarded(fn) {
    return function (ev) {
      try { return fn(ev); }
      catch (e) { say("작은 문제가 생겼지만 괜찮아요. 한 번 더 눌러 주세요.", "warn"); }
    };
  }
  function chosen(name) {
    var n = document.querySelector('input[name="' + name + '"]:checked');
    return n ? n.value : null;
  }
  function resetScores() {
    document.querySelector('input[name="urg"][value="3"]').checked = true;
    document.querySelector('input[name="imp"][value="3"]').checked = true;
  }

  var onAdd = guarded(function (ev) {
    ev.preventDefault();
    var input = $("title");
    var r = board.add(input.value, chosen("urg"), chosen("imp"));
    if (!r.ok) { say(r.msg, "bad"); input.focus(); return; }
    input.value = "";
    resetScores();
    save(); render();
    say("추가했어요!", "ok");
    input.focus();
  });

  function toggle(id) {
    var wasPinned = !!(board.get(id) || {}).pinned;
    board.toggleDone(id); save(); render(); refocus("toggle", id);
    var p = board.progress();
    if (p.total && p.done === p.total) say("🎉 오늘의 3개를 모두 끝냈어요! '완료한 일 정리'를 누르면 다음 3개를 보여 드려요.", "ok");
    else if (wasPinned && board.get(id) && board.get(id).done) say("고정한 일을 끝냈어요! 핀은 풀리고, 완료한 일은 취소선으로 남아요.", "ok");
    else say("", "");
  }
  var flashTimer = null;
  function flashNotice(text) {   // TOP 3 바로 위에도 잠깐 알려 줌(스크롤 후에도 보이도록)
    clearTimeout(flashTimer);
    $("notice").textContent = text;
    flashTimer = setTimeout(function () { $("notice").textContent = board.tasks.length ? board.notice() : ""; }, 3500);
  }
  function showTop() {   // 바뀐 순서를 바로 볼 수 있게 TOP 3 제목이 화면 위쪽에 오도록 이동
    try { $("topH").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* 무시 */ }
  }
  function pin(id) {
    var t = board.get(id); if (!t) return;
    var willPin = !t.pinned;
    board.setPin(id, willPin); save(); render(); refocus("pin", id);
    var m = willPin ? "📍 '" + t.title + "'을(를) 1순위로 고정했어요." : "고정을 풀었어요.";
    say(m, "ok");
    flashNotice(m);
    showTop();
  }
  function del(id) {
    var t = board.get(id); if (!t) return;
    lastRemoved = JSON.parse(JSON.stringify(t));
    board.remove(id); save(); render();
    say("삭제했어요.", "", undo);
  }
  function undo() {
    if (!lastRemoved) return;
    var t = lastRemoved; lastRemoved = null;
    if (!board.get(t.id) && board.tasks.length < E.MAX_TASKS) { board.tasks.push(t); save(); render(); say("되돌렸어요.", "ok"); }
  }

  var onList = guarded(function (ev) {
    var n = ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!n) return;
    var id = parseInt(n.getAttribute("data-id"), 10), act = n.getAttribute("data-act");
    if (ev.type === "change" && act === "toggle") toggle(id);
    else if (ev.type === "click" && act === "pin") pin(id);
    else if (ev.type === "click" && act === "del") del(id);
  });

  var onFinished = guarded(function () {
    var n = board.clearFinished();
    save(); render();
    say(n ? "완료한 일 " + n + "개를 정리했어요." : "정리할 완료한 일이 없어요.", n ? "ok" : "");
  });
  var onClear = guarded(function () {            // 실수 방지: 두 번 눌러야 지워짐(대화상자 없이)
    var b = $("btnClear");
    if (!board.tasks.length) { say("지울 할 일이 없어요.", ""); return; }
    if (b.className.indexOf("confirm") < 0) {
      b.className = "confirm"; b.textContent = "정말 지울까요? 한 번 더 누르세요";
      clearTimer = setTimeout(resetClear, 4000);
      return;
    }
    resetClear(); board.clearAll(); save(); render(); say("모두 지웠어요.", "");
  });
  function resetClear() {
    clearTimeout(clearTimer);
    var b = $("btnClear"); b.className = ""; b.textContent = "모두 지우기";
  }

  /* ───────── 시작 ───────── */
  function boot() {
    board = load();
    function on(id, type, fn) { var n = $(id); if (n) n.addEventListener(type, fn); }   // 요소가 없어도 나머지 버튼이 죽지 않게
    on("addForm", "submit", onAdd);
    on("topList", "click", onList);
    on("topList", "change", onList);
    on("waitList", "click", onList);
    on("tags", "click", onTag);
    on("btnTags", "click", onTagsToggle);
    on("btnFinished", "click", onFinished);
    on("btnClear", "click", onClear);
    render();

    // 어떤 오류가 나도 화면이 멈추거나 비지 않도록
    window.addEventListener("error", function () { say("작은 문제가 생겼지만 괜찮아요. 하던 내용은 그대로 있어요.", "warn"); });
    window.addEventListener("unhandledrejection", function () { say("작은 문제가 생겼지만 괜찮아요.", "warn"); });

    // 홈 화면에 추가했을 때 오프라인에서도 열리도록(https 또는 localhost에서만 동작)
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 실패해도 앱은 정상 */ });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
