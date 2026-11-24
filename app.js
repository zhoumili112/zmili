"use strict";

const $ = (id) => document.getElementById(id);
const entriesKey = "riyong-ledger.entries.v1";
const maxCents = 99_999_999_999;
const groups = {
  expense: ["餐饮", "交通", "购物", "住房", "日用", "娱乐", "医疗", "学习", "其他"],
  income: ["工资", "奖金", "兼职", "利息", "其他"],
};
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", currencyDisplay: "narrowSymbol" });
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

function localDate(date = new Date()) {
  const twoDigits = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function recentDates() {
  const now = new Date();
  const today = localDate(now);
  now.setDate(now.getDate() - 1);
  return { today, yesterday: localDate(now) };
}

const currentMonth = () => localDate().slice(0, 7);
const money = (cents) => currency.format(cents / 100);

function monthName(value) {
  const [year, monthNumber] = value.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function periodName(value) {
  const label = monthName(value);
  return value.length === 10 ? `${label}${Number(value.slice(-2))}日` : label;
}

function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "1900-01";
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0, 7))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function selectableMonth(value) {
  return validMonth(value) && value <= currentMonth();
}

function selectableDay(value) {
  return validDate(value) && value <= localDate();
}

function parseDate(value) {
  return value.normalize("NFKC").trim().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
}

function readEntries(items) {
  if (!Array.isArray(items)) throw new Error("缺少流水列表。");
  const unique = new Set();
  return items.map((item) => {
    if (!item || !["expense", "income"].includes(item.type) || !groups[item.type].includes(item.category) || !validDate(item.date)
      || !Number.isSafeInteger(item.cents) || item.cents <= 0 || item.cents > maxCents
      || typeof item.id !== "string" || !item.id || item.id.length > 100 || unique.has(item.id)
      || typeof item.note !== "string" || item.note.length > 100) throw new Error("备份包含无效或重复的流水。");
    const { id, type, cents, category, date, note } = item;
    unique.add(id);
    return { id, type, cents, category, date, note };
  });
}

function loadEntries() {
  const stored = localStorage.getItem(entriesKey);
  return stored === null ? [] : readEntries(JSON.parse(stored));
}

let entries = [];
let demo = false;
let period = localDate();
let calendarMonth = "";
let filtersOpen = false;
let editing = null;
let toastTimer;

try {
  entries = loadEntries();
} catch {
  $("storage-error").hidden = false;
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500);
}

async function changeEntries(update) {
  const apply = () => {
    const next = update(loadEntries());
    localStorage.setItem(entriesKey, JSON.stringify(next));
    entries = next;
  };
  if (navigator.locks) await navigator.locks.request(entriesKey, apply);
  else apply();
}

window.addEventListener("storage", (event) => {
  if (event.key !== entriesKey && event.key !== null) return;
  try {
    entries = loadEntries();
    render();
  } catch {
    showToast("无法读取其他标签页的更新。");
  }
});

function demoEntries() {
  const samples = [
    [2, "expense", "交通", 120, "公交卡充值"], [3, "expense", "住房", 2680, "房租"],
    [5, "expense", "餐饮", 56, "周末早午餐"], [7, "expense", "日用", 88, "洗护用品"],
    [8, "income", "工资", 12500, "月薪"], [10, "expense", "餐饮", 132, "聚餐"],
    [12, "expense", "交通", 75, "打车"], [13, "expense", "购物", 268, "换季衣物"],
    [16, "expense", "餐饮", 288, "买菜"], [19, "expense", "日用", 120, "杂货"],
    [21, "expense", "购物", 169, "书柜配件"], [22, "expense", "餐饮", 48, "工作日晚饭"],
    [25, "expense", "交通", 138, "高铁票"], [27, "income", "兼职", 300, "周末兼职"],
    [28, "expense", "餐饮", 27, "工作日午饭"],
  ];
  return samples.map(([day, type, category, yuan, note], index) => ({
    id: `demo-${index}`, date: `${currentMonth()}-${String(day).padStart(2, "0")}`,
    type, category, cents: yuan * 100, note,
  }));
}

function anchorDate() {
  const today = localDate();
  if (!period || period === today.slice(0, 7)) return today;
  return period.length === 7 ? `${period}-01` : period;
}

function shiftDay(value, step) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + step);
  return date.toISOString().slice(0, 10);
}

