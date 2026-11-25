/**
 * MR Field App — Google Sheet backend (Google Apps Script)
 * Every MR opens their own personal link (?k=KEY). No Gmail login.
 * The app page can be served by doGet (Index.html) or hosted outside Google (app.html) and talk to doPost.
 * All data lives in this Google Sheet, one tab per kind of record.
 */

// ====== CHANGE THESE BEFORE RUNNING setup() ======
const CONFIG = {
  APP_NAME: 'Shashvi MR App',
  COMPANY_NAME: 'Shashvi Remedies Private Limited',              // aapki company ka naam (WhatsApp messages mein aayega)
  MANAGER_NAME: 'Manager',
  MANAGER_PHONE: '9999999999',   // manager's WhatsApp number (evening reports go here)
  TIMEZONE: 'Asia/Kolkata',
  PUBLIC_URL: 'https://mamosures-cpu.github.io/mr-app/'   // app ka page (GitHub). Khaali '' rakhein to Google wala link chalega.
};
const START_PRODUCTS = ['Sanjeevani Prevnca Onco Care', 'Prevnca Breast Cancer Care', 'Shashvi Night', 'Parcid', 'Stressnil'];
// ==================================================

const SHEETS = {
  MRs:      ['ID', 'Name', 'Phone', 'Role', 'Active', 'Key', 'Created', 'Target Doctors', 'Target Chemists'],
  Products: ['Product', 'Active', 'Pack', 'MRP', 'PTR', 'PTS'],
  Parties:  ['ID', 'Type', 'Name', 'Speciality', 'Clinic', 'Area', 'Phone', 'Address', 'Category', 'Lat', 'Lng', 'MR_ID', 'MR Name', 'Created', 'City', 'DOB', 'Anniversary'],
  Plan:     ['Date', 'MR_ID', 'MR Name', 'Area', 'Time'],
  Visits:   ['ID', 'Date', 'Time', 'MR_ID', 'MR Name', 'Party_ID', 'Party Name', 'Type', 'Area', 'Products', 'Interest', 'Assessment', 'Samples', 'Remarks', 'Order Note', 'Next Date', 'Next Time', 'Lat', 'Lng', 'Map Link', 'Met', 'Not Met Reason', 'RCPA', 'Discount %', 'Scheme', 'Order Value'],
  Samples:  ['Date', 'MR_ID', 'MR Name', 'Party_ID', 'Party Name', 'Type', 'Product', 'Qty', 'Visit_ID'],
  Calls:    ['ID', 'Date', 'Time', 'MR_ID', 'MR Name', 'Party_ID', 'Party Name', 'Via', 'Outcome', 'Notes'],
  Attendance: ['Date', 'MR_ID', 'MR Name', 'Start Time', 'Start Map', 'End Time', 'End Map'],
  DayPlan:  ['ID', 'Date', 'MR_ID', 'MR Name', 'Time', 'Party_ID', 'Party Name', 'Type', 'Area'],
  TourPlan: ['Month', 'Date', 'MR_ID', 'MR Name', 'Area', 'Status', 'Updated'],
  StockIssue: ['Date', 'MR_ID', 'MR Name', 'Product', 'Qty', 'Note'],
  Orders:   ['Date', 'MR_ID', 'MR Name', 'Party_ID', 'Party Name', 'Type', 'Product', 'Qty', 'Visit_ID', 'Rate', 'Discount %', 'Value'],
  RCPA:     ['Date', 'MR_ID', 'MR Name', 'Chemist', 'Doctor', 'Product', 'Qty', 'Visit_ID'],
  Library:  ['ID', 'Date', 'Title', 'Product', 'Type', 'Link', 'Drive_ID', 'Uploaded By'],
  Files:    ['ID', 'Date', 'MR_ID', 'MR Name', 'Party_ID', 'Party Name', 'File Name', 'Type', 'Link', 'Drive_ID', 'Note']
};
const DEFAULT_TARGET = { doctors: 10, chemists: 3 };          // visits per day
const MONTHLY_NEED = { A: 4, B: 2, C: 1 };                    // doctor visits needed per month
const DUE_DAYS = { A: 7, B: 15, C: 30 };

// ---------- web app entry ----------
function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.key = (e && e.parameter && e.parameter.k) ? String(e.parameter.k).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64) : '';
  t.appName = CONFIG.APP_NAME;
  return t.evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- JSON API (for the app page hosted outside Google, e.g. GitHub Pages) ----------
// The page sends POST {fn, args} as text/plain. No Google login or cookies are used,
// so it works even when the phone has several Gmail accounts.
const API_ = {
  boot, setArea, saveParty, partyHistory, saveVisit, logCall, dayReport, managerData, dayMark,
  savePlanSlot, planSlots, deletePlanSlot, autoPlan, deleteParty, importParties, uploadFile,
  uploadLibrary, deleteLibrary, setRate, monthlySummary, partyFiles, deleteFile, saveTourPlan,
  tourPlan, copyTourMonth, approveTour, issueStock, setTargets, addMR, setMRActive, editMR,
  removeMR, backupSheet, resetMRLink, saveProduct
};
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const f = Object.prototype.hasOwnProperty.call(API_, req.fn) ? API_[req.fn] : null;
    if (!f) throw new Error('Unknown action');
    const args = Array.isArray(req.args) ? req.args : [];
    out = { ok: true, data: f.apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out === undefined ? { ok: true } : out)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the Apps Script editor. Creates all tabs, products and the manager's link. */
function setup() {
  Object.keys(SHEETS).forEach(sh_);
  if (!rows_('Products').length) START_PRODUCTS.forEach(p => append_('Products', { Product: p, Active: 'Yes' }));
  let mgr = rows_('MRs').find(r => r.Role === 'Manager');
  if (!mgr) {
    mgr = { ID: id_(), Name: CONFIG.MANAGER_NAME, Phone: digits_(CONFIG.MANAGER_PHONE), Role: 'Manager', Active: 'Yes', Key: key_(), Created: now_() };
    append_('MRs', mgr);
  }
  const url = appUrl_();
  Logger.log('Setup done. Manager link (after you Deploy): ' + (url ? url + '?k=' + mgr.Key : '(deploy first, then run showManagerLink)'));
}

/** Run after deploying to print the manager's personal link in the log. */
function showManagerLink() {
  const mgr = rows_('MRs').find(r => r.Role === 'Manager');
  Logger.log(appUrl_() + '?k=' + mgr.Key);
}

// ---------- sheet helpers ----------
function sh_(name) {
  const ss = SpreadsheetApp.getActive();
  let s = null;
  try { s = ss.getSheetByName(name); } catch (e) { s = ss.getSheets().find(x => x.getName() === name) || null; }
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1000, SHEETS[name].length).setNumberFormat('@');
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#e6f2ee');
    s.setFrozenRows(1);
  } else if (!sh_.checked[name]) {
    const n = SHEETS[name].length;
    const head = s.getRange(1, 1, 1, n).getValues()[0];
    if (head.some((h, i) => String(h) !== SHEETS[name][i])) s.getRange(1, 1, 1, n).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#e6f2ee');
  }
  sh_.checked[name] = true;
  return s;
}
sh_.checked = {};
function cell_(v, header) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, /time/i.test(header) ? 'HH:mm' : 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function rows_(name) {
  const s = sh_(name);
  const last = s.getLastRow();
  if (last < 2) return [];
  const h = SHEETS[name];
  return s.getRange(2, 1, last - 1, h.length).getValues()
    .map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = cell_(r[j], k)); return o; })
    .filter(o => o[h[0]] !== '');
}
function append_(name, obj) {
  const s = sh_(name);
  const row = SHEETS[name].map(k => obj[k] === undefined || obj[k] === null ? '' : String(obj[k]));
  const r = s.getLastRow() + 1;
  s.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}
