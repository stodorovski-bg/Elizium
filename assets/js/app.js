/* ============================================================================
   Elizium – Дарителска кампания · логика
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.ELIZIUM_CONFIG || {};
  var CURRENCY = CFG.CURRENCY || "€";
  var GOAL = Number(CFG.GOAL_AMOUNT) || 0;
  var RECOMMENDED = Number(CFG.RECOMMENDED_AMOUNT) || 50;

  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var sb = null;

  // ------------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtMoney(n) {
    n = Math.round(Number(n) || 0);
    // Разделител за хиляди: интервал (bg локал)
    return n.toLocaleString("bg-BG") + " " + CURRENCY;
  }

  function fmtNumber(n) {
    return (Math.round(Number(n) || 0)).toLocaleString("bg-BG");
  }

  function animateCount(el, to, formatter) {
    if (!el) return;
    var from = 0;
    var start = null;
    var dur = 1100;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ init UI
  function initStaticText() {
    // Замяна на {{CURRENCY}} в етикета за сумата
    var amountLabel = $('label[for="f-amount"]');
    if (amountLabel) amountLabel.innerHTML = amountLabel.innerHTML.replace("{{CURRENCY}}", CURRENCY);

    // Препоръчителна сума
    var hint = $("#hint-recommended");
    if (hint) hint.textContent = fmtMoney(RECOMMENDED);

    var amountInput = $("#f-amount");
    if (amountInput && !amountInput.value) amountInput.value = RECOMMENDED;
    syncChips();

    // Цел
    var goalEl = $("#stat-goal");
    if (goalEl) goalEl.textContent = GOAL ? fmtMoney(GOAL) : "—";

    var curEl = $("#stat-currency");
    if (curEl) curEl.textContent = CURRENCY;

    // Контакт във футъра
    if (CFG.CONTACT_TEXT) {
      var fc = $("#footer-contact");
      if (fc) { fc.textContent = CFG.CONTACT_TEXT; fc.hidden = false; }
    }
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

    var pct = GOAL > 0 ? Math.min((total / GOAL) * 100, 100) : 0;
    var bar = $("#progress-bar");
    var label = $("#progress-label");
    var prog = $("#progress");
    if (bar) requestAnimationFrame(function () { bar.style.width = pct.toFixed(1) + "%"; });
    if (label) label.textContent = Math.round(pct) + "%";
    if (prog) prog.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
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
      avatar.textContent = initials(r.name);

      var nameText = document.createElement("span");
      nameText.textContent = r.name;

      nameWrap.appendChild(avatar);
      nameWrap.appendChild(nameText);

      var amount = document.createElement("span");
      amount.className = "participants__amount";
      amount.textContent = fmtMoney(r.amount);

      li.appendChild(nameWrap);
      li.appendChild(amount);
      list.appendChild(li);
    });
  }

  function loadData() {
    if (!sb) return;

    sb.rpc("get_campaign_stats").then(function (res) {
      if (res.error) { console.error("stats:", res.error); return; }
      var d = res.data || {};
      renderStats(d.total_amount, d.participant_count);
    });

    sb.rpc("get_public_pledges").then(function (res) {
      if (res.error) { console.error("participants:", res.error); return; }
      renderParticipants(res.data || []);
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

      if (!validate(data)) {
        showMessage("error", "Моля, попълнете задължителните полета (блок, вход, апартамент и сума).");
        return;
      }

      if (!configured || !sb) {
        showMessage("warn", "Порталът още не е свързан с база данни. Записването ще е достъпно след настройка (виж README.md).");
        return;
      }

      var btn = $("#submit-btn");
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = "Записване…";

      sb.rpc("register_pledge", {
        p_block: data.block,
        p_entrance: data.entrance,
        p_apartment: data.apartment,
        p_name: data.name,
        p_amount: data.amount,
        p_is_anonymous: visibility === "anonymous",
        p_payment_method: payment,
      }).then(function (res) {
        btn.disabled = false;
        btn.textContent = original;

        if (res.error) {
          console.error(res.error);
          showMessage("error", "Възникна грешка при записването. Моля, опитайте отново.");
          return;
        }

        var result = res.data || {};
        if (result.status === "ok") {
          showMessage("ok", "Благодарим! Записването Ви е успешно. ⚽");
          form.reset();
          $("#f-amount").value = RECOMMENDED;
          syncChips();
          // Презареждаме статистиката и списъка
          reloadAll();
          // Плавно скролваме към статистиката
          var stats = $("#статистика");
          if (stats) stats.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (result.status === "duplicate") {
          showMessage("warn", result.message || "Този апартамент вече е регистриран в кампанията.");
        } else {
          showMessage("error", result.message || "Данните не са валидни. Моля, проверете полетата.");
        }
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = original;
        console.error(err);
        showMessage("error", "Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.");
      });
    });
  }

  function reloadAll() {
    // Изчистваме списъка преди презареждане
    var list = $("#participants-list");
    if (list) list.innerHTML = "";
    loadData();
  }

  // ---------------------------------------------------------------------- boot
  function boot() {
    initStaticText();
    initChips();
    initForm();

    if (configured && window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      loadData();
    } else {
      // Показваме банер за настройка и нулева статистика
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
