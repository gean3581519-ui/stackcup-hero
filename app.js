const LAST_ENTRY_KEY = "stackCupHeroLastEntryPeriod.formal.v1";
const COACH_NAME_KEY = "stackCupHeroCoachDisplayName.formal.v1";
const specialNames = ["張誠熙", "池宥圻", "林宇恩", "廖志涵", "魏丞賢", "徐序懷", "宋硯均"];
const items = ["333", "363", "Cycle"];
const absentRemarks = ["假", "國", "退"];

const $ = (id) => document.getElementById(id);
let supabaseClient = null;
let currentUser = null;
let allRecords = [];
let students = window.HERO_STUDENTS || [];

function init() {
  fillYears($("scoreYear"));
  fillYears($("reportYear"));
  fillMonths($("scoreMonth"));
  fillMonths($("reportMonth"));

  const lastPeriod = getLastEntryPeriod();
  const defaultYear = lastPeriod?.scoreYear || currentRocYear();
  const defaultMonth = lastPeriod?.scoreMonth || currentMonthText();
  $("scoreYear").value = String(defaultYear);
  $("reportYear").value = String(defaultYear);
  $("scoreMonth").value = defaultMonth;
  $("reportMonth").value = defaultMonth;
  $("coachDisplayName").value = localStorage.getItem(COACH_NAME_KEY) || "";

  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("syncBtn").addEventListener("click", loadScores);
  $("scoreForm").addEventListener("submit", saveScore);
  $("clearFormBtn").addEventListener("click", clearForm);
  $("reportBtn").addEventListener("click", renderReport);
  $("exportBtn").addEventListener("click", exportCsv);
  $("groupName").addEventListener("change", updateName2);

  $("playerNo").addEventListener("change", fillNameByNo);
  $("playerNo").addEventListener("input", () => {
    renderStudentSuggestions("playerNo");
    updateOverwriteHint();
  });
  $("playerNo").addEventListener("focus", () => renderStudentSuggestions("playerNo"));
  $("playerNo").addEventListener("blur", () => setTimeout(() => hideStudentSuggestions("playerNo"), 160));

  $("name1").addEventListener("change", fillNoByName);
  $("name1").addEventListener("input", () => renderStudentSuggestions("name1"));
  $("name1").addEventListener("focus", () => renderStudentSuggestions("name1"));
  $("name1").addEventListener("blur", () => setTimeout(() => hideStudentSuggestions("name1"), 160));

  ["scoreYear", "scoreMonth", "groupName"].forEach((id) => $(id).addEventListener("change", () => {
    renderRecords();
    updateOverwriteHint();
  }));
  ["scoreYear", "scoreMonth", "groupName", "itemName", "playerNo"].forEach((id) => {
    $(id).addEventListener("input", updateOverwriteHint);
    $(id).addEventListener("change", updateOverwriteHint);
  });

  updateName2();
  setupSupabase();
}

function setupSupabase() {
  const config = window.HERO_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    $("setupPanel").classList.remove("hidden");
    $("loginPanel").classList.add("hidden");
    $("mainPanel").classList.add("hidden");
    return;
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  supabaseClient.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user || null;
    updateSession();
    if (currentUser) loadScores();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateSession();
    if (currentUser) loadScores();
  });
}

function fillYears(select) {
  const currentYear = currentRocYear();
  select.innerHTML = "";
  for (let year = currentYear; year <= 120; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }
}

function fillMonths(select) {
  select.innerHTML = "";
  for (let i = 1; i <= 12; i += 1) {
    const option = document.createElement("option");
    option.value = `${i}月`;
    option.textContent = `${i}月`;
    select.appendChild(option);
  }
}

function currentRocYear() {
  return new Date().getFullYear() - 1911;
}

function currentMonthText() {
  return `${new Date().getMonth() + 1}月`;
}

function getLastEntryPeriod() {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_ENTRY_KEY) || "null");
    if (!value || !value.scoreYear || !value.scoreMonth) return null;
    return value;
  } catch {
    return null;
  }
}

function setLastEntryPeriod(scoreYear, scoreMonth) {
  localStorage.setItem(LAST_ENTRY_KEY, JSON.stringify({
    scoreYear: Number(scoreYear),
    scoreMonth: String(scoreMonth)
  }));
}