function updateRow_(name, rowNum, obj) {
  const s = sh_(name);
  const h = SHEETS[name];
  const cur = s.getRange(rowNum, 1, 1, h.length).getValues()[0];
  const next = h.map((k, j) => obj[k] === undefined ? cur[j] : String(obj[k]));
  s.getRange(rowNum, 1, 1, h.length).setNumberFormat('@').setValues([next]);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
const id_ = () => Utilities.getUuid().replace(/-/g, '').slice(0, 10);
const key_ = () => Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
const digits_ = p => String(p || '').replace(/\D/g, '');
const today_ = () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
const time_ = () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HH:mm');
const now_ = () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
const clean_ = (v, max) => String(v === undefined || v === null ? '' : v).replace(/^[=+\-@]+/, '').trim().slice(0, max || 300);
function appUrl_() { if (CONFIG.PUBLIC_URL) return CONFIG.PUBLIC_URL; try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }
function dm_(ymd) { if (!ymd) return ''; return Utilities.formatDate(new Date(ymd + 'T12:00:00Z'), 'UTC', 'dd MMM'); }
const met_ = v => String(v.Met || '').toLowerCase() !== 'no';
const mapLink_ = l => l && l.lat ? 'https://maps.google.com/?q=' + Number(l.lat).toFixed(6) + ',' + Number(l.lng).toFixed(6) : '';
function lastMet_(visits, upto) { const last = {}; visits.forEach(v => { if (!met_(v) || (upto && v.Date > upto)) return; const l = last[v.Party_ID]; if (!l || (v.Date + v.Time) >= (l.Date + l.Time)) last[v.Party_ID] = v; }); return last; }
function stockFor_(mrId) {
  const o = {};
  rows_('StockIssue').filter(r => r.MR_ID === mrId).forEach(r => { o[r.Product] = o[r.Product] || { issued: 0, given: 0 }; o[r.Product].issued += Number(r.Qty) || 0; });
  rows_('Samples').filter(r => r.MR_ID === mrId).forEach(r => { o[r.Product] = o[r.Product] || { issued: 0, given: 0 }; o[r.Product].given += Number(r.Qty) || 0; });
  return Object.keys(o).sort().map(k => ({ product: k, issued: o[k].issued, given: o[k].given, balance: o[k].issued - o[k].given }));
}
function planStatus_(slot, visits, now, today) {
  const v = visits.filter(x => x.Party_ID === slot.Party_ID && x.Date === slot.Date).pop();
  if (v) return met_(v) ? 'done' : 'notmet';
  if (slot.Date < today || (slot.Date === today && slot.Time < now)) return 'late';
  return 'pending';
}
function soonDays_(mmdd, today) { // days until next MM-DD from today (0..365)
  if (!/^\d{2}-\d{2}$/.test(mmdd || '')) return -1;
  const y = +today.slice(0, 4); let d = daysBetween_(today, y + '-' + mmdd);
  if (d < 0) d = daysBetween_(today, (y + 1) + '-' + mmdd);
  return d;
}
const num_ = v => { const n = Number(String(v || '').replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
const money_ = n => Math.round(n * 100) / 100;
function rateCard_() { return rows_('Products').filter(p => String(p.Active).toLowerCase() !== 'no').map(p => ({ product: p.Product, pack: p.Pack, mrp: p.MRP, ptr: p.PTR, pts: p.PTS })); }
function library_() { return rows_('Library').reverse().map(r => ({ id: r.ID, title: r.Title, product: r.Product, type: r.Type, link: r.Link, date: r.Date })); }
function daysBetween_(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }

// ---------- auth ----------
function auth_(key) {
  key = String(key || '').trim();
  if (key.length < 20) throw new Error('AUTH');
  const u = rows_('MRs').find(r => r.Key === key);
  if (!u || String(u.Active).toLowerCase() !== 'yes') throw new Error('AUTH');
  return u;
}
function needManager_(u) { if (u.Role !== 'Manager') throw new Error('Sirf manager ye kar sakta hai.'); }
function pub_(u) { return { id: u.ID, name: u.Name, phone: u.Phone, role: u.Role }; }
function canSee_(u, party) { return u.Role === 'Manager' || party.MR_ID === u.ID; }

// ---------- MR: load everything for the home screen ----------
function boot(key) {
  const u = auth_(key);
  const today = today_();
  const parties = rows_('Parties').filter(p => canSee_(u, p));
  const visits = rows_('Visits');
  const myVisits = visits.filter(v => v.MR_ID === u.ID);
  const last = lastMet_(visits);
  const out = parties.map(p => {
    const lv = last[p.ID];
    const gap = DUE_DAYS[p.Category] || 30;
    const since = lv ? daysBetween_(lv.Date, today) : null;
    return {
      id: p.ID, type: p.Type, name: p.Name, speciality: p.Speciality, clinic: p.Clinic, area: p.Area, phone: p.Phone,
      address: p.Address, category: p.Category, lat: p.Lat, lng: p.Lng, mrName: p['MR Name'], city: p.City, created: String(p.Created || '').slice(0, 10),
      lastVisit: lv ? lv.Date : '', lastInterest: lv ? lv.Interest : '',
      nextDate: lv ? lv['Next Date'] : '', nextTime: lv ? lv['Next Time'] : '',
      visitedToday: !!lv && lv.Date === today,
      notMetToday: visits.some(v => v.Party_ID === p.ID && v.Date === today && !met_(v)),
      due: !lv || since >= gap,
      dob: p.DOB, anniversary: p.Anniversary
    };
  });
  const now = time_();
  const att = rows_('Attendance').find(r => r.MR_ID === u.ID && r.Date === today);
  const dayPlan = rows_('DayPlan').filter(r => r.MR_ID === u.ID && r.Date === today).sort((a, b) => a.Time.localeCompare(b.Time))
    .map(r => ({ id: r.ID, time: r.Time, partyId: r.Party_ID, party: r['Party Name'], type: r.Type, area: r.Area, status: planStatus_(r, myVisits, now, today) }));
  const month = today.slice(0, 7);
  const tour = rows_('TourPlan').filter(r => r.MR_ID === u.ID && r.Month === month).map(r => ({ date: r.Date, area: r.Area, status: r.Status }));
  const todayVisits = myVisits.filter(v => v.Date === today);
  const birthdays = [];
  out.forEach(p => { [['dob', '🎂 Birthday'], ['anniversary', '💍 Anniversary']].forEach(k => { const d = soonDays_(p[k[0]], today); if (d >= 0 && d <= 7) birthdays.push({ id: p.id, name: p.name, type: p.type, phone: p.phone, kind: k[1], days: d }); }); });
  birthdays.sort((a, b) => a.days - b.days);
  const plan = rows_('Plan').filter(r => r.MR_ID === u.ID && r.Date === today).pop();
  const calls = rows_('Calls').filter(c => c.MR_ID === u.ID && c.Date === today);
  const samples = rows_('Samples').filter(s => s.MR_ID === u.ID && s.Date === today);
  const mgr = rows_('MRs').find(r => r.Role === 'Manager');
  return {
    user: pub_(u), today: today, appName: CONFIG.APP_NAME, company: CONFIG.COMPANY_NAME || '',
    products: rows_('Products').filter(p => String(p.Active).toLowerCase() !== 'no').map(p => p.Product),
    rateCard: rateCard_(), library: library_(),
    parties: out,
    areas: Array.from(new Set(out.map(p => p.area).filter(Boolean))).sort(),
    cities: Array.from(new Set(out.map(p => p.city).filter(Boolean))).sort(),
    areaCity: out.reduce((m, p) => { if (p.area && p.city && !m[p.area]) m[p.area] = p.city; return m; }, {}),
    todayArea: plan ? plan.Area : ((tour.find(t => t.date === today) || {}).area || ''),
    attendance: att ? { start: att['Start Time'], end: att['End Time'] } : null,
    dayPlan: dayPlan, tour: tour, birthdays: birthdays, stock: stockFor_(u.ID),
    target: { doctors: Number(u['Target Doctors']) || DEFAULT_TARGET.doctors, chemists: Number(u['Target Chemists']) || DEFAULT_TARGET.chemists,
      doctorsMet: todayVisits.filter(v => met_(v) && v.Type === 'Doctor').length, chemistsMet: todayVisits.filter(v => met_(v) && v.Type !== 'Doctor').length },
    stats: {
      notMet: todayVisits.filter(v => !met_(v)).length,
      visits: todayVisits.filter(met_).length,
      calls: calls.length,
      samples: samples.reduce((s, r) => s + (Number(r.Qty) || 0), 0)
    },
    managerPhone: mgr ? mgr.Phone : digits_(CONFIG.MANAGER_PHONE)
  };
}

function setArea(key, area) {
  const u = auth_(key);
  area = clean_(area, 60);
  if (!area) throw new Error('Area chuniye.');
  return withLock_(() => {
    const today = today_();
    const ex = rows_('Plan').find(r => r.MR_ID === u.ID && r.Date === today);
    if (ex) updateRow_('Plan', ex._row, { Area: area, Time: time_() });
    else append_('Plan', { Date: today, MR_ID: u.ID, 'MR Name': u.Name, Area: area, Time: time_() });
    return area;
  });
}

function saveParty(key, p) {
  const u = auth_(key);
  const type = ['Doctor', 'Chemist', 'Stockist'].indexOf(p.type) >= 0 ? p.type : 'Doctor';
  const name = clean_(p.name, 80);
  if (!name) throw new Error('Naam likhiye.');
  const rec = {
    Type: type, Name: name, Speciality: clean_(p.speciality, 40), Clinic: clean_(p.clinic, 80), Area: clean_(p.area, 60), City: clean_(p.city, 60),
    Phone: digits_(p.phone).slice(-12), Address: clean_(p.address, 200), Category: ['A', 'B', 'C'].indexOf(p.category) >= 0 ? p.category : 'B',
    Lat: p.lat ? String(Number(p.lat).toFixed(6)) : '', Lng: p.lng ? String(Number(p.lng).toFixed(6)) : '',
    DOB: /^\d{2}-\d{2}$/.test(p.dob || '') ? p.dob : '', Anniversary: /^\d{2}-\d{2}$/.test(p.anniversary || '') ? p.anniversary : ''
  };
  return withLock_(() => {
    const norm = x => String(x || '').toLowerCase().replace(/^dr\.?\s*/, '').replace(/\s+/g, ' ').trim();
    const dup = rows_('Parties').find(r => r.ID !== p.id && ((rec.Phone && rec.Phone.length >= 10 && digits_(r.Phone).slice(-10) === rec.Phone.slice(-10)) || (norm(r.Name) === norm(rec.Name) && norm(r.Area) === norm(rec.Area))));
    if (dup && !p.force) throw new Error('DUP:' + dup.Name + ' (' + (dup.Area || '-') + ') pehle se list mein hai' + (dup['MR Name'] ? ', MR: ' + dup['MR Name'] : '') + '.');
    if (p.id) {
      const ex = rows_('Parties').find(r => r.ID === p.id);
      if (!ex || !canSee_(u, ex)) throw new Error('Record nahi mila.');
      if (!rec.Lat && ex.Lat) { rec.Lat = ex.Lat; rec.Lng = ex.Lng; }
      updateRow_('Parties', ex._row, rec);
      return p.id;
    }
    rec.ID = id_(); rec.MR_ID = u.ID; rec['MR Name'] = u.Name; rec.Created = now_();
    append_('Parties', rec);
    return rec.ID;
  });
}

function partyHistory(key, partyId) {
  const u = auth_(key);
  const p = rows_('Parties').find(r => r.ID === partyId);
  if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
  const visits = rows_('Visits').filter(v => v.Party_ID === partyId).map(v => ({
    date: v.Date, time: v.Time, mr: v['MR Name'], products: v.Products, interest: v.Interest, assessment: v.Assessment,
    samples: v.Samples, remarks: v.Remarks, order: v['Order Note'], nextDate: v['Next Date'], nextTime: v['Next Time'], kind: 'visit', met: met_(v), notMetReason: v['Not Met Reason'], rcpa: v.RCPA, discount: v['Discount %'], scheme: v.Scheme, orderValue: v['Order Value']
  }));
  const calls = rows_('Calls').filter(c => c.Party_ID === partyId).map(c => ({
    date: c.Date, time: c.Time, mr: c['MR Name'], via: c.Via, outcome: c.Outcome, remarks: c.Notes, kind: 'call'
  }));
  return visits.concat(calls).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 40);
}

function saveVisit(key, v) {
  const u = auth_(key);
  return withLock_(() => {
    const p = rows_('Parties').find(r => r.ID === v.partyId);
    if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
    const date = today_(), time = time_(), vid = id_();
    const products = (v.products || []).map(x => clean_(x, 60)).filter(Boolean);
    const samples = (v.samples || []).map(s => ({ product: clean_(s.product, 60), qty: Math.max(0, Math.min(999, Math.round(Number(s.qty) || 0))) })).filter(s => s.product && s.qty > 0);
    const lat = v.lat ? Number(v.lat).toFixed(6) : '', lng = v.lng ? Number(v.lng).toFixed(6) : '';
    const met = v.met !== false;
    const disc = met ? Math.max(0, Math.min(100, Number(v.discount) || 0)) : 0;
    const scheme = met ? clean_(v.scheme, 80) : '';
    const rates = {}; rows_('Products').forEach(r => rates[r.Product] = r);
    const orders = met ? (v.orders || []).map(o => ({ product: clean_(o.product, 60), qty: Math.max(0, Math.min(99999, Math.round(Number(o.qty) || 0))) })).filter(o => o.product && o.qty > 0) : [];
    orders.forEach(o => { const r = rates[o.product] || {}; o.rate = num_(p.Type === 'Stockist' ? (r.PTS || r.PTR) : (r.PTR || r.PTS)); o.value = money_(o.qty * o.rate * (1 - disc / 100)); });
    const orderValue = money_(orders.reduce((s, o) => s + o.value, 0));
    const rcpa = met ? (v.rcpa || []).map(r => ({ doctor: clean_(r.doctor, 80), product: clean_(r.product, 60), qty: Math.max(0, Math.min(9999, Math.round(Number(r.qty) || 0))) })).filter(r => r.doctor && r.product) : [];
    if (!met) samples.length = 0;
    append_('Visits', {
      'Discount %': disc ? String(disc) : '', Scheme: scheme, 'Order Value': orderValue ? String(orderValue) : '',
      Met: met ? 'Yes' : 'No', 'Not Met Reason': met ? '' : clean_(v.notMetReason, 60),
      RCPA: rcpa.map(r => r.doctor + ' - ' + r.product + (r.qty ? ' (' + r.qty + ')' : '')).join(', '),
      ID: vid, Date: date, Time: time, MR_ID: u.ID, 'MR Name': u.Name, Party_ID: p.ID, 'Party Name': p.Name, Type: p.Type, Area: p.Area,
      Products: products.join(', '), Interest: clean_(v.interest, 20), Assessment: clean_(v.assessment, 60),
      Samples: samples.map(s => s.product + ' x' + s.qty).join(', '), Remarks: clean_(v.remarks, 500), 'Order Note': clean_(v.order, 300),
      'Next Date': /^\d{4}-\d{2}-\d{2}$/.test(v.nextDate || '') ? v.nextDate : '', 'Next Time': /^\d{2}:\d{2}$/.test(v.nextTime || '') ? v.nextTime : '',
      Lat: lat, Lng: lng, 'Map Link': lat ? 'https://maps.google.com/?q=' + lat + ',' + lng : ''
    });
    samples.forEach(s => append_('Samples', {
      Date: date, MR_ID: u.ID, 'MR Name': u.Name, Party_ID: p.ID, 'Party Name': p.Name, Type: p.Type, Product: s.product, Qty: s.qty, Visit_ID: vid
    }));
    orders.forEach(o => append_('Orders', { Date: date, MR_ID: u.ID, 'MR Name': u.Name, Party_ID: p.ID, 'Party Name': p.Name, Type: p.Type, Product: o.product, Qty: o.qty, Visit_ID: vid, Rate: o.rate || '', 'Discount %': disc || '', Value: o.value || '' }));
    rcpa.forEach(r => append_('RCPA', { Date: date, MR_ID: u.ID, 'MR Name': u.Name, Chemist: p.Name, Doctor: r.doctor, Product: r.product, Qty: r.qty, Visit_ID: vid }));
    if (orders.length) updateRow_('Visits', sh_('Visits').getLastRow(), { 'Order Note': [clean_(v.order, 200)].concat(orders.map(o => o.product + ' x' + o.qty)).filter(Boolean).join(', ') });
    if (!p.Lat && lat) updateRow_('Parties', p._row, { Lat: lat, Lng: lng });
    return { id: vid, date: date, time: time, orderValue: orderValue };
  });
}

function logCall(key, c) {
  const u = auth_(key);
  return withLock_(() => {
    const p = rows_('Parties').find(r => r.ID === c.partyId);
    if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
    append_('Calls', {
      ID: id_(), Date: today_(), Time: time_(), MR_ID: u.ID, 'MR Name': u.Name, Party_ID: p.ID, 'Party Name': p.Name,
      Via: c.via === 'WhatsApp' ? 'WhatsApp' : 'Phone', Outcome: clean_(c.outcome, 40), Notes: clean_(c.notes, 300)
    });
    return true;
  });
}

/** Evening report text for the logged-in MR (for WhatsApp). */
function dayReport(key) {
  const u = auth_(key);
  const today = today_();
  const allToday = rows_('Visits').filter(v => v.MR_ID === u.ID && v.Date === today);
  const visits = allToday.filter(met_), notMet = allToday.filter(v => !met_(v));
  const calls = rows_('Calls').filter(c => c.MR_ID === u.ID && c.Date === today);
  const samples = rows_('Samples').filter(s => s.MR_ID === u.ID && s.Date === today);
  const orders = rows_('Orders').filter(o => o.MR_ID === u.ID && o.Date === today);
  const plan = rows_('Plan').filter(r => r.MR_ID === u.ID && r.Date === today).pop();
  const att = rows_('Attendance').find(r => r.MR_ID === u.ID && r.Date === today);
  const slots = rows_('DayPlan').filter(r => r.MR_ID === u.ID && r.Date === today);
  const slotDone = slots.filter(sl => allToday.some(v => v.Party_ID === sl.Party_ID && met_(v))).length;
  const byType = t => visits.filter(v => v.Type === t).length;
  const sampleSum = {};
  samples.forEach(s => sampleSum[s.Product] = (sampleSum[s.Product] || 0) + (Number(s.Qty) || 0));
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 864e5), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const lastByParty = lastMet_(rows_('Visits'));
  const fTomorrow = Object.keys(lastByParty).map(k => lastByParty[k]).filter(v => v.MR_ID === u.ID && v['Next Date'] === tomorrow);
  const lines = [];
  lines.push('*Daily Report - ' + u.Name + '*');
  lines.push('Date: ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd MMM yyyy'));
  if (plan) lines.push('Area: ' + plan.Area);
  if (att) lines.push('Kaam: ' + (att['Start Time'] || '-') + ' se ' + (att['End Time'] || 'abhi chal raha'));
  if (slots.length) lines.push('Aaj ka plan: ' + slotDone + '/' + slots.length + ' poora');
  lines.push('');
  lines.push('Visits: ' + visits.length + ' (Doctor ' + byType('Doctor') + ', Chemist ' + byType('Chemist') + ', Stockist ' + byType('Stockist') + ')');
  lines.push('Calls: ' + calls.length + ' (connected ' + calls.filter(c => /baat hui|connected|call hui/i.test(c.Outcome)).length + ')');
  const sk = Object.keys(sampleSum);
  lines.push('Samples: ' + (sk.length ? sk.map(k => k + ' ' + sampleSum[k]).join(', ') : 'none'));
  if (orders.length) lines.push('Orders: ' + orders.map(o => o['Party Name'] + ' - ' + o.Product + ' ' + o.Qty + (o['Discount %'] ? ' (' + o['Discount %'] + '% off)' : '')).join(', ') + (orders.some(o => num_(o.Value)) ? ' | Total Rs ' + money_(orders.reduce((s, o) => s + num_(o.Value), 0)) : ''));
  if (notMet.length) lines.push('Nahi mile: ' + notMet.map(v => v['Party Name'] + (v['Not Met Reason'] ? ' (' + v['Not Met Reason'] + ')' : '')).join(', '));
  if (visits.length) {
    lines.push('');
    lines.push('*Visits:*');
    visits.forEach((v, i) => lines.push((i + 1) + '. ' + v['Party Name'] + ' (' + v.Type + ', ' + v.Time + ')' + (v.Interest ? ' - ' + v.Interest : '') + (v.Remarks ? ' - ' + v.Remarks : '')));
  }
  const pend = missedVisits_(today).filter(x => x.mrId === u.ID);
  if (pend.length) { lines.push(''); lines.push('*Baaki visits:* ' + pend.length + ' (' + pend.slice(0, 5).map(x => x.party).join(', ') + (pend.length > 5 ? '...' : '') + ')'); }
  if (fTomorrow.length) {
    lines.push('');
    lines.push('*Kal ke follow-up:* ' + fTomorrow.map(v => v['Party Name'] + (v['Next Time'] ? ' ' + v['Next Time'] : '')).join(', '));
  }
  return lines.join('\n');
}

