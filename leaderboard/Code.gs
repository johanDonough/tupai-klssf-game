/**
 * Tupai Nutty Hero: booth leaderboard on a Google Sheet.
 *
 * Lives inside the Google Sheet (Extensions > Apps Script) and is deployed as a web app.
 * The game calls it for two things: the leaderboard, and a score at the end of a run.
 * The Sheet itself is never shared publicly. Only this script reads and writes it.
 * The game carries on without it: if this is unreachable, the player just sees their own best.
 * Each difficulty (Junior / Tupai / Tupai Hero) has its own board. Scores posted before
 * difficulties existed have no level and count as Tupai Hero (hard), the only level then.
 *
 * First-time setup is in leaderboard/SETUP.md.
 */

var TZ = 'Asia/Kuala_Lumpur';
var TAB = { SCORES: 'Scores', BLOCKED: 'Blocked words' };
var HEAD = ['Played (MYT)', 'Day', 'Name', 'Score', 'Wave', 'Won', 'Maths right', 'Maths asked', 'Hide', 'Run', 'Timestamp (ISO)', 'Level'];
var COL = { WHEN: 1, DAY: 2, NAME: 3, SCORE: 4, WAVE: 5, WON: 6, RIGHT: 7, ASKED: 8, HIDE: 9, RUN: 10, ISO: 11, LEVEL: 12 };
var FORMATS = ['@', '@', '@', '0', '0', '@', '0', '0', '@', '@', '@', '@'];
var LEVELS = ['easy', 'normal', 'hard'];

var BOARD_SIZE = 20;        // rows shown for today and for the weekend
var NAME_MAX = 12;
var WAVES = 15;
var BOARD_CACHE_S = 15;     // the board is worked out at most every 15 seconds
var BLOCKED_CACHE_S = 60;

