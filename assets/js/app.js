/* ============================================================================
   Elizium – Дарителска кампания · логика (Google Apps Script backend)
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.ELIZIUM_CONFIG || {};
  var CURRENCY = CFG.CURRENCY || "€";
  var GOAL = Number(CFG.GOAL_AMOUNT) || 0;
  var RECOMMENDED = Number(CFG.RECOMMENDED_AMOUNT) || 50;
  var CONFIRM_ABOVE = Number(CFG.CONFIRM_ABOVE);
  if (!isFinite(CONFIRM_ABOVE) || CONFIRM_ABOVE < 0) CONFIRM_ABOVE = 100;
  // BLOCKS може да е масив (само блокове) или обект { блок: [входове] }
  var BLOCK_LIST, ENTRANCES_BY_BLOCK;
  if (Array.isArray(CFG.BLOCKS)) {
    BLOCK_LIST = CFG.BLOCKS.map(String);
    ENTRANCES_BY_BLOCK = {};
  } else if (CFG.BLOCKS && typeof CFG.BLOCKS === "object") {
    BLOCK_LIST = Object.keys(CFG.BLOCKS);
    ENTRANCES_BY_BLOCK = CFG.BLOCKS;
  } else {
    BLOCK_LIST = [];
    ENTRANCES_BY_BLOCK = {};
  }
  var API = CFG.APPS_SCRIPT_URL || "";

  var configured = !!API;

  // ------------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtMoney(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString("bg-BG") + " " + CURRENCY;
  }

  function fmtNumber(n) {
    return (Math.round(Number(n) || 0)).toLocaleString("bg-BG");
  }

  // Съставя етикет за апартамента: блок/вход/апартамент (само непразните части)
  function aptLabel(block, entrance, apartment) {
    return [block, entrance, apartment]
      .map(function (s) { return String(s || "").trim(); })
      .filter(function (s) { return s !== ""; })
      .join("/");
  }

  function animateCount(el, to, formatter) {
    if (!el) return;
    // Токен: ако стартира нова анимация (или директно се зададе стойност),
    // старата се отменя, за да не презаписва по-новата стойност.
    var token = (el._animToken || 0) + 1;
    el._animToken = token;
    var from = 0;
    var start = null;
    var dur = 1100;
    function step(ts) {
      if (el._animToken !== token) return; // отменена
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Задава стойност директно и отменя всяка текуща анимация за елемента
  function setCountNow(el, value) {
    if (!el) return;
    el._animToken = (el._animToken || 0) + 1;
    el.textContent = fmtNumber(value);
  }

  // ------------------------------------------------------------------ init UI
  function initStaticText() {
    // Попълваме валидните блокове в падащото меню
    var blockSelect = $("#f-block");
    if (blockSelect && BLOCK_LIST.length) {
      BLOCK_LIST.forEach(function (b) {
        var opt = document.createElement("option");
        opt.value = String(b);
        opt.textContent = String(b);
        blockSelect.appendChild(opt);
      });
    }
    refreshEntranceOptions();

    var amountLabel = $('label[for="f-amount"]');
    if (amountLabel) amountLabel.innerHTML = amountLabel.innerHTML.replace("{{CURRENCY}}", CURRENCY);

    var hint = $("#hint-recommended");
    if (hint) hint.textContent = fmtMoney(RECOMMENDED);

    var amountInput = $("#f-amount");
    if (amountInput && !amountInput.value) amountInput.value = RECOMMENDED;
    syncChips();

    var goalEl = $("#stat-goal");
    if (goalEl) goalEl.textContent = GOAL ? fmtMoney(GOAL) : "—";

    var curEl = $("#stat-currency");
    if (curEl) curEl.textContent = CURRENCY;

    if (CFG.CONTACT_TEXT) {
      var fc = $("#footer-contact");
      if (fc) { fc.textContent = CFG.CONTACT_TEXT; fc.hidden = false; }
    }
  }

  // Обновява входовете според избрания блок (каскадно падащо меню)
  function refreshEntranceOptions() {
    var blockSel = $("#f-block");
    var entSel = $("#f-entrance");
    if (!blockSel || !entSel) return;

    var block = blockSel.value;
    var list = ENTRANCES_BY_BLOCK[block] || [];

    entSel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = block ? "Изберете" : "Първо блок";
    entSel.appendChild(ph);

    list.forEach(function (en) {
      var opt = document.createElement("option");
      opt.value = String(en);
      opt.textContent = String(en);
      entSel.appendChild(opt);
    });

    entSel.disabled = !block || !list.length;
    entSel.classList.remove("is-invalid");
  }

  // --------------------------------------------------------------- amount chips
  function syncChips() {
    var amountInput = $("#f-amount");
    var val = amountInput ? String(parseInt(amountInput.value, 10)) : "";
    $all(".chip").forEach(function (chip) {
      chip.classList.toggle("is-active", chip.getAttribute("data-amount") === val);
    });
  }

  function initChips() {
    $all(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var amountInput = $("#f-amount");
        if (amountInput) {
          amountInput.value = chip.getAttribute("data-amount");
          amountInput.classList.remove("is-invalid");
        }
        syncChips();
      });
    });
    var amountInput = $("#f-amount");
    if (amountInput) amountInput.addEventListener("input", syncChips);
  }

  // ------------------------------------------------------- display sub-options
  function currentAptLabel() {
    return aptLabel(
      $("#f-block") ? $("#f-block").value : "",
      $("#f-entrance") ? $("#f-entrance").value : "",
      $("#f-apartment") ? $("#f-apartment").value : ""
    );
  }

  function updateAptPreview() {
    var el = $("#display-apt-preview");
    if (!el) return;
    var label = currentAptLabel();
    el.textContent = label ? "(напр. " + label + ")" : "";
  }

  function toggleDisplayOptions() {
    var box = $("#display-options");
    if (!box) return;
    var isPublic = (document.querySelector('input[name="visibility"]:checked') || {}).value !== "anonymous";
    box.hidden = !isPublic;
  }

  function initDisplayOptions() {
    ["f-block", "f-entrance", "f-apartment"].forEach(function (id) {
      var el = $("#" + id);
      if (el) {
        el.addEventListener("input", updateAptPreview);
        el.addEventListener("change", updateAptPreview);
      }
    });
    // При смяна на блок обновяваме входовете (каскадно)
    var blockSel = $("#f-block");
    if (blockSel) blockSel.addEventListener("change", function () {
      refreshEntranceOptions();
      updateAptPreview();
    });
    $all('input[name="visibility"]').forEach(function (r) {
      r.addEventListener("change", toggleDisplayOptions);
    });
    updateAptPreview();
    toggleDisplayOptions();
  }

  // ----------------------------------------------------------------- stats load
  function renderStats(total, count) {
    total = Number(total) || 0;
    count = Number(count) || 0;

    animateCount($("#stat-total"), total, function (n) { return fmtNumber(n); });
    animateCount($("#stat-count"), count, function (n) { return fmtNumber(n); });

    var avg = count > 0 ? total / count : 0;
    animateCount($("#stat-avg"), avg, function (n) { return fmtMoney(n); });

    var remaining = Math.max(GOAL - total, 0);
    animateCount($("#stat-remaining"), remaining, function (n) { return fmtMoney(n); });

    var bar = $("#progress-bar");
    var overflowBar = $("#progress-overflow");
    var label = $("#progress-label");
    var prog = $("#progress");
    var overflowText = $("#stat-overflow");

    // При надхвърляне на целта лентата се разделя: зелено = целта, синьо = излишъкът
    var pctOfGoal = 0, greenPct = 0, bluePct = 0;
    if (GOAL > 0) {
      pctOfGoal = (total / GOAL) * 100;
      if (total > GOAL) {
        greenPct = (GOAL / total) * 100;
        bluePct = 100 - greenPct;
      } else {
        greenPct = pctOfGoal;
        bluePct = 0;
      }
    }

    if (bar) requestAnimationFrame(function () { bar.style.width = greenPct.toFixed(1) + "%"; });
    if (overflowBar) requestAnimationFrame(function () { overflowBar.style.width = bluePct.toFixed(1) + "%"; });
    if (label) label.textContent = Math.round(pctOfGoal) + "%";
    if (prog) prog.setAttribute("aria-valuenow", String(Math.min(100, Math.round(pctOfGoal))));

    if (overflowText) {
      if (total > GOAL) {
        overflowText.textContent = "+ " + fmtMoney(total - GOAL) + " над целта";
        overflowText.hidden = false;
      } else {
        overflowText.hidden = true;
      }
    }
  }

  // --------------------------------------------------------------- reactions
  var VOTE_KEY = "elizium_reaction_v1";
  var reactionCounts = { against: 0, neutral: 0, participants: 0 };

  function renderReactions(reactions, participantCount) {
    reactions = reactions || {};
    reactionCounts.against = Number(reactions.against) || 0;
    reactionCounts.neutral = Number(reactions.neutral) || 0;
    reactionCounts.participants = Number(participantCount) || 0;
    animateCount($("#react-participants"), reactionCounts.participants, function (n) { return fmtNumber(n); });
    animateCount($("#react-neutral"), reactionCounts.neutral, function (n) { return fmtNumber(n); });
    animateCount($("#react-against"), reactionCounts.against, function (n) { return fmtNumber(n); });
  }

  function markVoted(type) {
    $all(".reaction__btn").forEach(function (b) {
      b.disabled = true;
      if (b.getAttribute("data-vote") === type) b.classList.add("is-chosen");
    });
    var note = $("#reactions-note");
    if (note) note.hidden = false;
  }

  function castVote(type) {
    if (type !== "against" && type !== "neutral") return;
    var already = null;
    try { already = localStorage.getItem(VOTE_KEY); } catch (e) {}
    if (already) return; // от този браузър вече е гласувано
    try { localStorage.setItem(VOTE_KEY, type); } catch (e) {}

    // Оптимистично обновяване на брояча (отменя текуща анимация)
    reactionCounts[type] = (reactionCounts[type] || 0) + 1;
    setCountNow($(type === "against" ? "#react-against" : "#react-neutral"), reactionCounts[type]);
    markVoted(type);

    if (!configured) return;
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "vote", vote_type: type }),
    }).catch(function (err) { console.error("Грешка при гласуване:", err); });
  }

  function initReactions() {
    $all(".reaction__btn").forEach(function (b) {
      b.addEventListener("click", function () { castVote(b.getAttribute("data-vote")); });
    });
    var voted = null;
    try { voted = localStorage.getItem(VOTE_KEY); } catch (e) {}
    if (voted) markVoted(voted);
  }

  function initials(name) {
    var parts = String(name).trim().split(/\s+/).filter(function (w) {
      return /^\p{L}/u.test(w); // само думи, започващи с буква (пропуска „·", числа и т.н.)
    });
    var s = (parts[0] ? parts[0][0] : "") + (parts[1] ? parts[1][0] : "");
    return (s || "•").toUpperCase();
  }

  function renderParticipants(rows) {
    var list = $("#participants-list");
    var empty = $("#participants-empty");
    if (!list) return;

    if (!rows || !rows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.remove();

    rows.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "participants__item";

      var nameWrap = document.createElement("span");
      nameWrap.className = "participants__name";

      var avatar = document.createElement("span");
      avatar.className = "participants__avatar";
      avatar.textContent = r.kind === "anonymous" ? "👤"
        : (r.kind === "apartment" ? "🏠" : initials(r.name));

      var nameText = document.createElement("span");
      nameText.textContent = r.name;

      nameWrap.appendChild(avatar);
      nameWrap.appendChild(nameText);

      var amount = document.createElement("span");
      amount.className = "participants__amount";
      if (r.amount === null || r.amount === undefined) {
        amount.textContent = "—";
        amount.classList.add("participants__amount--hidden");
      } else {
        amount.textContent = fmtMoney(r.amount);
      }

      li.appendChild(nameWrap);
      li.appendChild(amount);
      list.appendChild(li);
    });
  }

  function loadData() {
    if (!configured) return;

    fetch(API, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.status === "error") {
          console.error("Грешка при зареждане:", d && d.message);
          return;
        }
        renderStats(d.total_amount, d.participant_count);
        renderParticipants(d.participants || []);
        renderReactions(d.reactions, d.participant_count);
      })
      .catch(function (err) {
        console.error("Няма връзка при зареждане:", err);
      });
  }

  // -------------------------------------------------------------------- message
  function showMessage(kind, text) {
    var box = $("#form-message");
    if (!box) return;
    box.className = "form__message show is-" + kind;
    box.textContent = text;
  }
  function clearMessage() {
    var box = $("#form-message");
    if (box) { box.className = "form__message"; box.textContent = ""; }
  }

  // ---------------------------------------------------------------- form submit
  function validate(data) {
    var invalid = [];
    if (!data.block) invalid.push("f-block");
    if (!data.entrance) invalid.push("f-entrance");
    if (!data.apartment) invalid.push("f-apartment");
    if (!(data.amount > 0)) invalid.push("f-amount");

    $all(".is-invalid").forEach(function (el) { el.classList.remove("is-invalid"); });
    invalid.forEach(function (id) { var el = $("#" + id); if (el) el.classList.add("is-invalid"); });
    return invalid.length === 0;
  }

  function initForm() {
    var form = $("#pledge-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearMessage();

      var data = {
        block: $("#f-block").value.trim(),
        entrance: $("#f-entrance").value.trim(),
        apartment: $("#f-apartment").value.trim(),
        name: $("#f-name").value.trim(),
        amount: parseFloat($("#f-amount").value),
      };
      var visibility = (form.querySelector('input[name="visibility"]:checked') || {}).value || "public";
      var payment = (form.querySelector('input[name="payment"]:checked') || {}).value || null;
      var cName = $("#f-show-name") ? $("#f-show-name").checked : true;
      var cApt = $("#f-show-apartment") ? $("#f-show-apartment").checked : true;
      var showAmount = $("#f-show-amount") ? $("#f-show-amount").checked : true;
      var display = (cName && cApt) ? "both" : cName ? "name" : cApt ? "apartment" : "none";

      if (!validate(data)) {
        showMessage("error", "Моля, попълнете задължителните полета (блок, вход, апартамент и сума).");
        return;
      }

      // Ако е избрано да се показва само име (без апартамент), но няма въведено име
      if (visibility !== "anonymous" && display === "name" && !data.name) {
        var nameEl = $("#f-name");
        if (nameEl) nameEl.classList.add("is-invalid");
        showMessage("error", "Моля, въведете име — или отметнете и «Блок, вход и апартамент».");
        return;
      }

      // Потвърждение при по-голяма сума – предпазва от случайно въвеждане
      if (data.amount > CONFIRM_ABOVE) {
        var confirmed = window.confirm(
          "Въвеждате сума от " + fmtMoney(data.amount) + ".\n\n" +
          "Сигурни ли сте, че сумата е правилна?"
        );
        if (!confirmed) {
          var amtEl = $("#f-amount");
          if (amtEl) amtEl.focus();
          return;
        }
      }

      if (!configured) {
        showMessage("warn", "Порталът още не е свързан с база данни. Записването ще е достъпно след настройка (виж README.md).");
        return;
      }

      var btn = $("#submit-btn");
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = "Записване…";

      // Изпращаме като text/plain, за да избегнем CORS preflight към Apps Script
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          block: data.block,
          entrance: data.entrance,
          apartment: data.apartment,
          name: data.name,
          amount: data.amount,
          is_anonymous: visibility === "anonymous",
          display: display,
          show_amount: showAmount,
          payment_method: payment,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          btn.disabled = false;
          btn.textContent = original;
          result = result || {};

          if (result.status === "ok") {
            showMessage("ok", "Благодарим! Записването Ви е успешно. ⚽");
            form.reset();
            $("#f-amount").value = RECOMMENDED;
            syncChips();
            refreshEntranceOptions();
            updateAptPreview();
            toggleDisplayOptions();
            reloadAll();
            var stats = $("#статистика");
            if (stats) stats.scrollIntoView({ behavior: "smooth", block: "start" });
          } else if (result.status === "duplicate") {
            showMessage("warn", result.message || "Този апартамент вече е регистриран в кампанията.");
          } else {
            showMessage("error", result.message || "Данните не са валидни. Моля, проверете полетата.");
          }
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = original;
          console.error(err);
          showMessage("error", "Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.");
        });
    });
  }

  function reloadAll() {
    var list = $("#participants-list");
    if (list) list.innerHTML = "";
    loadData();
  }

  // ---------------------------------------------------------------------- boot
  function boot() {
    initStaticText();
    initChips();
    initDisplayOptions();
    initReactions();
    initForm();

    if (configured) {
      loadData();
    } else {
      renderStats(0, 0);
      var banner = $("#setup-banner");
      if (banner) banner.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