// ---------- Manager ----------
function managerData(key, date) {
  const u = auth_(key); needManager_(u);
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today_();
  const month = date.slice(0, 7);
  const mrs = rows_('MRs');
  const visitsAll = rows_('Visits');
  const visits = visitsAll.filter(v => v.Date === date);
  const monthVisits = visitsAll.filter(v => v.Date.slice(0, 7) === month && v.Date <= date && met_(v));
  const partiesAll = rows_('Parties');
  const att = rows_('Attendance').filter(r => r.Date === date);
  const slotsAll = rows_('DayPlan').filter(r => r.Date === date);
  const tourAll = rows_('TourPlan').filter(r => r.Month === month);
  const monthSlots = rows_('DayPlan').filter(r => r.Date.slice(0, 7) === month);
  const now = time_(), today = today_();
  const ordersMonth = rows_('Orders').filter(o => o.Date.slice(0, 7) === month);
  const rcpaMonth = rows_('RCPA').filter(o => o.Date.slice(0, 7) === month);
  const calls = rows_('Calls').filter(c => c.Date === date);
  const samplesAll = rows_('Samples');
  const samples = samplesAll.filter(s => s.Date === date);
  const plan = rows_('Plan').filter(r => r.Date === date);
  const missedAll = missedVisits_(date);
  const team = mrs.filter(m => String(m.Active).toLowerCase() === 'yes').map(m => {
    const mAll = visits.filter(v => v.MR_ID === m.ID).sort((a, b) => a.Time.localeCompare(b.Time));
    const mv = mAll.filter(met_);
    const at = att.find(r => r.MR_ID === m.ID);
    const slots = slotsAll.filter(r => r.MR_ID === m.ID).sort((a, b) => a.Time.localeCompare(b.Time)).map(r => ({ time: r.Time, party: r['Party Name'], type: r.Type, area: r.Area, status: planStatus_(r, mAll, date === today ? now : '99:99', today) }));
    const docs = partiesAll.filter(p => p.MR_ID === m.ID && p.Type === 'Doctor');
    const cov = { A: [0, 0], B: [0, 0], C: [0, 0] };
    docs.forEach(d => { const c = ['A', 'B', 'C'].indexOf(d.Category) >= 0 ? d.Category : 'B'; const n = monthVisits.filter(v => v.Party_ID === d.ID).length; cov[c][1]++; if (n >= MONTHLY_NEED[c]) cov[c][0]++; });
    const covDone = cov.A[0] + cov.B[0] + cov.C[0], covTot = cov.A[1] + cov.B[1] + cov.C[1];
    const tour = tourAll.filter(r => r.MR_ID === m.ID).sort((a, b) => a.Date.localeCompare(b.Date));
    const mc = calls.filter(c => c.MR_ID === m.ID);
    const ms = samples.filter(s => s.MR_ID === m.ID);
    const pl = plan.filter(r => r.MR_ID === m.ID).pop();
    return {
      id: m.ID, name: m.Name, role: m.Role, area: pl ? pl.Area : ((tour.find(t => t.Date === date) || {}).Area || ''),
      start: at ? at['Start Time'] : '', end: at ? at['End Time'] : '', startMap: at ? at['Start Map'] : '', endMap: at ? at['End Map'] : '',
      plan: slots, planDone: slots.filter(x => x.status === 'done').length,
      notMet: mAll.filter(v => !met_(v)).map(v => ({ time: v.Time, party: v['Party Name'], reason: v['Not Met Reason'], map: v['Map Link'] })),
      target: { doctors: Number(m['Target Doctors']) || DEFAULT_TARGET.doctors, chemists: Number(m['Target Chemists']) || DEFAULT_TARGET.chemists },
      coverage: { pct: covTot ? Math.round(100 * covDone / covTot) : null, A: cov.A, B: cov.B, C: cov.C, monthVisits: monthVisits.filter(v => v.MR_ID === m.ID).length },
      tour: tour.map(t => ({ date: t.Date, area: t.Area, status: t.Status, names: monthSlots.filter(x => x.MR_ID === m.ID && x.Date === t.Date).sort((a, b) => a.Time.localeCompare(b.Time)).map(x => x.Time + ' ' + x['Party Name']) })), tourStatus: tour.length ? (tour.every(t => t.Status === 'Approved') ? 'Approved' : 'Pending') : '',
      stock: stockFor_(m.ID),
      visits: mv.length, doctors: mv.filter(v => v.Type === 'Doctor').length, chemists: mv.filter(v => v.Type === 'Chemist').length, stockists: mv.filter(v => v.Type === 'Stockist').length,
      calls: mc.length, connected: mc.filter(c => /baat hui|call hui/i.test(c.Outcome)).length,
      callList: mc.sort((a, b) => a.Time.localeCompare(b.Time)).map(c => ({ time: c.Time, party: c['Party Name'], via: c.Via, outcome: c.Outcome, notes: c.Notes })),
      samples: ms.reduce((s, r) => s + (Number(r.Qty) || 0), 0),
      first: mv.length ? mv[0].Time : '', last: mv.length ? mv[mv.length - 1].Time : '',
      missed: missedAll.filter(x => x.mrId === m.ID),
      list: mAll.map(v => ({ discount: v['Discount %'], scheme: v.Scheme, orderValue: v['Order Value'], met: met_(v), reason: v['Not Met Reason'], order: v['Order Note'], rcpa: v.RCPA, time: v.Time, party: v['Party Name'], type: v.Type, area: v.Area, interest: v.Interest, samples: v.Samples, remarks: v.Remarks, map: v['Map Link'] }))
    };
  });
  const sumBy = list => { const o = {}; list.forEach(s => o[s.Product] = (o[s.Product] || 0) + (Number(s.Qty) || 0)); return o; };
  return {
    date: date, team: team,
    samplesDay: sumBy(samples),
    samplesMonth: sumBy(samplesAll.filter(s => s.Date.slice(0, 7) === month)),
    sampleLog: samples.map(s => ({ mr: s['MR Name'], party: s['Party Name'], product: s.Product, qty: s.Qty })),
    mrs: mrs.filter(m => m.Active !== 'Removed').map(m => ({ id: m.ID, name: m.Name, phone: m.Phone, role: m.Role, active: String(m.Active).toLowerCase() === 'yes', link: appUrl_() + '?k=' + m.Key })),
    products: rows_('Products').map(p => ({ name: p.Product, active: String(p.Active).toLowerCase() !== 'no', pack: p.Pack, mrp: p.MRP, ptr: p.PTR, pts: p.PTS })),
    ordersValueMonth: money_(ordersMonth.reduce((s, r) => s + num_(r.Value), 0)),
    sheetUrl: SpreadsheetApp.getActive().getUrl(), month: month,
    ordersMonth: (() => { const o = {}; ordersMonth.forEach(r => o[r.Product] = (o[r.Product] || 0) + (Number(r.Qty) || 0)); return o; })(),
    orderLog: ordersMonth.slice(-50).reverse().map(r => ({ date: r.Date, mr: r['MR Name'], party: r['Party Name'], type: r.Type, product: r.Product, qty: r.Qty, value: r.Value, discount: r['Discount %'] })),
    rcpaByDoctor: (() => { const o = {}; rcpaMonth.forEach(r => { const k = r.Doctor; o[k] = o[k] || {}; o[k][r.Product] = (o[k][r.Product] || 0) + (Number(r.Qty) || 1); }); return Object.keys(o).sort().map(k => ({ doctor: k, products: o[k] })); })()
  };
}

