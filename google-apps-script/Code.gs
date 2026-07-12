/**
 * Elizium – Дарителска кампания · Google Apps Script backend
 * ---------------------------------------------------------------------------
 * Записва данните от портала в Google Таблица и връща обобщена статистика
 * и списък на неанонимните участници.
 *
 * ИНСТАЛИРАНЕ (стъпка по стъпка):
 *   1. Създайте нова Google Таблица (sheets.new).
 *   2. От менюто: Разширения (Extensions) → Apps Script.
 *   3. Изтрийте примерния код и поставете ЦЕЛИЯ този файл.
 *   4. Запишете (иконата 💾).
 *   5. Внедряване (Deploy) → Ново внедряване (New deployment).
 *        - Тип (Type): Уеб приложение (Web app)
 *        - Изпълнение като (Execute as): Аз (Me)
 *        - Кой има достъп (Who has access): Всеки (Anyone)
 *   6. Копирайте показания "Web app URL" и го поставете в
 *      assets/js/config.js  →  APPS_SCRIPT_URL
 *
 * ВАЖНО ЗА ПОВЕРИТЕЛНОСТТА:
 *   Анонимните записи НЕ се връщат в публичния списък – скриптът филтрира
 *   само неанонимните участници. НЕ използвайте "Публикуване в интернет"
 *   на самата таблица, защото това би направило всички данни видими.
 */

var SHEET_NAME = 'Записвания';
var HEADERS = ['Дата', 'Блок', 'Вход', 'Апартамент', 'Име', 'Сума', 'Анонимно', 'Плащане', 'Показване', 'Сума видима'];

// Броячи за реакциите (в листа „Записвания"):
//   K2 = „Не искам да участвам" (neutral), L2 = „Не подкрепям" (against)
var CELL_NEUTRAL = 'K2';
var CELL_AGAINST = 'L2';

/** Връща (и при нужда създава) листа със записванията. */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  // Поддържаме заглавния ред актуален (напр. при добавена нова колона)
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Броячи за реакциите – етикети (K1/L1) и начални стойности (K2/L2)
  if (sheet.getRange('K1').getValue() === '') sheet.getRange('K1').setValue('Не искам да участвам').setFontWeight('bold');
  if (sheet.getRange('L1').getValue() === '') sheet.getRange('L1').setValue('Не подкрепям').setFontWeight('bold');
  if (sheet.getRange(CELL_NEUTRAL).getValue() === '') sheet.getRange(CELL_NEUTRAL).setValue(0);
  if (sheet.getRange(CELL_AGAINST).getValue() === '') sheet.getRange(CELL_AGAINST).setValue(0);

  return sheet;
}

/** Съставя етикет за апартамента: блок/вход/апартамент (само непразните части). */
function aptLabel_(block, entrance, apartment) {
  return [block, entrance, apartment]
    .map(function (s) { return String(s || '').trim(); })
    .filter(function (s) { return s !== ''; })
    .join('/');
}

/** Отговор в JSON формат. */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAnonymous_(val) {
  if (val === true) return true;
  var s = String(val).trim().toLowerCase();
  return s === 'да' || s === 'true' || s === 'yes' || s === '1';
}