// The starting list for the "Blocked words" tab. Staff can add to it in the Sheet at any time.
// "anywhere" blocks the word inside a longer name; "whole word" only blocks it on its own,
// for short words that sit inside ordinary names (Dickson, Mashitah, Sohail, Nazir, Abdallah).
// Names are checked with look-alike digits and symbols turned into letters (5h1t, @ss) and
// with repeated letters allowed (fuuuck). A word added later also hides old scores with it.
var BLOCKED = [
  // English
  ['fuck', 'anywhere'], ['phuck', 'anywhere'], ['fuk', 'whole word'], ['fck', 'whole word'], ['fk', 'whole word'],
  ['fuq', 'whole word'], ['wtf', 'whole word'], ['stfu', 'whole word'],
  ['shit', 'whole word'], ['bullshit', 'anywhere'], ['shithead', 'anywhere'],
  ['cunt', 'anywhere'], ['bitch', 'anywhere'], ['biatch', 'anywhere'], ['bastard', 'anywhere'],
  ['asshole', 'anywhere'], ['arsehole', 'anywhere'], ['ass', 'whole word'], ['arse', 'whole word'],
  ['dick', 'whole word'], ['dickhead', 'anywhere'], ['cock', 'whole word'], ['pussy', 'anywhere'],
  ['penis', 'anywhere'], ['vagina', 'anywhere'], ['boobs', 'anywhere'], ['tits', 'anywhere'],
  ['whore', 'anywhere'], ['slut', 'anywhere'], ['hoe', 'whole word'], ['sex', 'whole word'], ['sexy', 'anywhere'],
  ['porn', 'anywhere'], ['horny', 'anywhere'], ['nude', 'anywhere'], ['dildo', 'anywhere'], ['jizz', 'anywhere'],
  ['cum', 'whole word'], ['anal', 'whole word'], ['blowjob', 'anywhere'], ['handjob', 'anywhere'],
  ['wank', 'whole word'], ['wanker', 'anywhere'], ['twat', 'anywhere'], ['piss', 'anywhere'],
  ['rape', 'whole word'], ['rapist', 'anywhere'], ['fag', 'whole word'], ['faggot', 'anywhere'],
  ['nigger', 'anywhere'], ['nigga', 'anywhere'], ['negro', 'anywhere'], ['chink', 'anywhere'], ['paki', 'whole word'],
  ['retard', 'anywhere'], ['nazi', 'whole word'], ['hitler', 'anywhere'], ['kkk', 'whole word'],
  // Malay
  ['babi', 'anywhere'], ['bodoh', 'anywhere'], ['bodo', 'whole word'], ['bangang', 'anywhere'], ['bengap', 'anywhere'],
  ['sial', 'whole word'], ['celaka', 'anywhere'], ['bangsat', 'anywhere'], ['keparat', 'anywhere'],
  ['haramjadah', 'anywhere'], ['laknat', 'anywhere'], ['lahanat', 'anywhere'], ['sundal', 'anywhere'],
  ['pelacur', 'anywhere'], ['jalang', 'anywhere'], ['pukimak', 'anywhere'], ['puki', 'whole word'],
  ['pantat', 'anywhere'], ['butoh', 'anywhere'], ['burit', 'anywhere'], ['pepek', 'anywhere'], ['jubur', 'anywhere'],
  ['konek', 'whole word'], ['kote', 'whole word'], ['tetek', 'anywhere'], ['kongkek', 'anywhere'],
  ['kimak', 'anywhere'], ['lancau', 'anywhere'], ['bapuk', 'anywhere'], ['pondan', 'anywhere'],
  ['palat', 'whole word'], ['mampus', 'anywhere'], ['anjing', 'whole word'], ['kafir', 'whole word'],
  ['keling', 'anywhere'], ['pariah', 'anywhere'], ['allah', 'whole word'],
  // Hokkien and Cantonese, as Malaysians type them
  ['cibai', 'anywhere'], ['chibai', 'anywhere'], ['cheebye', 'anywhere'], ['cheebai', 'anywhere'],
  ['kanina', 'anywhere'], ['kaninabu', 'anywhere'], ['knn', 'whole word'], ['cb', 'whole word'], ['ccb', 'whole word'],
  ['kns', 'whole word'], ['lanjiao', 'anywhere'], ['lanjio', 'anywhere'], ['nabei', 'whole word'], ['nabeh', 'whole word'],
  ['diu', 'whole word'], ['dllm', 'whole word'], ['dnlm', 'whole word'], ['pukgai', 'anywhere'], ['pokgai', 'anywhere'],
  ['hamkachan', 'anywhere'], ['hamgachan', 'anywhere'], ['sohai', 'whole word'], ['on9', 'whole word'],
  // Tamil, as Malaysians type it
  ['punda', 'anywhere'], ['pundai', 'anywhere'], ['pundek', 'anywhere'], ['otha', 'whole word'], ['ommala', 'anywhere'],
  ['oombu', 'anywhere'], ['thevidiya', 'anywhere'], ['thevdiya', 'anywhere'], ['koothi', 'anywhere'],
  ['sunni', 'whole word'], ['mayiru', 'anywhere'], ['poolu', 'whole word'], ['baadu', 'whole word']
];