/** Parties whose visit is pending as of `date`: missed follow-up, overdue by category, or never visited. */
function missedVisits_(date) {
  const parties = rows_('Parties');
  const last = lastMet_(rows_('Visits'), date);
  const out = [];
  parties.forEach(p => {
    const lv = last[p.ID];
    const gap = DUE_DAYS[p.Category] || 30;
    const base = { mrId: p.MR_ID, mr: p['MR Name'], party: p.Name, type: p.Type, area: p.Area, city: p.City, phone: p.Phone, category: p.Category };
    if (lv && lv['Next Date'] && lv['Next Date'] < date) {
      out.push(Object.assign(base, { kind: 'followup', since: lv['Next Date'], days: daysBetween_(lv['Next Date'], date), lastVisit: lv.Date, reason: 'Follow-up ki date ' + dm_(lv['Next Date']) + ' thi, abhi tak nahi mile' }));
    } else if (lv && daysBetween_(lv.Date, date) > gap) {
      out.push(Object.assign(base, { kind: 'overdue', since: lv.Date, days: daysBetween_(lv.Date, date), lastVisit: lv.Date, reason: 'Aakhri visit ' + dm_(lv.Date) + ' ko, ' + daysBetween_(lv.Date, date) + ' din ho gaye' }));
    } else if (!lv) {
      const created = String(p.Created || '').slice(0, 10);
      const d = created ? daysBetween_(created, date) : 999;
      if (d > 7) out.push(Object.assign(base, { kind: 'never', since: created, days: d, lastVisit: '', reason: 'List mein ' + dm_(created) + ' ko jude, ab tak ek bhi visit nahi' }));
    }
  });
  return out.sort((a, b) => b.days - a.days);
}