function renderDateNavigator(relativeLabel, today) {
  let label = "全部日期";
  let detail = "";
  if (period.length === 10) {
    const [year, month, day] = period.split("-");
    label = relativeLabel || `${Number(month)}月${Number(day)}日`;
    detail = relativeLabel ? period.replaceAll("-", ".") : `${year}年`;
  } else if (period) {
    label = "整月";
    detail = period.replace("-", ".");
  }
  $("current-date-label").textContent = label;
  $("current-date-detail").textContent = detail;
  $("current-date-detail").hidden = !detail;
  const dateLabel = period ? periodName(period) : label;
  $("current-date").setAttribute("aria-label", [relativeLabel, dateLabel, "选择日期"].filter(Boolean).join("，"));
  const current = anchorDate();
  $("previous-day").disabled = current === "1900-01-01";
  $("next-day").disabled = current >= today;
}

function renderCalendar() {
  const first = new Date(`${calendarMonth}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: offset }, () => make("span"));
  const { today, yesterday } = recentDates();
  const latestMonth = today.slice(0, 7);
  const lastDay = calendarMonth === latestMonth ? Number(today.slice(-2)) : last.getUTCDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const value = `${calendarMonth}-${String(day).padStart(2, "0")}`;
    const button = make("button", "", day);
    button.type = "button";
    button.dataset.calendarDay = value;
    button.setAttribute("aria-pressed", String(period === value));
    const relative = value === today ? "，今天" : value === yesterday ? "，昨天" : "";
    button.setAttribute("aria-label", `${periodName(value)}${relative}`);
    if (value === today) button.setAttribute("aria-current", "date");
    cells.push(button);
  }
  const monthInput = $("calendar-month");
  monthInput.max = latestMonth;
  monthInput.value = calendarMonth;
  $("calendar-previous-month").disabled = calendarMonth === "1900-01";
  $("calendar-next-month").disabled = calendarMonth >= latestMonth;
  $("calendar-days").replaceChildren(...cells);
}

function changePeriod(value, direction) {
  if (value === period) return;
  period = value;
  render();

  const readout = $("date-readout");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof readout.animate !== "function") return;
  const motion = { duration: 230, easing: "cubic-bezier(.18,.8,.26,1)" };
  const elements = [
    [readout, { opacity: .45, transform: `translate(${direction * 7}px, ${direction ? 0 : 3}px) scale(.97)` }],
    [$("balance"), { opacity: .72, transform: "translateY(3px)" }],
    [$("transaction-list"), { opacity: .78, transform: "translateY(4px)" }],
  ];
  for (const [element, initial] of elements) {
    element.getAnimations().forEach((animation) => animation.cancel());
    element.animate([initial, { opacity: 1, transform: "none" }], motion);
  }
}

function moveDay(step) {
  const date = shiftDay(anchorDate(), step);
  if (selectableDay(date)) changePeriod(date, step);
}

function setCalendarMonth(month) {
  if (selectableMonth(month)) calendarMonth = month;
  renderCalendar();
}

function moveCalendarMonth(step) {
  const date = new Date(`${calendarMonth}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  setCalendarMonth(date.toISOString().slice(0, 7));
}

function selectCalendarPeriod(value) {
  if (value && !(value.length === 7 ? selectableMonth(value) : selectableDay(value))) return;
  const direction = value.length === 10 && period.length === 10 ? Math.sign(value.localeCompare(period)) : 0;
  $("date-dialog").close();
  changePeriod(value, direction);
}

function showEmpty(container, message) {
  container.replaceChildren(make("p", "empty", message));
}

function trendBins(expenses, selectedPeriod) {
  if (selectedPeriod.length === 10) {
    return [["合计", expenses.reduce((sum, item) => sum + item.cents, 0)]];
  }
  if (!selectedPeriod) {
    const totals = new Map();
    for (const item of expenses) {
      const period = item.date.slice(0, 7);
      totals.set(period, (totals.get(period) ?? 0) + item.cents);
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b)).slice(-5)
      .map(([period, total]) => [monthName(period), total]);
  }
  const values = [0, 0, 0, 0, 0];
  for (const item of expenses) values[Math.min(4, Math.floor((Number(item.date.slice(-2)) - 1) / 6))] += item.cents;
  const [year, monthNumber] = selectedPeriod.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return values.map((value, index) => [`${index * 6 + 1}–${index === 4 ? lastDay : (index + 1) * 6}日`, value]);
}