// ------------------------------------------------------------------ web app

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'board';
  try {
    if (action === 'board') return json_(board_());
    return json_({ error: 'unknown_action' });
  } catch (err) {
    return json_({ error: 'server_error' });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ error: 'bad_request' }); }
  try {
    if (body.action === 'score') return json_(submit_(body));
    if (body.action === 'checkName') return json_({ ok: nameOk_(String(body.name || ''), blockedRules_()) });
    return json_({ error: 'unknown_action' });
  } catch (err) {
    return json_({ error: 'server_error' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ sheet access

function book_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}

function dayOf_(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}

// Every score row: [{ day, name, score, wave, won, hidden, run, iso }], oldest first.
function rows_() {
  var sh = book_().getSheetByName(TAB.SCORES);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEAD.length).getValues()
    .filter(function (r) { return String(r[COL.NAME - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        day: String(r[COL.DAY - 1]),
        name: String(r[COL.NAME - 1]),
        score: Number(r[COL.SCORE - 1]) || 0,
        wave: Number(r[COL.WAVE - 1]) || 0,
        won: String(r[COL.WON - 1]) === 'yes',
        hidden: r[COL.HIDE - 1] === true || String(r[COL.HIDE - 1]).toUpperCase() === 'TRUE',
        run: String(r[COL.RUN - 1]),
        iso: String(r[COL.ISO - 1]),
        level: LEVELS.indexOf(String(r[COL.LEVEL - 1])) >= 0 ? String(r[COL.LEVEL - 1]) : 'hard'
      };
    });
}

// Highest score first; the further wave breaks a tie, then whoever got there first.
function byRank_(a, b) {
  return b.score - a.score || b.wave - a.wave || (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);
}

// ------------------------------------------------------------------ the board

function board_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('board');
  if (hit) return JSON.parse(hit);
  var rules = blockedRules_();
  var today = dayOf_(new Date());
  var shown = rows_().filter(function (r) { return !r.hidden && nameOk_(r.name, rules); }).sort(byRank_);
  var shape = function (r) { return { name: r.name, score: r.score, wave: r.wave, won: r.won }; };
  var out = { day: today, levels: {} };
  LEVELS.forEach(function (level) {
    var mine = shown.filter(function (r) { return r.level === level; });
    out.levels[level] = {
      today: mine.filter(function (r) { return r.day === today; }).slice(0, BOARD_SIZE).map(shape),
      weekend: mine.slice(0, BOARD_SIZE).map(shape)
    };
  });
  cache.put('board', JSON.stringify(out), BOARD_CACHE_S);
  return out;
}

// ------------------------------------------------------------------ a score

// Returns { ok: true, today_rank, weekend_rank } or { ok: false, reason: invalid | name | busy }.
function submit_(d) {
  var clean = validate_(d);
  if (!clean) return { ok: false, reason: 'invalid' };
  var rules = blockedRules_();
  if (!nameOk_(clean.name, rules)) return { ok: false, reason: 'name' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, reason: 'busy' }; }
  try {
    var all = rows_();
    // A retry of the same run (a flaky connection) is answered, not added twice.
    var already = clean.run && all.some(function (r) { return r.run === clean.run; });
    if (!already) {
      var sh = book_().getSheetByName(TAB.SCORES);
      var stamp = new Date();
      var row = sh.getLastRow() + 1;
      var range = sh.getRange(row, 1, 1, HEAD.length);
      range.setNumberFormats([FORMATS]);   // the name stays plain text, never read as a formula
      range.setValues([[
        Utilities.formatDate(stamp, TZ, 'yyyy-MM-dd HH:mm:ss'),
        dayOf_(stamp),
        clean.name,
        clean.score,
        clean.wave,
        clean.won ? 'yes' : '',
        clean.right,
        clean.asked,
        false,
        clean.run,
        stamp.toISOString(),
        clean.level
      ]]);
      // A Sheet set up before difficulties existed gets the new column's heading.
      if (sh.getRange(1, COL.LEVEL).getValue() === '') sh.getRange(1, COL.LEVEL).setValue('Level').setFontWeight('bold');
      sh.getRange(row, COL.HIDE).insertCheckboxes();
      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove('board');
      all = rows_();
    }
    var today = dayOf_(new Date());
    var shown = all.filter(function (r) { return !r.hidden && r.level === clean.level && nameOk_(r.name, rules); }).sort(byRank_);
    var mine = function (r) { return clean.run ? r.run === clean.run : false; };
    var weekendRank = shown.findIndex(mine) + 1;
    var todayRank = shown.filter(function (r) { return r.day === today; }).findIndex(mine) + 1;
    return { ok: true, today_rank: todayRank || null, weekend_rank: weekendRank || null };
  } finally {
    lock.releaseLock();
  }
}

// Same rules as the game. Returns null if anything is wrong.
function validate_(d) {
  if (!d) return null;
  // English letters, digits and spaces only, which also means it can never start a formula.
  var name = String(d.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > NAME_MAX || !/^[A-Za-z0-9 ]+$/.test(name)) return null;
  var whole = function (v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; };
  // No cap on scores (Johan's decision); this only checks it is a real whole number.
  if (!whole(d.score, 0, 1e12)) return null;
  if (!whole(d.wave, 1, WAVES)) return null;
  var right = whole(d.mathsRight, 0, 999) ? d.mathsRight : 0;
  var asked = whole(d.mathsAsked, 0, 999) ? d.mathsAsked : 0;
  if (right > asked) return null;
  var run = /^[A-Za-z0-9-]{6,40}$/.test(String(d.run || '')) ? String(d.run) : '';
  var level = LEVELS.indexOf(String(d.level)) >= 0 ? String(d.level) : 'hard';
  return { name: name, score: d.score, wave: d.wave, won: d.won === true, right: right, asked: asked, run: run, level: level };
}