// ---------- attendance, day plan, tour plan, stock, targets ----------
function dayMark(key, which, loc) {
  const u = auth_(key);
  return withLock_(() => {
    const today = today_(), t = time_(), map = mapLink_(loc);
    const ex = rows_('Attendance').find(r => r.MR_ID === u.ID && r.Date === today);
    if (which === 'start') {
      if (ex) return { start: ex['Start Time'], end: ex['End Time'] };
      append_('Attendance', { Date: today, MR_ID: u.ID, 'MR Name': u.Name, 'Start Time': t, 'Start Map': map });
      return { start: t, end: '' };
    }
    if (!ex) append_('Attendance', { Date: today, MR_ID: u.ID, 'MR Name': u.Name, 'Start Time': '', 'End Time': t, 'End Map': map });
    else updateRow_('Attendance', ex._row, { 'End Time': t, 'End Map': map });
    return { start: ex ? ex['Start Time'] : '', end: t };
  });
}

function savePlanSlot(key, slot) {
  const u = auth_(key);
  if (!/^\d{2}:\d{2}$/.test(slot.time || '')) throw new Error('Time chuniye.');
  const today = today_();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(slot.date || '') ? slot.date : today;
  if (date < today) throw new Error('Beete din ka plan nahi bana sakte.');
  return withLock_(() => {
    if (slot.id) {
      const row = rows_('DayPlan').find(r => r.ID === slot.id && r.MR_ID === u.ID);
      if (!row) throw new Error('Plan nahi mila.');
      updateRow_('DayPlan', row._row, { Time: slot.time, Date: date });
      return true;
    }
    const p = rows_('Parties').find(r => r.ID === slot.partyId);
    if (!p || !canSee_(u, p)) throw new Error('Doctor / chemist chuniye.');
    const ex = rows_('DayPlan').find(r => r.MR_ID === u.ID && r.Date === date && r.Party_ID === p.ID);
    if (ex) updateRow_('DayPlan', ex._row, { Time: slot.time });
    else append_('DayPlan', { ID: id_(), Date: date, MR_ID: u.ID, 'MR Name': u.Name, Time: slot.time, Party_ID: p.ID, 'Party Name': p.Name, Type: p.Type, Area: p.Area });
    return true;
  });
}
/** Plan slots of one date for the logged-in MR (with done / not met / late / pending). */
function planSlots(key, date) {
  const u = auth_(key);
  const today = today_();
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today;
  const visits = rows_('Visits').filter(v => v.MR_ID === u.ID && v.Date === date);
  const tour = rows_('TourPlan').find(r => r.MR_ID === u.ID && r.Date === date);
  const plan = rows_('Plan').filter(r => r.MR_ID === u.ID && r.Date === date).pop();
  return {
    date: date, area: plan ? plan.Area : (tour ? tour.Area : ''),
    slots: rows_('DayPlan').filter(r => r.MR_ID === u.ID && r.Date === date).sort((a, b) => a.Time.localeCompare(b.Time))
      .map(r => ({ id: r.ID, time: r.Time, partyId: r.Party_ID, party: r['Party Name'], type: r.Type, area: r.Area, status: planStatus_(r, visits, time_(), today) }))
  };
}
function deletePlanSlot(key, id) {
  const u = auth_(key);
  return withLock_(() => {
    const ex = rows_('DayPlan').find(r => r.ID === id && r.MR_ID === u.ID);
    if (ex) sh_('DayPlan').deleteRow(ex._row);
    return true;
  });
}
/** Fills a day's plan with due / follow-up parties of an area, one every `gap` minutes from `start`. */
function autoPlan(key, start, gap, date, area) {
  const d = boot(key);
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : d.today;
  const cur = planSlots(key, date);
  area = clean_(area, 60) || (date === d.today ? d.todayArea : cur.area);
  if (!area) throw new Error('Pehle area chuniye.');
  const planned = cur.slots.map(x => x.partyId);
  const pick = d.parties.filter(p => p.area === area && planned.indexOf(p.id) < 0 && !(date === d.today && p.visitedToday))
    .sort((a, b) => ((b.nextDate && b.nextDate <= date) - (a.nextDate && a.nextDate <= date)) || (b.due - a.due) || (a.type === 'Doctor' ? -1 : 1));
  let [h, m] = (/^\d{2}:\d{2}$/.test(start || '') ? start : '10:00').split(':').map(Number);
  gap = Math.max(10, Math.min(120, Number(gap) || 30));
  const last = cur.slots.length ? cur.slots[cur.slots.length - 1].time : '';
  if (last) { const [lh, lm] = last.split(':').map(Number); if (lh * 60 + lm >= h * 60 + m) { const t = lh * 60 + lm + gap; h = Math.floor(t / 60); m = t % 60; } }
  let n = 0;
  pick.forEach(p => { if (h >= 20) return; savePlanSlot(key, { partyId: p.id, date: date, time: ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) }); n++; const t = h * 60 + m + gap; h = Math.floor(t / 60); m = t % 60; });
  return n;
}

