/* 우선순위 엔진 (규칙 기반 계산만 함 — AI·네트워크 없음). 어떤 입력에도 예외를 내지 않는다. */
(function (root) {
  "use strict";

  var MAX_TASKS = 100, MAX_TITLE = 60, TOP_N = 3;
  var LABEL_URGENT = "🔥 최우선 즉시 실행";
  var LABEL_IMPORTANT = "⭐ 중요 핵심";
  var LABEL_MUST = "📌 오늘 필수";
  var LABEL_PIN = "📍 내가 고정";

  function cleanTitle(s) {
    if (typeof s !== "string") return "";
    try { s = s.normalize("NFC"); } catch (e) { /* 무시 */ }
    return s.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  }
  function lengthOf(s) { return Array.from(s).length; }   // 이모지도 1글자로 센다
  function fold(s) { return s.toLowerCase(); }

  /* 1~5 정수로 바꿀 수 있으면 정수, 아니면 null (불리언·소수·이상한 문자열은 null) */
  function scoreValue(v) {
    var n = null;
    if (typeof v === "boolean") return null;
    if (typeof v === "number") { if (Number.isInteger(v)) n = v; }
    else if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) n = parseInt(v, 10);
    return (n !== null && n >= 1 && n <= 5) ? n : null;
  }

  function labelOf(t) {
    if (t.urgency >= 4 && t.importance >= 4) return LABEL_URGENT;
    if (t.importance >= 4) return LABEL_IMPORTANT;
    if (t.urgency >= 4) return LABEL_MUST;
    return null;                                   // 둘 다 3점 이하: 배지 없이 점수만 표시
  }
  function scoreOf(t) { return t.urgency + t.importance; }

  function Board() {
    this.tasks = [];
    this._nextId = 1;
    this._nextSeq = 1;
  }

  Board.prototype.add = function (title, urgency, importance) {
    try {
      var t = cleanTitle(title);
      if (!t) return { ok: false, msg: "할 일 이름을 먼저 적어 주세요." };
      if (lengthOf(t) > MAX_TITLE) return { ok: false, msg: "이름이 너무 길어요. " + MAX_TITLE + "자 이내로 줄여 주세요." };
      var u = scoreValue(urgency), i = scoreValue(importance);
      if (u === null || i === null) return { ok: false, msg: "긴급도와 중요도를 1~5점 중에서 골라 주세요." };
      if (this.tasks.length >= MAX_TASKS) return { ok: false, msg: "후보가 너무 많아요(" + MAX_TASKS + "개까지). 끝난 일을 정리해 주세요." };
      var f = fold(t);
      for (var k = 0; k < this.tasks.length; k++) {
        if (fold(this.tasks[k].title) === f) return { ok: false, msg: "같은 이름의 할 일이 이미 있어요. 뒤에 숫자를 붙여 구분해 주세요 (예: " + t + " 2)" };
      }
      this.tasks.push({ id: this._nextId++, title: t, urgency: u, importance: i, done: false, pinned: false, seq: this._nextSeq++ });
      return { ok: true, msg: "" };
    } catch (e) {
      return { ok: false, msg: "추가하는 중 문제가 생겼어요. 다시 시도해 주세요." };
    }
  };

  Board.prototype.get = function (id) {
    for (var k = 0; k < this.tasks.length; k++) if (this.tasks[k].id === id) return this.tasks[k];
    return null;
  };
  Board.prototype.remove = function (id) {
    var t = this.get(id);
    if (!t) return false;
    this.tasks.splice(this.tasks.indexOf(t), 1);
    return true;
  };
  Board.prototype.toggleDone = function (id) {
    var t = this.get(id);
    if (!t) return null;
    t.done = !t.done;
    // 기획서: 핀 항목을 완료하면 핀은 해제되지만, 취소선 상태로 TOP 3 자리에 그대로 남는다
    if (t.done && t.pinned) { t.pinned = false; t.kept = true; }
    else if (!t.done) t.kept = false;
    return t.done;
  };
  /* 핀은 항상 1개만. on=true면 나머지 핀은 해제 */
  Board.prototype.setPin = function (id, on) {
    var t = this.get(id);
    if (!t) return false;
    if (on) this.tasks.forEach(function (x) { x.pinned = false; });
    t.pinned = !!on;
    return true;
  };
  Board.prototype.clearFinished = function () {
    var n = this.tasks.length;
    this.tasks = this.tasks.filter(function (t) { return !t.done; });
    return n - this.tasks.length;
  };
  Board.prototype.clearAll = function () { this.tasks = []; };

  /* 핀 항목 맨 앞(그 뒤에 완료된 옛 핀), 나머지는 점수 높은 순 → 긴급도 높은 순 → 먼저 입력한 순 */
  Board.prototype.ranked = function () {
    var pinned = this.tasks.filter(function (t) { return t.pinned; }).slice(0, 1);
    var kept = this.tasks.filter(function (t) { return t.kept && !t.pinned; }).sort(function (a, b) { return a.seq - b.seq; });
    var head = pinned.concat(kept);
    var rest = this.tasks.filter(function (t) { return head.indexOf(t) < 0; }).sort(function (a, b) {
      return (scoreOf(b) - scoreOf(a)) || (b.urgency - a.urgency) || (a.seq - b.seq);
    });
    return head.concat(rest);
  };
  Board.prototype.top3 = function () { return this.ranked().slice(0, TOP_N); };
  Board.prototype.waiting = function () { return this.ranked().slice(TOP_N); };

  /* {done, total, pct} — 퍼센트는 소수점 버림(0·33·66·100) */
  Board.prototype.progress = function () {
    var top = this.top3(), total = top.length;
    var done = top.filter(function (t) { return t.done; }).length;
    return { done: done, total: total, pct: total ? Math.floor(done * 100 / total) : 0 };
  };
  Board.prototype.reason = function (t) {
    var base = "긴급도 " + t.urgency + " + 중요도 " + t.importance + " = " + scoreOf(t) + "점";
    if (t.pinned) return "내가 직접 고정했어요 (" + base + ")";
    var order = this.ranked(), rank = order.indexOf(t) + 1;
    var text = rank ? base + "으로 " + rank + "번째예요" : base;
    // 동점이면 긴급도가 높은 쪽이 먼저 → 이유를 알려 준다(당장 급한 일부터 하도록 유도)
    var tied = order.some(function (o) {
      return o !== t && !o.pinned && scoreOf(o) === scoreOf(t) && o.urgency < t.urgency;
    });
    return tied ? text + " (같은 점수라 더 급한 일이 먼저)" : text;
  };
  Board.prototype.notice = function () {
    var n = this.tasks.length;
    if (n === 0) return "할 일을 하나씩 추가해 보세요. 점수가 높은 3개를 골라 드려요.";
    if (n < TOP_N) return "지금 " + n + "개예요. 후보를 더 넣으면 3개를 골라 드려요.";
    return "";
  };

  Board.prototype.toJSON = function () {
    return { tasks: this.tasks.map(function (t) {
      return { id: t.id, title: t.title, urgency: t.urgency, importance: t.importance, done: t.done, pinned: t.pinned, kept: !!t.kept, seq: t.seq };
    }) };
  };

  /* 깨진 데이터가 들어와도 예외 없이 빈/정상 보드를 돌려준다 */
  Board.fromJSON = function (d) {
    var b = new Board();
    try {
      var items = (d && typeof d === "object" && !Array.isArray(d)) ? d.tasks : null;
      if (!Array.isArray(items)) return b;
      var used = {}, maxId = 0, pinnedSeen = false;
      items.slice(0, MAX_TASKS).forEach(function (raw) {
        if (!raw || typeof raw !== "object") return;
        var title = cleanTitle(raw.title);
        title = Array.from(title).slice(0, MAX_TITLE).join("");
        var u = scoreValue(raw.urgency), i = scoreValue(raw.importance);
        if (!title || u === null || i === null) return;
        var f = fold(title);
        if (b.tasks.some(function (x) { return fold(x.title) === f; })) return;
        var id = raw.id;
        if (!(Number.isInteger(id) && id > 0) || used[id]) id = maxId + 1;
        used[id] = true;
        if (id > maxId) maxId = id;
        var pin = raw.pinned === true && !pinnedSeen;
        pinnedSeen = pinnedSeen || pin;
        b.tasks.push({ id: id, title: title, urgency: u, importance: i, done: raw.done === true, pinned: pin, kept: raw.kept === true && raw.done === true && !pin, seq: b._nextSeq++ });
      });
      b._nextId = maxId + 1;
    } catch (e) {
      return new Board();
    }
    return b;
  };

  var SAMPLE_TASKS = [
    ["내일 마감 과제·보고서 끝내기", 5, 5],
    ["병원·은행 예약 전화하기", 3, 5],
    ["공과금·카드값 납부하기", 4, 3],
    ["빨래·방 정리하기", 2, 2],
    ["장보고 저녁 준비하기", 3, 2]
  ];
  function fillSamples(board) {
    var n = 0;
    SAMPLE_TASKS.forEach(function (s) { if (board.add(s[0], s[1], s[2]).ok) n++; });
    return n;
  }

  var api = {
    Board: Board, fillSamples: fillSamples, labelOf: labelOf, scoreOf: scoreOf, cleanTitle: cleanTitle,
    LABEL_URGENT: LABEL_URGENT, LABEL_IMPORTANT: LABEL_IMPORTANT, LABEL_MUST: LABEL_MUST, LABEL_PIN: LABEL_PIN,
    MAX_TASKS: MAX_TASKS, MAX_TITLE: MAX_TITLE, TOP_N: TOP_N
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== "undefined" ? window : this);