function renderTrend(expenses) {
  const container = $("trend-chart");
  const title = { 0: "近期月度支出", 7: "月内支出趋势", 10: "当日支出" };
  $("trend-title").textContent = title[period.length];
  if (!expenses.length) return showEmpty(container, "暂无支出");
  const bins = trendBins(expenses, period);
  const max = Math.max(...bins.map(([, value]) => value));
  const bars = make("div", "bars");
  bars.style.setProperty("--bar-count", bins.length);
  bins.forEach(([label, value]) => {
    const group = make("div", value === max ? "bar-group peak" : "bar-group");
    const track = make("div", "bar-track");
    const fill = make("div", "bar-fill");
    fill.style.height = `${value ? Math.max(2, value / max * 100) : 0}%`;
    track.setAttribute("aria-hidden", "true");
    track.append(fill);
    group.append(make("span", "bar-value", `¥${number.format(value / 100)}`), track, make("span", "bar-label", label));
    bars.append(group);
  });
  container.replaceChildren(bars);
}

function renderCategories(expenses, total) {
  const container = $("categories");
  if (!total) return showEmpty(container, "记下支出后，这里会显示分类占比。");
  const totals = new Map();
  for (const item of expenses) totals.set(item.category, (totals.get(item.category) ?? 0) + item.cents);
  const rows = [...totals].sort((a, b) => b[1] - a[1]).map(([category, cents]) => {
    const row = make("div");
    const meta = make("div", "category-meta");
    const percentage = cents / total * 100;
    meta.append(make("span", "", category), make("strong", "", money(cents)), make("span", "", `${Math.round(percentage)}%`));
    const track = make("div", "category-track");
    const fill = make("div", "category-fill");
    fill.style.setProperty("--portion", `${percentage}%`);
    track.append(fill);
    row.append(meta, track);
    return row;
  });
  container.replaceChildren(...rows);
}

function transactionRow(item) {
  const row = make(demo ? "div" : "button", "transaction");
  const name = make("span", "entry-name");
  const sign = item.type === "income" ? "+" : "−";
  name.append(make("strong", "entry-title", item.category));
  if (item.note) name.append(make("span", "entry-meta", item.note));
  row.append(name, make("strong", `entry-amount ${item.type}`, `${sign}${money(item.cents)}`));
  if (!demo) {
    row.type = "button";
    row.setAttribute("aria-haspopup", "dialog");
    row.addEventListener("click", () => openEntry(item));
  }
  return row;
}

function renderTransactions(items) {
  const container = $("transaction-list");
  const filter = $("type-filter").value;
  const query = $("search").value.trim().toLowerCase();
  const visible = items.filter((item) =>
    (filter === "all" || filter === item.type) && `${item.category} ${item.note}`.toLowerCase().includes(query));
  if (!visible.length) return showEmpty(container, items.length ? "没有符合条件的流水" : "暂无流水");
  if (period.length === 10) {
    container.replaceChildren(...visible.map(transactionRow));
    return;
  }

  const days = new Map();
  for (const item of visible) {
    if (!days.has(item.date)) {
      const group = make("section", "transaction-day");
      const heading = make("h3", "transaction-date");
      const date = make("time", "", item.date.replaceAll("-", "."));
      date.dateTime = item.date;
      heading.append(date);
      group.append(heading);
      days.set(item.date, group);
    }
    days.get(item.date).append(transactionRow(item));
  }
  container.replaceChildren(...days.values());
}