// ---------- delete a doctor / chemist ----------
function deleteParty(key, id) {
  const u = auth_(key);
  return withLock_(() => {
    const p = rows_('Parties').find(r => r.ID === id);
    if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
    sh_('Parties').deleteRow(p._row);
    rows_('DayPlan').filter(r => r.Party_ID === id && r.Date >= today_()).reverse().forEach(r => sh_('DayPlan').deleteRow(r._row));
    return true; // purani visits / calls history sheet mein rehti hai
  });
}

// ---------- bulk upload of doctor / chemist list (from Excel / CSV) ----------
function importParties(key, list, mrId) {
  const u = auth_(key);
  let owner = u;
  if (mrId && mrId !== u.ID) { needManager_(u); owner = rows_('MRs').find(r => r.ID === mrId); if (!owner) throw new Error('MR nahi mila.'); }
  if (!Array.isArray(list) || !list.length) throw new Error('List khaali hai.');
  if (list.length > 2000) throw new Error('Ek baar mein 2000 se zyada nahi.');
  return withLock_(() => {
    const norm = x => String(x || '').toLowerCase().replace(/^dr\.?\s*/, '').replace(/\s+/g, ' ').trim();
    const ex = rows_('Parties');
    const seen = {};
    ex.forEach(r => { seen['n:' + norm(r.Name) + '|' + norm(r.Area)] = 1; const ph = digits_(r.Phone).slice(-10); if (ph.length === 10) seen['p:' + ph] = 1; });
    const s = sh_('Parties');
    const rows = []; let skipped = 0;
    list.forEach(p => {
      const name = clean_(p.name, 80), area = clean_(p.area, 60);
      if (!name || !area) { skipped++; return; }
      const phone = digits_(p.phone).slice(-12), ph10 = phone.slice(-10);
      if (seen['n:' + norm(name) + '|' + norm(area)] || (ph10.length === 10 && seen['p:' + ph10])) { skipped++; return; }
      seen['n:' + norm(name) + '|' + norm(area)] = 1; if (ph10.length === 10) seen['p:' + ph10] = 1;
      const t = String(p.type || '').toLowerCase();
      const type = /chem|केमि|medical|pharmacy/.test(t) ? 'Chemist' : /stock|स्टॉक|distrib/.test(t) ? 'Stockist' : 'Doctor';
      const cat = String(p.category || '').trim().toUpperCase();
      const rec = { ID: id_(), Type: type, Name: name, Speciality: clean_(p.speciality, 40), Clinic: clean_(p.clinic, 80), Area: area, Phone: phone,
        Address: clean_(p.address, 200), Category: ['A', 'B', 'C'].indexOf(cat) >= 0 ? cat : 'B', Lat: '', Lng: '', MR_ID: owner.ID, 'MR Name': owner.Name,
        Created: now_(), City: clean_(p.city, 60), DOB: '', Anniversary: '' };
      rows.push(SHEETS.Parties.map(k => String(rec[k] === undefined ? '' : rec[k])));
    });
    if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, SHEETS.Parties.length).setNumberFormat('@').setValues(rows);
    return { added: rows.length, skipped: skipped };
  });
}

// ---------- photo / PDF upload (saved in Google Drive folder "MR App Files") ----------
function filesFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILES_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const f = DriveApp.createFolder(CONFIG.APP_NAME + ' - Files');
  props.setProperty('FILES_FOLDER', f.getId());
  return f;
}
function uploadFile(key, x) {
  const u = auth_(key);
  const p = rows_('Parties').find(r => r.ID === x.partyId);
  if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
  const mime = String(x.mime || '');
  const bytes = checkUpload_(x);
  const name = clean_(x.name, 80) || ('file-' + today_());
  const file = saveBlob_(bytes, mime, p.Name + ' - ' + name);
  const rec = { ID: id_(), Date: today_(), MR_ID: u.ID, 'MR Name': u.Name, Party_ID: p.ID, 'Party Name': p.Name, 'File Name': name,
    Type: mime === 'application/pdf' ? 'PDF' : 'Photo', Link: file.getUrl(), Drive_ID: file.getId(), Note: clean_(x.note, 200) };
  withLock_(() => append_('Files', rec));
  return { id: rec.ID, name: name, type: rec.Type, link: rec.Link, date: rec.Date, note: rec.Note, mr: u.Name };
}
function saveBlob_(bytes, mime, name) {
  const file = filesFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
  return file;
}
function checkUpload_(x) {
  const mime = String(x.mime || '');
  if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(mime)) throw new Error('Sirf photo (JPG/PNG) ya PDF.');
  const bytes = Utilities.base64Decode(String(x.data || ''));
  if (bytes.length > 10 * 1024 * 1024) throw new Error('File 10 MB se chhoti honi chahiye.');
  return bytes;
}

