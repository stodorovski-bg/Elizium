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
var HEADERS = ['Дата', 'Блок', 'Вход', 'Апартамент', 'Име', 'Сума', 'Анонимно', 'Плащане'];

/** Връща (и при нужда създава) листа със записванията. */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
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
      // Прескачаме напълно празни редове
      if (!String(row[1]).trim() && !String(row[3]).trim()) continue;

      var amount = Number(row[5]) || 0;
      total += amount;
      count += 1;

      if (!isAnonymous_(row[6])) {
        participants.push({
          name: String(row[4] || '').trim() || 'Съсед',
          amount: amount,
          created_at: row[0]
        });
      }
    }

    participants.reverse(); // най-новите най-отгоре
    return jsonOut_({
      total_amount: total,
      participant_count: count,
      participants: participants
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

    var block     = String(data.block || '').trim();
    var entrance  = String(data.entrance || '').trim();
    var apartment = String(data.apartment || '').trim();
    var name      = String(data.name || '').trim();
    var amount    = Number(data.amount);
    var anonymous = data.is_anonymous === true;
    var payment   = data.payment_method;
    if (payment !== 'revolut' && payment !== 'cash') payment = '';

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
      anonymous ? 'да' : 'не', payment
    ]);

    return jsonOut_({ status: 'ok' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}
