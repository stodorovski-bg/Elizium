/* ============================================================================
   Elizium – Дарителска кампания · логика (Google Apps Script backend)
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.ELIZIUM_CONFIG || {};
  var CURRENCY = CFG.CURRENCY || "€";
  var GOAL = Number(CFG.GOAL_AMOUNT) || 0;
  var RECOMMENDED = Number(CFG.RECOMMENDED_AMOUNT) || 50;
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
      if (el) el.addEventListener("input", updateAptPreview);
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

    var pct = GOAL > 0 ? Math.min((total / GOAL) * 100, 100) : 0;
    var bar = $("#progress-bar");
    var label = $("#progress-label");
    var prog = $("#progress");
    if (bar) requestAnimationFrame(function () { bar.style.width = pct.toFixed(1) + "%"; });
    if (label) label.textContent = Math.round(pct) + "%";
    if (prog) prog.setAttribute("aria-valuenow", String(Math.round(pct)));
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
      avatar.textContent = r.kind === "apartment" ? "🏠" : initials(r.name);

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
      var display = (form.querySelector('input[name="display"]:checked') || {}).value || "apartment";

      if (!validate(data)) {
        showMessage("error", "Моля, попълнете задължителните полета (блок, апартамент и сума).");
        return;
      }

      // Ако избере да се показва с име, но не е въвел име
      if (visibility !== "anonymous" && (display === "name" || display === "both") && !data.name) {
        var nameEl = $("#f-name");
        if (nameEl) nameEl.classList.add("is-invalid");
        showMessage("error", "Моля, въведете име, за да се покаже в списъка — или изберете «Само апартамент».");
        return;
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