// ---------- catalogue / brochure library (manager uploads, all MRs share) ----------
function uploadLibrary(key, x) {
  const u = auth_(key); needManager_(u);
  const bytes = checkUpload_(x);
  const title = clean_(x.title, 80) || clean_(x.name, 80) || 'Brochure';
  const file = saveBlob_(bytes, x.mime, 'Catalogue - ' + title);
  withLock_(() => append_('Library', { ID: id_(), Date: today_(), Title: title, Product: clean_(x.product, 60), Type: x.mime === 'application/pdf' ? 'PDF' : 'Photo', Link: file.getUrl(), Drive_ID: file.getId(), 'Uploaded By': u.Name }));
  return library_();
}
function deleteLibrary(key, id) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const f = rows_('Library').find(r => r.ID === id);
    if (f) { try { DriveApp.getFileById(f.Drive_ID).setTrashed(true); } catch (e) { } sh_('Library').deleteRow(f._row); }
    return library_();
  });
}

// ---------- rate card ----------
function setRate(key, product, r) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const ex = rows_('Products').find(p => p.Product === product);
    if (!ex) throw new Error('Product nahi mila.');
    const f = v => { const n = num_(v); return n ? String(money_(n)) : ''; };
    updateRow_('Products', ex._row, { Pack: clean_(r.pack, 30), MRP: f(r.mrp), PTR: f(r.ptr), PTS: f(r.pts) });
    return true;
  });
}

// ---------- monthly summary ----------
function monthlySummary(key, month, mrId) {
  const u = auth_(key);
  month = /^\d{4}-\d{2}$/.test(month || '') ? month : today_().slice(0, 7);
  const isMgr = u.Role === 'Manager';
  let mrs = rows_('MRs').filter(m => String(m.Active).toLowerCase() === 'yes');
  if (!isMgr) mrs = mrs.filter(m => m.ID === u.ID);
  else if (mrId) mrs = mrs.filter(m => m.ID === mrId);
  const inM = r => String(r.Date || '').slice(0, 7) === month;
  const visits = rows_('Visits').filter(inM), calls = rows_('Calls').filter(inM), samples = rows_('Samples').filter(inM), orders = rows_('Orders').filter(inM);
  const rcpa = rows_('RCPA').filter(inM), att = rows_('Attendance').filter(inM), slots = rows_('DayPlan').filter(inM), parties = rows_('Parties');
  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0);
  const byProd = (list, f) => { const o = {}; list.forEach(r => o[r.Product] = money_((o[r.Product] || 0) + f(r))); return o; };
  const per = mrs.map(m => {
    const mine = r => r.MR_ID === m.ID;
    const mv = visits.filter(mine), met = mv.filter(met_), mo = orders.filter(mine), ma = att.filter(mine), ms = slots.filter(mine);
    const docs = parties.filter(p => p.MR_ID === m.ID && p.Type === 'Doctor');
    const cov = { A: [0, 0], B: [0, 0], C: [0, 0] };
    docs.forEach(d => { const c = ['A', 'B', 'C'].indexOf(d.Category) >= 0 ? d.Category : 'B'; const n = met.filter(v => v.Party_ID === d.ID).length; cov[c][1]++; if (n >= MONTHLY_NEED[c]) cov[c][0]++; });
    const starts = ma.map(a => a['Start Time']).filter(Boolean).sort();
    const avg = list => { if (!list.length) return ''; const mins = list.map(t => +t.slice(0, 2) * 60 + +t.slice(3, 5)); const a = Math.round(mins.reduce((x, y) => x + y, 0) / mins.length); return ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + a % 60).slice(-2); };
    const slotDone = ms.filter(sl => met.some(v => v.Party_ID === sl.Party_ID && v.Date === sl.Date)).length;
    return {
      id: m.ID, name: m.Name,
      daysWorked: new Set(ma.filter(a => a['Start Time']).map(a => a.Date).concat(met.map(v => v.Date))).size,
      avgStart: avg(starts), avgEnd: avg(ma.map(a => a['End Time']).filter(Boolean)),
      visits: met.length, notMet: mv.length - met.length,
      byType: { Doctor: met.filter(v => v.Type === 'Doctor').length, Chemist: met.filter(v => v.Type === 'Chemist').length, Stockist: met.filter(v => v.Type === 'Stockist').length },
      uniqueDoctors: new Set(met.filter(v => v.Type === 'Doctor').map(v => v.Party_ID)).size, totalDoctors: docs.length, coverage: cov,
      calls: calls.filter(mine).length, connected: calls.filter(mine).filter(c => /baat hui|call hui/i.test(c.Outcome)).length,
      samples: byProd(samples.filter(mine), r => num_(r.Qty)), samplesTotal: sum(samples.filter(mine), r => num_(r.Qty)),
      orders: byProd(mo, r => num_(r.Qty)), orderValue: money_(sum(mo, r => num_(r.Value))), orderCount: new Set(mo.map(o => o.Visit_ID)).size,
      discounts: mv.filter(v => v['Discount %'] || v.Scheme).map(v => ({ date: v.Date, party: v['Party Name'], type: v.Type, discount: v['Discount %'], scheme: v.Scheme, value: v['Order Value'] })),
      rcpa: rcpa.filter(mine).length, planned: ms.length, planDone: slotDone,
      newParties: parties.filter(p => p.MR_ID === m.ID && String(p.Created || '').slice(0, 7) === month).length
    };
  });
  return { month: month, team: isMgr && !mrId, mrs: per, company: CONFIG.COMPANY_NAME || '' };
}

function partyFiles(key, partyId) {
  const u = auth_(key);
  const p = rows_('Parties').find(r => r.ID === partyId);
  if (!p || !canSee_(u, p)) throw new Error('Record nahi mila.');
  return rows_('Files').filter(f => f.Party_ID === partyId).reverse().map(f => ({ id: f.ID, name: f['File Name'], type: f.Type, link: f.Link, date: f.Date, note: f.Note, mr: f['MR Name'] }));
}
function deleteFile(key, id) {
  const u = auth_(key);
  return withLock_(() => {
    const f = rows_('Files').find(r => r.ID === id);
    if (!f || (u.Role !== 'Manager' && f.MR_ID !== u.ID)) throw new Error('File nahi mili.');
    try { DriveApp.getFileById(f.Drive_ID).setTrashed(true); } catch (e) { }
    sh_('Files').deleteRow(f._row);
    return true;
  });
}

function saveTourPlan(key, month, entries) {
  const u = auth_(key);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Mahina galat hai.');
  return withLock_(() => {
    const ex = rows_('TourPlan').filter(r => r.MR_ID === u.ID && r.Month === month);
    (entries || []).forEach(e => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || e.date.slice(0, 7) !== month) return;
      const area = clean_(e.area, 60);
      const row = ex.find(r => r.Date === e.date);
      if (row) { if (row.Area !== area) updateRow_('TourPlan', row._row, { Area: area, Status: 'Pending', Updated: now_() }); }
      else if (area) append_('TourPlan', { Month: month, Date: e.date, MR_ID: u.ID, 'MR Name': u.Name, Area: area, Status: 'Pending', Updated: now_() });
    });
    return true;
  });
}
function tourPlan(key, month) {
  const u = auth_(key);
  if (!/^\d{4}-\d{2}$/.test(month || '')) month = today_().slice(0, 7);
  const o = {};
  rows_('TourPlan').filter(r => r.MR_ID === u.ID && r.Month === month).forEach(r => { o[r.Date] = { date: r.Date, area: r.Area, status: r.Status, slots: [] }; });
  rows_('DayPlan').filter(r => r.MR_ID === u.ID && r.Date.slice(0, 7) === month).sort((a, b) => a.Time.localeCompare(b.Time)).forEach(r => {
    o[r.Date] = o[r.Date] || { date: r.Date, area: '', status: '', slots: [] };
    o[r.Date].slots.push({ time: r.Time, party: r['Party Name'], type: r.Type, area: r.Area });
  });
  return Object.keys(o).sort().map(k => o[k]);
}
/** Copies last month's tour plan (areas + doctors with time) to `toMonth`, matched by weekday
 *  (1st Monday -> 1st Monday, 2nd Tuesday -> 2nd Tuesday ...). Days that already have a plan are left as they are. */