async function login() {
  const displayName = $("coachDisplayName").value.trim();
  const email = $("coachEmail").value.trim();
  const password = $("coachPassword").value;
  if (!displayName || !email || !password) {
    alert("請輸入教練名稱、Email 和密碼。");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert(`登入失敗：${error.message}`);
  } else {
    localStorage.setItem(COACH_NAME_KEY, displayName);
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  allRecords = [];
  updateSession();
}

function updateSession() {
  const loggedIn = Boolean(currentUser);
  $("sessionText").textContent = loggedIn ? `目前登入：${coachDisplayName()}` : "尚未登入";
  $("loginPanel").classList.toggle("hidden", loggedIn);
  $("mainPanel").classList.toggle("hidden", !loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("syncBtn").classList.toggle("hidden", !loggedIn);
  if (!loggedIn) $("recordsBody").innerHTML = "";
}

function coachDisplayName() {
  return localStorage.getItem(COACH_NAME_KEY)
    || currentUser?.user_metadata?.display_name
    || currentUser?.user_metadata?.name
    || currentUser?.email
    || "";
}

async function loadScores() {
  if (!currentUser) return;
  $("saveStatus").textContent = "同步中...";
  const { data, error } = await supabaseClient
    .from("scores")
    .select("*")
    .order("score_year", { ascending: true })
    .order("score_month", { ascending: true })
    .order("player_no", { ascending: true });

  if (error) {
    $("saveStatus").textContent = "";
    alert(`讀取資料失敗：${error.message}`);
    return;
  }

  allRecords = recalc((data || []).map(fromDbRecord));
  $("saveStatus").textContent = "已同步";
  renderRecords();
  renderReport();
  updateOverwriteHint();
}

function fromDbRecord(row) {
  return {
    id: row.id,
    scoreYear: row.score_year,
    annualYear: row.annual_year,
    scoreMonth: `${row.score_month}月`,
    groupName: row.group_name,
    itemName: row.item_name,
    playerNo: row.player_no,
    name1: row.name1,
    name2: row.name2 || "",
    scoreText: row.score_text || "",
    effectiveSeconds: row.effective_seconds === null ? "" : Number(row.effective_seconds),
    rank: "",
    points: "",
    remark: row.remark || "",
    coachName: row.coach_name || "",
    savedAt: formatDateTime(row.saved_at || row.updated_at)
  };
}

function toDbRecord(record) {
  return {
    score_year: record.scoreYear,
    annual_year: record.annualYear,
    score_month: monthNumber(record.scoreMonth),
    group_name: record.groupName,
    item_name: record.itemName,
    player_no: record.playerNo,
    name1: record.name1,
    name2: record.name2,
    score_text: String(record.scoreText ?? ""),
    effective_seconds: record.effectiveSeconds === "" ? null : Number(record.effectiveSeconds),
    remark: record.remark,
    coach_email: currentUser.email,
    coach_name: coachDisplayName(),
    saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-TW", { hour12: false });
}

function getAnnualYear(scoreYear, monthText) {
  return monthNumber(monthText) >= 3 ? Number(scoreYear) : Number(scoreYear) - 1;
}

function monthNumber(monthText) {
  return Number(String(monthText).replace("月", "").trim()) || 99;
}

function normalizeGroup(groupName) {
  if (groupName === "個") return "個人";
  if (groupName === "雙") return "雙人";
  return groupName;
}

function isSpecialStudent(playerNo, name, mark = "") {
  return mark === "特" || String(playerNo).trim().startsWith("特") || specialNames.includes(String(name).trim());
}

function normalizePlayerNo(playerNo) {
  const text = String(playerNo).trim();
  if (/^\d+$/.test(text)) return String(Number(text));
  return text;
}

function findStudentByNo(playerNo) {
  const target = normalizePlayerNo(playerNo);
  return students.find((student) => normalizePlayerNo(student.playerNo) === target);
}

function findStudentByName(name) {
  const target = String(name).trim();
  return students.find((student) => student.name === target);
}

function studentSearchText(student) {
  return `${student.playerNo} ${normalizePlayerNo(student.playerNo)} ${student.name}`.toLowerCase();
}

function getStudentMatches(value) {
  const query = String(value).trim().toLowerCase();
  if (!query) return students.slice(0, 10);
  const normalizedQuery = normalizePlayerNo(query);
  return students
    .filter((student) => normalizePlayerNo(student.playerNo) === normalizedQuery || studentSearchText(student).includes(query))
    .slice(0, 10);
}

function renderStudentSuggestions(fieldId) {
  const box = $(`${fieldId}Suggestions`);
  const matches = getStudentMatches($(fieldId).value);
  if (!matches.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = matches.map((student, index) => `
    <button class="suggestion-item" type="button" data-index="${index}">
      <span>${escapeHtml(student.playerNo)}　${escapeHtml(student.name)}</span>
      <span class="suggestion-meta">${student.special === "特" ? "特" : ""}</span>
    </button>
  `).join("");

  box.querySelectorAll(".suggestion-item").forEach((button, index) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applyStudentSuggestion(matches[index]);
      hideStudentSuggestions(fieldId);
    });
  });
  box.classList.remove("hidden");
}

function hideStudentSuggestions(fieldId) {
  $(`${fieldId}Suggestions`).classList.add("hidden");
}

function applyStudentSuggestion(student) {
  $("playerNo").value = student.playerNo;
  $("name1").value = student.name;
  if (isSpecialStudent(student.playerNo, student.name, student.special)) {
    $("remark").value = "特";
  } else if ($("remark").value === "特") {
    $("remark").value = "";
  }
  updateOverwriteHint();
}

function isAbsentRemark(remark) {
  return absentRemarks.includes(String(remark).trim());
}

function isRankable(record) {
  return !isAbsentRemark(record.remark) && record.effectiveSeconds !== "" && Number(record.effectiveSeconds) !== 999;
}

function pointsByRank(rank) {
  if (rank === 1) return 250;
  if (rank === 2) return 230;
  if (rank === 3) return 215;
  if (rank === 4) return 205;
  if (rank === 5) return 200;
  if (rank === 6) return 195;
  return Math.max(0, 201 - rank);
}

function keyOf(record) {
  return [
    record.scoreYear,
    monthNumber(record.scoreMonth),
    record.groupName,
    record.itemName,
    normalizePlayerNo(record.playerNo)
  ].join("|");
}

function currentFormKey() {
  const playerNo = $("playerNo").value.trim();
  if (!playerNo) return "";
  return [
    Number($("scoreYear").value),
    monthNumber($("scoreMonth").value),
    normalizeGroup($("groupName").value),
    $("itemName").value,
    normalizePlayerNo(playerNo)
  ].join("|");
}

function updateOverwriteHint() {
  const hint = $("overwriteHint");
  const formKey = currentFormKey();
  const exists = formKey && allRecords.some((record) => keyOf(record) === formKey);
  hint.classList.toggle("warning", Boolean(exists));
  hint.textContent = exists
    ? "這筆已有資料，送出後會直接覆蓋原本成績。"
    : "相同年份、月份、組別、項目、選手編號會自動覆蓋原資料。";
}

function eventMatches(record, year, month, group, item) {
  return Number(record.scoreYear) === Number(year)
    && monthNumber(record.scoreMonth) === monthNumber(month)
    && record.groupName === normalizeGroup(group)
    && record.itemName === item;
}

async function saveScore(event) {
  event.preventDefault();
  if (!currentUser) {
    alert("請先以教練身分登入後再登錄成績。");
    return;
  }

  let remark = $("remark").value.trim();
  const playerNo = $("playerNo").value.trim();
  const name1 = $("name1").value.trim();
  const student = findStudentByNo(playerNo) || findStudentByName(name1);

  if (!playerNo || !name1) {
    alert("請輸入選手編號與姓名。");
    return;
  }

  if (!remark && isSpecialStudent(playerNo, name1, student?.special || "")) {
    remark = "特";
    $("remark").value = "特";
  }

  const rawScore = $("scoreValue").value.trim();
  if (!isAbsentRemark(remark) && rawScore === "") {
    alert("請輸入成績；若未參加請選擇假、國或退。");
    return;
  }

  let scoreText = rawScore;
  let effectiveSeconds = rawScore === "" ? "" : Number(rawScore);
  if (isAbsentRemark(remark)) {
    scoreText = "0";
    effectiveSeconds = "";
  } else if (Number(rawScore) === 999) {
    scoreText = "犯規";
    effectiveSeconds = 999;
  }

  const record = {
    scoreYear: Number($("scoreYear").value),
    annualYear: getAnnualYear($("scoreYear").value, $("scoreMonth").value),
    scoreMonth: $("scoreMonth").value,
    groupName: normalizeGroup($("groupName").value),
    itemName: $("itemName").value,
    playerNo: student?.playerNo || playerNo,
    name1,
    name2: $("groupName").value === "雙人" ? $("name2").value.trim() : "",
    scoreText,
    effectiveSeconds,
    remark
  };

  const exists = allRecords.some((row) => keyOf(row) === keyOf(record));
  $("saveStatus").textContent = "儲存中...";

  const { error } = await supabaseClient
    .from("scores")
    .upsert(toDbRecord(record), {
      onConflict: "score_year,score_month,group_name,item_name,player_no"
    });

  if (error) {
    $("saveStatus").textContent = "";
    alert(`儲存失敗：${error.message}`);
    return;
  }

  setLastEntryPeriod(record.scoreYear, record.scoreMonth);
  $("saveStatus").textContent = exists ? "已覆蓋原資料" : "已新增";
  await loadScores();
}

function recalc(records) {
  const groups = new Map();
  records.forEach((record) => {
    record.rank = "";
    record.points = "";
    if (isAbsentRemark(record.remark)) {
      record.rank = record.remark;
      record.points = 0;
      return;
    }
    if (Number(record.effectiveSeconds) === 999) {
      record.rank = "犯規";
      record.points = 0;
      return;
    }
    if (!isRankable(record)) return;
    const eventKey = [record.scoreYear, monthNumber(record.scoreMonth), record.groupName, record.itemName].join("|");
    if (!groups.has(eventKey)) groups.set(eventKey, []);
    groups.get(eventKey).push(record);
  });

  groups.forEach((rows) => {
    rows.forEach((row) => {
      const better = rows.filter((candidate) => Number(candidate.effectiveSeconds) < Number(row.effectiveSeconds)).length;
      row.rank = better + 1;
      row.points = pointsByRank(row.rank);
    });
  });
  return records;
}

function renderRecords() {
  const year = Number($("scoreYear").value);
  const month = $("scoreMonth").value;
  const group = normalizeGroup($("groupName").value);
  const records = allRecords
    .filter((r) => Number(r.scoreYear) === year && monthNumber(r.scoreMonth) === monthNumber(month) && r.groupName === group)
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || String(a.playerNo).localeCompare(String(b.playerNo), "zh-Hant", { numeric: true }));

  renderMonthlyStats(records, year, month, group);
  $("recordsBody").innerHTML = records.map((record) => `
    <tr>
      <td>${escapeHtml(record.scoreYear)}</td>
      <td>${escapeHtml(record.scoreMonth)}</td>
      <td>${escapeHtml(record.groupName)}</td>
      <td>${escapeHtml(record.itemName)}</td>
      <td>${escapeHtml(record.playerNo)}</td>
      <td>${escapeHtml(record.name1)}${record.name2 ? " / " + escapeHtml(record.name2) : ""}</td>
      <td>${escapeHtml(record.scoreText)}</td>
      <td>${escapeHtml(record.rank)}</td>
      <td>${escapeHtml(record.points)}</td>
      <td>${escapeHtml(record.remark)}</td>
      <td>${escapeHtml(record.coachName)}</td>
    </tr>
  `).join("");
}