function render() {
  const records = demo ? demoEntries() : entries;
  const items = records.filter((entry) => entry.date.startsWith(period)).reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
  const dates = recentDates();
  const relativeLabel = period === dates.today ? "今天" : period === dates.yesterday ? "昨天" : "";
  renderDateNavigator(relativeLabel, dates.today);
  const scopeLabel = period ? relativeLabel || periodName(period) : "";
  const filterActive = $("type-filter").value !== "all" || $("search").value.trim();
  $("demo-banner").hidden = !demo;
  $("show-demo").hidden = demo;
  $("filter-button").textContent = filtersOpen ? "收起筛选" : filterActive ? "筛选中" : "筛选";
  $("filter-button").setAttribute("aria-expanded", String(filtersOpen));
  $("filters").hidden = !filtersOpen;
  const expenses = items.filter((item) => item.type === "expense");
  const inTotal = items.reduce((sum, item) => sum + (item.type === "income" ? item.cents : 0), 0);
  const outTotal = expenses.reduce((sum, item) => sum + item.cents, 0);
  $("income").textContent = money(inTotal);
  $("expense").textContent = money(outTotal);
  $("balance-label").textContent = scopeLabel ? `${scopeLabel}结余` : "累计结余";
  $("balance").textContent = money(inTotal - outTotal);
  if ($("stats-dialog").open) {
    $("stats-title").textContent = `${scopeLabel}支出分析`;
    renderTrend(expenses);
    renderCategories(expenses, outTotal);
  }
  renderTransactions(items);
}

function resetFilters() {
  filtersOpen = false;
  period = "";
  $("type-filter").value = "all";
  $("search").value = "";
}

function enterPersonal() {
  demo = false;
  resetFilters();
}

function selectCategories(type, selected) {
  const select = $("entry-category");
  select.replaceChildren(new Option("请选择分类", "", true, true), ...groups[type].map((label) => new Option(label, label)));
  if (selected) select.value = selected;
}

function wireCalendar(fieldId) {
  const field = $(fieldId);
  const calendar = $(`${fieldId}-calendar`);
  const button = $(`${fieldId}-pick`);
  if (typeof calendar.showPicker !== "function") return;
  button.hidden = false;
  button.addEventListener("click", () => {
    const date = parseDate(field.value);
    calendar.value = validDate(date) ? date : "";
    try { calendar.showPicker(); } catch { field.focus(); }
  });
  calendar.addEventListener("change", () => {
    field.value = calendar.value;
    field.dispatchEvent(new Event("change"));
  });
}

function openEntry(item) {
  editing = item?.id ?? null;
  $("entry-form").reset();
  $("entry-title").textContent = item ? "编辑流水" : "记一笔";
  $("delete-entry").hidden = !item;
  $("entry-error").textContent = "";
  const type = item?.type ?? "expense";
  document.querySelector(`input[name="entry-type"][value="${type}"]`).checked = true;
  selectCategories(type, item?.category);
  $("entry-amount").value = item ? (item.cents / 100).toFixed(2) : "";
  let defaultDate = localDate();
  if (!demo && period.length === 10) defaultDate = period;
  else if (!demo && period && period !== currentMonth()) defaultDate = `${period}-01`;
  $("entry-date").value = item?.date ?? defaultDate;
  $("entry-note").value = item?.note ?? "";
  $("entry-dialog").showModal();
  $("entry-amount").focus();
}

function parseCents(value) {
  const normalized = value.normalize("NFKC").trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) return 0;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

$("entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter ?? $("entry-form").querySelector("[type=submit]");
  if (submit.disabled) return;
  const cents = parseCents($("entry-amount").value);
  const date = parseDate($("entry-date").value);
  if (!cents || !validDate(date)) {
    $("entry-error").textContent = !cents ? "请输入大于 0 的金额，最多两位小数。" : "请输入有效的记账日期，例如 20261119。";
    (!cents ? $("entry-amount") : $("entry-date")).focus();
    return;
  }
  const editedId = editing;
  const id = editedId ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
  const item = { id, cents, date, type: new FormData(event.currentTarget).get("entry-type"), category: $("entry-category").value, note: $("entry-note").value.trim() };
  submit.disabled = true;
  try {
    await changeEntries((previous) => {
      if (!editedId) return [...previous, item];
      if (!previous.some((entry) => entry.id === editedId)) throw new Error("这笔流水已被删除。");
      return previous.map((entry) => entry.id === editedId ? item : entry);
    });
    if (demo) enterPersonal();
    else if (period && date <= localDate()) period = date.slice(0, period.length);
    $("entry-dialog").close();
    render();
    showToast(editedId ? "流水已更新" : "流水已保存");
  } catch (error) {
    $("entry-error").textContent = error.message === "这笔流水已被删除。" ? error.message : "无法保存流水，请检查浏览器存储或可用空间。";
  } finally {
    submit.disabled = false;
  }
});