function copyTourMonth(key, fromMonth, toMonth) {
  const u = auth_(key);
  if (!/^\d{4}-\d{2}$/.test(fromMonth || '') || !/^\d{4}-\d{2}$/.test(toMonth || '')) throw new Error('Mahina galat hai.');
  const today = today_();
  const slot = ymd => { const d = new Date(ymd + 'T12:00:00Z'); return d.getUTCDay() + '-' + Math.ceil(d.getUTCDate() / 7); };
  const tour = rows_('TourPlan').filter(r => r.MR_ID === u.ID);
  const plans = rows_('DayPlan').filter(r => r.MR_ID === u.ID);
  const src = {};
  tour.filter(r => r.Month === fromMonth).forEach(r => { const k = slot(r.Date); src[k] = src[k] || { area: '', slots: [] }; src[k].area = r.Area; });
  plans.filter(r => r.Date.slice(0, 7) === fromMonth).forEach(r => { const k = slot(r.Date); src[k] = src[k] || { area: '', slots: [] }; src[k].slots.push(r); });
  if (!Object.keys(src).length) throw new Error('Pichhle mahine ka koi plan nahi mila.');
  const busyDay = {};
  tour.filter(r => r.Month === toMonth && r.Area).forEach(r => busyDay[r.Date] = 1);
  plans.filter(r => r.Date.slice(0, 7) === toMonth).forEach(r => busyDay[r.Date] = 1);
  const parties = {}; rows_('Parties').forEach(p => parties[p.ID] = p);
  const y = +toMonth.slice(0, 4), m = +toMonth.slice(5, 7), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let days = 0, count = 0;
  return withLock_(() => {
    for (let d = 1; d <= n; d++) {
      const ds = toMonth + '-' + ('0' + d).slice(-2);
      if (ds < today || busyDay[ds]) continue;
      const s = src[slot(ds)]; if (!s) continue;
      if (s.area) append_('TourPlan', { Month: toMonth, Date: ds, MR_ID: u.ID, 'MR Name': u.Name, Area: s.area, Status: 'Pending', Updated: now_() });
      s.slots.forEach(r => { const p = parties[r.Party_ID]; if (!p) return; append_('DayPlan', { ID: id_(), Date: ds, MR_ID: u.ID, 'MR Name': u.Name, Time: r.Time, Party_ID: p.ID, 'Party Name': p.Name, Type: p.Type, Area: p.Area }); count++; });
      days++;
    }
    return { days: days, slots: count };
  });
}
function approveTour(key, mrId, month) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    rows_('TourPlan').filter(r => r.MR_ID === mrId && r.Month === month && r.Status !== 'Approved').forEach(r => updateRow_('TourPlan', r._row, { Status: 'Approved', Updated: now_() }));
    return true;
  });
}
function issueStock(key, x) {
  const u = auth_(key); needManager_(u);
  const qty = Math.round(Number(x.qty) || 0);
  if (!qty) throw new Error('Kitne sample, ye likhiye.');
  return withLock_(() => {
    const m = rows_('MRs').find(r => r.ID === x.mrId);
    if (!m) throw new Error('MR nahi mila.');
    append_('StockIssue', { Date: today_(), MR_ID: m.ID, 'MR Name': m.Name, Product: clean_(x.product, 60), Qty: qty, Note: clean_(x.note, 100) });
    return true;
  });
}
function setTargets(key, mrId, doctors, chemists) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const m = rows_('MRs').find(r => r.ID === mrId);
    if (!m) throw new Error('MR nahi mila.');
    updateRow_('MRs', m._row, { 'Target Doctors': Math.max(0, Math.round(Number(doctors) || 0)), 'Target Chemists': Math.max(0, Math.round(Number(chemists) || 0)) });
    return true;
  });
}

function addMR(key, m) {
  const u = auth_(key); needManager_(u);
  const name = clean_(m.name, 60);
  if (!name) throw new Error('MR ka naam likhiye.');
  return withLock_(() => {
    const rec = { ID: id_(), Name: name, Phone: digits_(m.phone).slice(-12), Role: 'MR', Active: 'Yes', Key: key_(), Created: now_() };
    append_('MRs', rec);
    return { id: rec.ID, link: appUrl_() + '?k=' + rec.Key };
  });
}

function setMRActive(key, id, active) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const m = rows_('MRs').find(r => r.ID === id);
    if (!m) throw new Error('MR nahi mila.');
    if (m.Role === 'Manager') throw new Error('Manager ko band nahi kar sakte.');
    updateRow_('MRs', m._row, { Active: active ? 'Yes' : 'No' });
    return true;
  });
}

/** Change the name / phone of an MR or of the manager. */
function editMR(key, id, m) {
  const u = auth_(key); needManager_(u);
  const name = clean_(m.name, 60);
  if (!name) throw new Error('Naam likhiye.');
  return withLock_(() => {
    const r = rows_('MRs').find(x => x.ID === id);
    if (!r) throw new Error('MR nahi mila.');
    updateRow_('MRs', r._row, { Name: name, Phone: digits_(m.phone).slice(-12) });
    if (name !== r.Name) rows_('Parties').filter(p => p.MR_ID === id).forEach(p => updateRow_('Parties', p._row, { 'MR Name': name }));
    return true;
  });
}
/** Remove an MR from the team. Their doctors / chemists go to another MR; all old visits stay in the sheet. */
function removeMR(key, id, toId) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const all = rows_('MRs');
    const m = all.find(x => x.ID === id);
    if (!m) throw new Error('MR nahi mila.');
    if (m.Role === 'Manager') throw new Error('Manager ko nahi hata sakte.');
    const to = all.find(x => x.ID === toId && x.ID !== id && String(x.Active).toLowerCase() === 'yes');
    if (!to) throw new Error('Doctor list kisko deni hai, ye chuniye.');
    const parties = rows_('Parties').filter(p => p.MR_ID === id);
    parties.forEach(p => updateRow_('Parties', p._row, { MR_ID: to.ID, 'MR Name': to.Name }));
    const today = today_();
    rows_('DayPlan').filter(r => r.MR_ID === id && r.Date >= today).reverse().forEach(r => sh_('DayPlan').deleteRow(r._row));
    updateRow_('MRs', m._row, { Active: 'Removed', Key: '' });
    return { moved: parties.length, to: to.Name };
  });
}
/** Makes a dated copy of the whole Google Sheet (backup) in the manager's Drive. */
function backupSheet(key) {
  const u = auth_(key); needManager_(u);
  const copy = SpreadsheetApp.getActive().copy(CONFIG.APP_NAME + ' Backup ' + now_());
  return copy.getUrl();
}

/** Makes a new link for an MR; the old link stops working. */
function resetMRLink(key, id) {
  const u = auth_(key); needManager_(u);
  return withLock_(() => {
    const m = rows_('MRs').find(r => r.ID === id);
    if (!m) throw new Error('MR nahi mila.');
    const k = key_();
    updateRow_('MRs', m._row, { Key: k });
    return appUrl_() + '?k=' + k;
  });
}

function saveProduct(key, name, active) {
  const u = auth_(key);
  if (active === false) needManager_(u);
  name = clean_(name, 60);
  if (!name) throw new Error('Product ka naam likhiye.');
  return withLock_(() => {
    const ex = rows_('Products').find(p => p.Product.toLowerCase() === name.toLowerCase());
    if (ex) updateRow_('Products', ex._row, { Active: active === false ? 'No' : 'Yes' });
    else append_('Products', { Product: name, Active: 'Yes' });
    return true;
  });
}