function renderMonthlyStats(records, year, month, group) {
  const scored = records.filter((record) => isRankable(record)).length;
  const fouls = records.filter((record) => Number(record.effectiveSeconds) === 999).length;
  const excluded = records.filter((record) => !isRankable(record)).length;
  $("monthlyStats").innerHTML = `
    <div class="stat-cell"><strong>${escapeHtml(year)}</strong><span>成績年份</span></div>
    <div class="stat-cell"><strong>${escapeHtml(month)}</strong><span>月份</span></div>
    <div class="stat-cell"><strong>${escapeHtml(group)}</strong><span>組別</span></div>
    <div class="stat-cell"><strong>${records.length}</strong><span>總筆數</span></div>
    <div class="stat-cell"><strong>${scored}</strong><span>正式成績</span></div>
    <div class="stat-cell"><strong>${fouls}</strong><span>犯規</span></div>
    <div class="stat-cell"><strong>${excluded}</strong><span>未列入排名</span></div>
    <div class="stat-cell"><strong>${new Date().toLocaleTimeString("zh-TW", { hour12: false })}</strong><span>更新時間</span></div>
  `;
}

function renderReport() {
  const year = Number($("reportYear").value);
  const month = $("reportMonth").value;
  const group = normalizeGroup($("reportGroup").value);

  $("reportOutput").innerHTML = items.map((item) => {
    const eventRows = allRecords.filter((r) => eventMatches(r, year, month, group, item));
    const formal = eventRows.filter(isRankable).sort((a, b) => Number(a.rank) - Number(b.rank));
    const excluded = eventRows.filter((r) => !isRankable(r));
    return `
      <article class="item-report">
        <h3>${item}</h3>
        ${reportSection("正式排名", formal, "formal")}
        ${reportSection("未列入排名", excluded, "excluded", true)}
      </article>
    `;
  }).join("");
}