/** GET – връща обобщена статистика и неанонимните участници. */
function doGet(e) {
  try {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var total = 0, count = 0, participants = [];

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      // Броим само истински записи: сумата трябва да е валидно число > 0.
      // Така прескачаме заглавни, празни или ръчно объркани редове.
      var amount = Number(row[5]);
      if (!isFinite(amount) || amount <= 0) continue;

      total += amount;
      count += 1;

      // Дали сумата да се показва публично (по подразбиране – да)
      var showAmt = String(row[9] || '').trim().toLowerCase();
      var shownAmount = (showAmt === 'не' || showAmt === 'no' || showAmt === 'false' || showAmt === '0')
        ? null : amount;

      if (isAnonymous_(row[6])) {
        // Анонимен участник: само етикет (без име/апартамент)
        participants.push({
          name: 'Анонимен/на',
          kind: 'anonymous',
          amount: shownAmount,
          created_at: row[0]
        });
      } else {
        var name = String(row[4] || '').trim();
        var apt = aptLabel_(row[1], row[2], row[3]);
        var display = String(row[8] || '').trim().toLowerCase();

        // Обратна съвместимост: ако липсва избор, показваме каквото има.
        if (['name', 'apartment', 'both', 'none'].indexOf(display) === -1) {
          display = name ? 'both' : 'apartment';
        }

        var wantName = (display === 'name' || display === 'both');
        var wantApt  = (display === 'apartment' || display === 'both');

        var parts = [];
        if (wantName && name) parts.push(name);
        if (wantApt && apt) parts.push(apt);

        var label = parts.join(' · ') || 'Съсед';
        var kind = (wantName && name) ? 'name' : 'apartment';

        participants.push({
          name: label,
          kind: kind,
          amount: shownAmount,
          created_at: row[0]
        });
      }
    }

    participants.reverse(); // най-новите най-отгоре

    // Броячи за реакциите (клетки K2/L2 в листа „Записвания")
    var neutral = Number(sheet.getRange(CELL_NEUTRAL).getValue()) || 0;
    var against = Number(sheet.getRange(CELL_AGAINST).getValue()) || 0;

    return jsonOut_({
      total_amount: total,
      participant_count: count,
      participants: participants,
      reactions: { against: against, neutral: neutral }
    });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

/** POST – записва ново участие с проверка за дублиран апартамент. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Заключваме, за да няма два едновременни записа за един апартамент
    lock.waitLock(20000);
  } catch (err) {
    return jsonOut_({ status: 'error', message: 'Сървърът е зает. Моля, опитайте отново.' });
  }

  try {
    var data = JSON.parse(e.postData.contents);

    // Гласуване за реакция (Не подкрепям / Не искам да участвам)
    if (data.action === 'vote') {
      var vtype = String(data.vote_type || '').trim().toLowerCase();
      if (vtype !== 'against' && vtype !== 'neutral') {
        return jsonOut_({ status: 'error', message: 'Невалиден тип реакция.' });
      }
      var vsheet = getSheet_();
      var vcell = (vtype === 'neutral') ? CELL_NEUTRAL : CELL_AGAINST;
      var cur = Number(vsheet.getRange(vcell).getValue()) || 0;
      vsheet.getRange(vcell).setValue(cur + 1);
      return jsonOut_({ status: 'ok' });
    }

    var block     = String(data.block || '').trim();
    var entrance  = String(data.entrance || '').trim();
    var apartment = String(data.apartment || '').trim();
    var name      = String(data.name || '').trim();
    var amount    = Number(data.amount);
    var anonymous = data.is_anonymous === true;
    var payment   = data.payment_method;
    if (payment !== 'revolut' && payment !== 'cash') payment = '';
    var display   = String(data.display || '').trim().toLowerCase();
    if (['name', 'apartment', 'both', 'none'].indexOf(display) === -1) display = 'both';
    var showAmount = data.show_amount !== false; // по подразбиране видима

    if (!block || !entrance || !apartment) {
      return jsonOut_({ status: 'error', message: 'Моля, попълнете блок, вход и апартамент.' });
    }
    if (!(amount > 0)) {
      return jsonOut_({ status: 'error', message: 'Моля, въведете валидна сума.' });
    }

    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();

    // Проверка за вече регистриран апартамент (без значение главни/малки букви)
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (String(row[1]).trim().toLowerCase() === block.toLowerCase() &&
          String(row[2]).trim().toLowerCase() === entrance.toLowerCase() &&
          String(row[3]).trim().toLowerCase() === apartment.toLowerCase()) {
        return jsonOut_({
          status: 'duplicate',
          message: 'Този апартамент вече е регистриран в кампанията.'
        });
      }
    }

    sheet.appendRow([
      new Date(), block, entrance, apartment, name, amount,
      anonymous ? 'да' : 'не', payment, display, showAmount ? 'да' : 'не'
    ]);

    return jsonOut_({ status: 'ok' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}