// ------------------------------------------------------------------ names

// The "Blocked words" tab as compiled rules: [{ pattern, whole }].
function blockedRules_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('blocked');
  var list = hit ? JSON.parse(hit) : null;
  if (!list) {
    var sh = book_().getSheetByName(TAB.BLOCKED);
    list = BLOCKED;
    if (sh && sh.getLastRow() > 1) {
      list = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
        .map(function (r) { return [String(r[0]).toLowerCase().replace(/[^a-z0-9]/g, ''), String(r[1])]; })
        .filter(function (r) { return r[0] !== ''; });
    }
    cache.put('blocked', JSON.stringify(list), BLOCKED_CACHE_S);
  }
  return list.map(function (r) {
    // Each letter may repeat (fuuuck), but a doubled letter in the word must stay doubled (boobs is not bobs).
    var body = r[0].replace(/(.)\1*/g, function (run) { return run + '+'; });
    var whole = /^whole/i.test(r[1]);
    return { pattern: new RegExp(whole ? '^' + body + '$' : body), whole: whole };
  });
}

var LOOKALIKE = { '0': 'o', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };

function lookalike_(text, one) {
  return text.replace(/[0-9@$!|+]/g, function (c) { return c === '1' ? one : LOOKALIKE[c]; });
}

// True if no blocked word is in the name, however it is disguised.
function nameOk_(name, rules) {
  // "BigAss" and "big ass" both become the words "big" and "ass".
  var spaced = String(name).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  var forms = [spaced, lookalike_(spaced, 'i'), lookalike_(spaced, 'l'), spaced.replace(/[0-9]/g, ' ')];
  var words = [], joined = [];
  forms.forEach(function (form) {
    form.split(/[^a-z0-9]+/).forEach(function (w) { if (w) words.push(w); });
    joined.push(form.replace(/[^a-z0-9]/g, ''));
  });
  return !rules.some(function (rule) {
    var pool = rule.whole ? words : joined;
    return pool.some(function (text) { return rule.pattern.test(text); });
  });
}

// ------------------------------------------------------------------ menu (run from the Sheet)

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tupai Nutty Hero')
    .addItem('1. Set up this sheet', 'setupSheet')
    .addSeparator()
    .addItem('Go live: clear test scores', 'goLive')
    .addToUi();
}

// Ticking "Hide" or editing the blocked words shows on the board within seconds.
function onEdit() {
  CacheService.getScriptCache().removeAll(['board', 'blocked']);
}

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  var sh = ss.getSheetByName(TAB.SCORES) || ss.insertSheet(TAB.SCORES, 0);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
  sh.setFrozenRows(1);

  var bl = ss.getSheetByName(TAB.BLOCKED) || ss.insertSheet(TAB.BLOCKED);
  if (bl.getLastRow() < 2) {
    bl.getRange(1, 1, 1, 3).setValues([['Word', 'Match', 'Notes']]).setFontWeight('bold');
    bl.getRange(2, 1, BLOCKED.length, 2).setValues(BLOCKED);
    bl.getRange(2, 2, BLOCKED.length + 200, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['anywhere', 'whole word'], true).build());
    bl.getRange(1, 3).setNote('"anywhere" blocks the word inside a longer name. "whole word" only blocks it on its own. Add new words at the bottom; they apply within a minute and also hide old scores.');
    bl.setFrozenRows(1);
  }

  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(blank);
  CacheService.getScriptCache().removeAll(['board', 'blocked']);
  SpreadsheetApp.getUi().alert('Sheet is set up.\n\nNext: Deploy > New deployment, as a web app (see SETUP.md).');
}

function goLive() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('Go live',
    'This DELETES every score in the Scores tab. The blocked words are kept.\n\n' +
    'Never run this during or after the event.\n\nContinue?',
    ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.SCORES);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).clearContent().clearDataValidations();
  CacheService.getScriptCache().removeAll(['board', 'blocked']);
  ui.alert('Ready. The leaderboard is empty.');
}