function reportSection(title, rows, className, excluded = false) {
  const body = rows.length
    ? `<table><thead><tr>${excluded
      ? "<th>狀態</th><th>編號</th><th>姓名</th><th>成績狀態</th><th>積分</th><th>備註</th>"
      : "<th>名次</th><th>編號</th><th>姓名</th><th>成績</th><th>積分</th><th>備註</th>"
    }</tr></thead><tbody>${rows.map((row) => `
      <tr>
        <td>${escapeHtml(excluded ? excludedStatus(row) : row.rank)}</td>
        <td>${escapeHtml(row.playerNo)}</td>
        <td>${escapeHtml(row.name1)}${row.name2 ? " / " + escapeHtml(row.name2) : ""}</td>
        <td>${escapeHtml(row.scoreText)}</td>
        <td>${escapeHtml(row.points || 0)}</td>
        <td>${escapeHtml(row.remark)}</td>
      </tr>
    `).join("")}</tbody></table>`
    : `<div class="empty">沒有資料</div>`;
  return `<div class="section-title ${className}">${title}</div>${body}`;
}

function excludedStatus(record) {
  if (isAbsentRemark(record.remark)) return record.remark;
  if (Number(record.effectiveSeconds) === 999) return "犯規";
  return "未登錄";
}

function fillNameByNo() {
  const student = findStudentByNo($("playerNo").value);
  if (!student) return;
  $("playerNo").value = student.playerNo;
  $("name1").value = student.name;
  if (isSpecialStudent(student.playerNo, student.name, student.special)) $("remark").value = "特";
  updateOverwriteHint();
}

function fillNoByName() {
  const student = findStudentByName($("name1").value);
  if (!student) return;
  $("playerNo").value = student.playerNo;
  if (isSpecialStudent(student.playerNo, student.name, student.special)) $("remark").value = "特";
  updateOverwriteHint();
}

function updateName2() {
  $("name2Wrap").classList.toggle("hidden", $("groupName").value !== "雙人");
}

function clearForm() {
  ["playerNo", "name1", "name2", "scoreValue"].forEach((id) => $(id).value = "");
  $("remark").value = "";
  $("saveStatus").textContent = "";
  updateOverwriteHint();
}

function exportCsv() {
  const header = ["選手編號", "年度", "月份", "組別", "項目", "姓名1", "成績狀態", "有效秒數", "名次", "積分", "備註", "登錄時間"];
  const csv = [header, ...allRecords.map((r) => [
    r.playerNo, r.scoreYear, r.scoreMonth, r.groupName, r.itemName, r.name1,
    r.scoreText, r.effectiveSeconds, r.rank, r.points, r.remark, r.savedAt
  ])].map((row) => row.map(csvCell).join(",")).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `疊杯英雄榜成績_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