$("confirm-delete").addEventListener("click", async ({ currentTarget: button }) => {
  const id = editing;
  if (!id || button.disabled) return;
  button.disabled = true;
  try {
    await changeEntries((previous) => previous.filter((entry) => entry.id !== id));
    $("delete-dialog").close();
    $("entry-dialog").close();
    render();
    showToast("流水已删除");
  } catch {
    $("delete-dialog").close();
    $("entry-error").textContent = "删除失败，请检查浏览器存储。";
  } finally {
    button.disabled = false;
  }
});

$("export-backup").addEventListener("click", () => {
  $("backup-error").textContent = "";
  try {
    const blob = new Blob([JSON.stringify({ format: "riyong-ledger", version: 1, entries: loadEntries() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = make("a");
    link.href = url;
    link.download = `账本备份-${localDate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    $("backup-error").textContent = "无法读取账本，备份未下载。";
  }
});

$("backup-file").addEventListener("change", async ({ currentTarget: input }) => {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  const button = $("import-backup");
  $("backup-error").textContent = "";
  button.disabled = true;
  try {
    let imported;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== "riyong-ledger" || backup.version !== 1) throw new Error();
      imported = readEntries(backup.entries);
    } catch {
      $("backup-error").textContent = "无法识别这份备份，请选择账本导出的 JSON 文件。";
      return;
    }
    let added = [];
    await changeEntries((previous) => {
      const existing = new Set(previous.map((entry) => entry.id));
      added = imported.filter((entry) => !existing.has(entry.id));
      return [...previous, ...added];
    });
    if (demo) enterPersonal();
    $("backup-dialog").close();
    render();
    showToast(added.length ? `已导入 ${added.length} 笔流水` : "这份备份没有新增流水");
  } catch {
    $("backup-error").textContent = "无法写入账本，请检查浏览器存储或可用空间。";
  } finally {
    button.disabled = false;
  }
});

wireCalendar("entry-date");
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => $(button.dataset.close).close());
for (const radio of document.querySelectorAll('input[name="entry-type"]')) radio.addEventListener("change", () => selectCategories(radio.value));
$("add-entry").addEventListener("click", () => openEntry());
$("previous-day").addEventListener("click", () => moveDay(-1));
$("next-day").addEventListener("click", () => moveDay(1));
$("current-date").addEventListener("click", () => {
  calendarMonth = anchorDate().slice(0, 7);
  renderCalendar();
  const navigation = $("date-navigation").getBoundingClientRect();
  const calendar = $("date-dialog");
  calendar.style.setProperty("--calendar-y", `${navigation.bottom + 10}px`);
  calendar.showModal();
  $("calendar-days").querySelector('[aria-pressed="true"]')?.focus();
});
$("calendar-previous-month").addEventListener("click", () => moveCalendarMonth(-1));
$("calendar-next-month").addEventListener("click", () => moveCalendarMonth(1));
$("calendar-month").addEventListener("change", ({ target }) => setCalendarMonth(target.value));
$("calendar-days").addEventListener("click", ({ target }) => {
  const day = target.closest("button[data-calendar-day]");
  if (day) selectCalendarPeriod(day.dataset.calendarDay);
});
$("calendar-show-month").addEventListener("click", () => selectCalendarPeriod(calendarMonth));
$("calendar-show-all").addEventListener("click", () => selectCalendarPeriod(""));
$("filter-button").addEventListener("click", () => {
  filtersOpen = !filtersOpen;
  render();
});
$("type-filter").addEventListener("change", render);
$("search").addEventListener("input", render);
$("start-ledger").addEventListener("click", () => { enterPersonal(); render(); $("add-entry").focus(); });
$("tools-button").addEventListener("click", () => $("more-dialog").showModal());
$("show-demo").addEventListener("click", () => {
  $("more-dialog").close();
  demo = true;
  resetFilters();
  render();
  $("start-ledger").focus();
});
$("stats-button").addEventListener("click", () => {
  $("more-dialog").close();
  $("stats-dialog").showModal();
  render();
});
$("backup-button").addEventListener("click", () => {
  $("more-dialog").close();
  $("backup-error").textContent = "";
  $("backup-dialog").showModal();
});
$("import-backup").addEventListener("click", () => $("backup-file").click());
$("delete-entry").addEventListener("click", () => $("delete-dialog").showModal());

render();
