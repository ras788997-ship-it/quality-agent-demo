/* 质量部 AI 助手 · 演示版前端 v0.3
 * 纯原生 JS，无外部依赖；接口唯一依据：docs/演示版接口约定.md
 * 权限一律以接口返回为准，前端只做展示与按权限收起入口。
 */
(() => {
  "use strict";

  /* ============================== 基础工具 ============================== */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const num = (v, digits = 0) => {
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  const pct = (v, digits = 2) => {
    const n = Number(v);
    return isFinite(n) ? (n * 100).toFixed(digits) + "%" : "—";
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(Number(ts) * 1000);
    if (isNaN(d.getTime())) return "—";
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const fmtClock = (ts) => {
    const d = new Date(Number(ts) * 1000);
    if (isNaN(d.getTime())) return "—";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const rgba = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return `rgba(71,85,105,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const xmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));

  /** 极简 Markdown：**加粗**、`代码`、- 列表、> 引用、[n] 引用角标 */
  function md(text) {
    const lines = esc(text).split("\n");
    const out = [];
    let list = null;
    const inline = (s) =>
      s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
       .replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (/^\s*[-*]\s+/.test(line)) {
        if (!list) list = [];
        list.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
        continue;
      }
      if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; }
      if (/^&gt;\s?/.test(line)) {
        out.push("<blockquote>" + inline(line.replace(/^&gt;\s?/, "")) + "</blockquote>");
        continue;
      }
      if (line.trim() === "") { out.push(""); continue; }
      out.push("<p>" + inline(line) + "</p>");
    }
    if (list) out.push("<ul>" + list.join("") + "</ul>");
    return out.join("\n");
  }

  const ICON_LOCK =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>';

  /* ============================== 常量与文案 ============================== */
  const ROLE_FALLBACK = {
    admin: "系统管理员", manager: "质量部经理", engineer: "质量工程师",
    inspector: "检验员", complaint: "客诉专员", guest: "外部协作",
  };
  const LEVEL_FALLBACK = [
    { level: 1, name: "公开", color: "#16a34a", desc: "可对外提供" },
    { level: 2, name: "内部", color: "#2563eb", desc: "质量部内部使用" },
    { level: 3, name: "机密", color: "#d97706", desc: "限经理及以上或获批人员" },
    { level: 4, name: "绝密", color: "#dc2626", desc: "限管理员或专项授权" },
  ];
  const SCOPE_LABEL = {
    all: "全部门数据", own: "仅本人登记", complaints: "客诉范围", none: "无台账权限",
  };
  const INTENT_LABEL = {
    search: "查资料", ledger: "查台账", ledger_sync: "同步状态", report: "报表",
    memory: "记忆", help: "帮助",
  };
  const ACTION_LABEL = {
    login: "登录", logout: "退出", ask: "提问", ledger_query: "查台账",
    report_generate: "生成报表", report_download: "下载报表", file_open: "打开文件",
    denied: "越权被拦", access_request: "申请授权", access_approve: "审批授权",
    access_deny: "驳回申请", export: "导出", demo_sync: "模拟台账保存",
    memory_clear: "清空记忆",
  };
  const MASK_LABEL = {
    C: "客户", S: "供应商", O: "单位", P: "人员",
    N: "编号", A: "地址", M: "金额", X: "信息",
  };
  const RESULT_LABEL = {
    ok: ["成功", "res-ok"], success: ["成功", "res-ok"], done: ["成功", "res-ok"],
    denied: ["拦截", "res-denied"], forbidden: ["拦截", "res-denied"],
    error: ["失败", "res-error"], fail: ["失败", "res-error"], failed: ["失败", "res-error"],
  };
  const TABS = [
    { id: "ledger", label: "台账", show: (u) => !!u.permissions?.["ledger.query"] },
    { id: "reports", label: "报表", show: (u) => !!u.permissions?.["report.generate"] || (state.reports || []).length > 0 },
    { id: "memory", label: "记忆", show: (u) => !!u.permissions?.["memory.view"] },
    { id: "audit", label: "审计", show: (u) => !!u.permissions?.["audit.view"] },
    { id: "permissions", label: "权限", show: () => true },
    { id: "demo", label: "演示", show: (u) => !!u.permissions?.["demo.control"] },
  ];
  const DEMO_ACTION_LABEL = {
    ask: "提问", report: "生成报表", approve: "审批", simulate_save: "模拟保存",
    audit: "看审计", policy: "看权限",
  };

  /* ============================== 状态 ============================== */
  const state = {
    params: new URLSearchParams(location.search),
    user: null,
    policy: null,
    status: null,
    demoAccounts: [],
    demoMode: false,
    authEnabled: true,
    reports: null,
    tabs: [],
    tab: null,
    panelOpen: false,
    busy: false,
    loginBusy: false,
    counting: false,
    countdownTimer: null,
    pollTimer: null,
    lastVersion: null,
    permBarClosed: sessionStorage.getItem("qa_perm_bar_closed") === "1",
    switchMode: false,
    loginAccountsLoaded: false,
    scenarios: null,
    scenarioId: null,
    scenarioScroll: false,
    auditEvents: [],
    accessReqs: null,
    auditFilter: { action: "", user: "" },
    accountInfo: {},
    modalLevel: 0,
    uid: 0,
    qDone: false,
  };

  /* ============================== DOM 引用 ============================== */
  const el = {
    loginPage: $("#loginPage"),
    loginTitle: $("#loginTitle"),
    loginSub: $("#loginSub"),
    loginForm: $("#loginForm"),
    loginUser: $("#loginUser"),
    loginPass: $("#loginPass"),
    loginBtn: $("#loginBtn"),
    loginError: $("#loginError"),
    loginBack: $("#loginBack"),
    loginModeHint: $("#loginModeHint"),
    accountGrid: $("#accountGrid"),
    app: $("#app"),
    watermark: $("#watermark"),
    dot: $("#dot"),
    statusText: $("#statusText"),
    statFiles: $("#statFiles"),
    userPill: $("#userPill"),
    userAvatar: $("#userAvatar"),
    userName: $("#userName"),
    userRole: $("#userRole"),
    userLevel: $("#userLevel"),
    userGrant: $("#userGrant"),
    permBar: $("#permBar"),
    permText: $("#permText"),
    chat: $("#chat"),
    welcome: $("#welcome"),
    input: $("#q"),
    send: $("#send"),
    llmMode: $("#llmMode"),
    panel: $("#panel"),
    panelTitle: $("#panelTitle"),
    panelTabs: $("#panelTabs"),
    panelBody: $("#panelBody"),
    modal: $("#modal"),
    modalTitle: $("#modalTitle"),
    modalBody: $("#modalBody"),
    toasts: $("#toasts"),
  };

  /* ============================== 网络层 ============================== */
  async function rawFetch(path, { method = "GET", body = null } = {}) {
    const opt = { method, credentials: "same-origin", headers: {} };
    if (body !== null) {
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    try {
      const r = await fetch(path, opt);
      let data = null;
      try { data = await r.json(); } catch { data = null; }
      return { status: r.status, ok: r.ok, data };
    } catch (e) {
      return { status: 0, ok: false, data: null, error: e };
    }
  }
  const rawGet = (path) => rawFetch(path);
  const rawPost = (path, body = {}) => rawFetch(path, { method: "POST", body });

  /** 统一接口调用：401 回登录页；403 弹权限提示；其他错误交给调用方。 */
  async function api(path, { method = "GET", body = null, silent = false } = {}) {
    const res = await rawFetch(path, { method, body });
    if (res.status === 401) {
      if (state.user) toast("登录已过期，请重新登录", "bad");
      handleUnauthorized();
      return null;
    }
    if (res.status === 403) {
      if (!silent) toast(res.data?.error || "当前账号无此功能权限", "bad");
      return res.data || { ok: false, error: "当前账号无此功能权限" };
    }
    if (res.status === 0) {
      if (!silent) toast("服务未连接，请确认本地服务仍在运行", "bad");
      return null;
    }
    if (!res.data) {
      if (!silent) toast(`请求失败（HTTP ${res.status}）`, "bad");
      return null;
    }
    if (!res.ok && !silent && res.data.ok !== false) {
      toast(res.data.error || `请求失败（HTTP ${res.status}）`, "bad");
    }
    return res.data;
  }

  /* ============================== 提示 / 弹窗 ============================== */
  function toast(msg, type = "") {
    if (!msg) return;
    const node = document.createElement("div");
    node.className = "toast" + (type ? " " + type : "");
    node.textContent = msg;
    el.toasts.appendChild(node);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => node.remove(), 3000);
  }
  function openModal() { el.modal.classList.remove("hide"); }
  function closeModal() { el.modal.classList.add("hide"); }
  function isModalOpen() { return !el.modal.classList.contains("hide"); }

  /* ============================== 登录页 ============================== */
  async function loadDemoAccounts() {
    const res = await rawGet("/api/auth/demo-accounts");
    if (res.status === 200 && res.data?.ok) {
      state.demoAccounts = res.data.accounts || [];
      state.demoMode = res.data.demo_mode !== false;
    } else {
      state.demoAccounts = [];
    }
    state.loginAccountsLoaded = true;
    return state.demoAccounts;
  }

  function loginLevel(a) {
    const fb = LEVEL_FALLBACK.find((x) => Number(x.level) === Number(a.level));
    const name = a.level_name || (a.level ? `${a.level} 级` : "");
    const color = a.level_color || fb?.color || "#475569";
    return name ? { name, color } : null;
  }

  function renderLoginAccounts() {
    if (!state.demoAccounts.length) {
      el.accountGrid.innerHTML =
        '<p class="muted login-loading">未能读取演示账号清单。请直接输入账号密码；或确认服务已以演示模式启动。</p>';
      el.loginModeHint.textContent = "演示账号清单不可用，请手动输入";
      return;
    }
    el.accountGrid.innerHTML = state.demoAccounts.map((a) => {
      const color = a.color || "#475569";
      const roleName = a.role_name || ROLE_FALLBACK[a.role] || a.title || a.role || "";
      const lv = loginLevel(a);
      return `<button type="button" class="acc-card" data-user="${esc(a.username)}" title="点击填入账号密码">
        <span class="acc-avatar" style="background:${esc(color)}">${esc(a.avatar || a.display_name?.[0] || "·")}</span>
        <span class="acc-name">${esc(a.display_name || a.username)}<span class="acc-role">${esc(roleName)}</span></span>
        <span class="acc-level">${lv ? `密级上限：<b style="color:${esc(lv.color)}">${esc(lv.name)}</b>` : esc(a.title || "")}</span>
        <span class="acc-note">${esc(a.note || "")}</span>
      </button>`;
    }).join("");
    el.loginModeHint.textContent = state.demoMode
      ? "演示模式：点击卡片自动填入演示密码"
      : "请输入公司账号密码";
  }

  function fillLoginAccount(username) {
    const a = state.demoAccounts.find((x) => x.username === username);
    el.loginUser.value = username || "";
    if (a && (a.demo_password || a.password)) el.loginPass.value = a.demo_password || a.password;
    $$(".acc-card", el.accountGrid).forEach((c) =>
      c.classList.toggle("selected", c.dataset.user === username));
    el.loginError.classList.add("hide");
  }

  function showLoginError(msg) {
    el.loginError.textContent = msg;
    el.loginError.classList.remove("hide");
  }

  async function showLogin(opts = {}) {
    const switching = !!opts.switchMode && !!state.user;
    state.switchMode = switching;
    el.loginPage.classList.remove("hide");
    el.app.classList.add("hide");
    el.loginTitle.textContent = switching ? "切换账号" : "演示账号";
    el.loginSub.textContent = switching
      ? `当前账号 ${state.user.display_name}。选择其他演示账号即可切换。`
      : "点击账号卡片自动填入密码；也可直接输入账号密码登录。";
    el.loginBtn.textContent = switching ? "切换并进入" : "进入系统";
    el.loginBack.classList.toggle("hide", !switching);
    el.loginError.classList.add("hide");

    if (!state.loginAccountsLoaded || !state.demoAccounts.length) await loadDemoAccounts();
    renderLoginAccounts();

    const preselect = opts.preselect || (switching ? state.user.username : null);
    if (preselect) fillLoginAccount(preselect);
    else if (!switching) {
      el.loginUser.value = "";
      el.loginPass.value = "";
      $$(".acc-card", el.accountGrid).forEach((c) => c.classList.remove("selected"));
    }
    el.loginUser.focus();
  }

  function hideLogin() {
    el.loginPage.classList.add("hide");
    el.app.classList.remove("hide");
  }

  async function doLogin() {
    if (state.loginBusy) return;
    const username = el.loginUser.value.trim();
    const password = el.loginPass.value;
    if (!username) return showLoginError("请输入账号");
    if (!password) return showLoginError("请输入密码");
    state.loginBusy = true;
    el.loginBtn.disabled = true;
    el.loginBtn.textContent = "登录中…";
    el.loginError.classList.add("hide");
    const res = await rawPost("/api/auth/login", { username, password });
    state.loginBusy = false;
    el.loginBtn.disabled = false;
    const label = state.switchMode ? "切换并进入" : "进入系统";
    el.loginBtn.textContent = label;
    if (res.status === 200 && res.data?.ok && res.data.user) {
      el.loginError.classList.add("hide");
      await enterApp(res.data);
    } else if (res.status === 0) {
      showLoginError("服务未连接，请确认本地服务仍在运行");
    } else {
      showLoginError("登录失败：" + (res.data?.error || "账号或密码错误"));
    }
  }

  function backToApp() {
    if (!state.user) { showLogin(); return; }
    state.switchMode = false;
    hideLogin();
  }

  async function doLogout() {
    await rawPost("/api/auth/logout", {});
    resetUI();
    await showLogin();
    toast("已退出登录");
  }

  async function switchAccount(username, { quiet = false } = {}) {
    if (!username) return false;
    if (state.user && username === state.user.username) {
      if (!quiet) toast(`当前已是 ${accountName(username)} 账号`);
      return true;
    }
    const res = await rawPost("/api/auth/demo-login", { username });
    if (res.status === 200 && res.data?.ok && res.data.user) {
      await enterApp(res.data);
      return true;
    }
    if (!state.demoAccounts.length) await loadDemoAccounts();
    const acc = state.demoAccounts.find((x) => x.username === username);
    const pw = acc?.demo_password || acc?.password;
    if (pw) {
      const lr = await rawPost("/api/auth/login", { username, password: pw });
      if (lr.status === 200 && lr.data?.ok && lr.data.user) {
        await enterApp(lr.data);
        return true;
      }
    }
    toast("切换账号失败：" + (res.data?.error || "请使用登录页切换"), "bad");
    return false;
  }

  /* ============================== 进入应用 ============================== */
  async function enterApp(meData) {
    state.user = meData.user;
    state.demoMode = !!meData.demo_mode;
    state.authEnabled = meData.auth_enabled !== false;
    state.switchMode = false;

    const [policy, status, reports] = await Promise.all([
      api("/api/policy", { silent: true }),
      api("/api/status", { silent: true }),
      api("/api/reports", { silent: true }),
    ]);
    if (!state.user) return; // 会话失效已回登录页

    state.policy = policy?.ok ? policy : null;
    state.status = status?.ok ? status : null;
    if (status?.ok && status.user) state.user = status.user;
    state.reports = reports?.ok ? (reports.reports || []) : [];
    if (state.demoMode && !state.demoAccounts.length) {
      await loadDemoAccounts();
    }

    document.body.classList.add("logged-in");
    hideLogin();
    clearChat();
    closePanel();
    state.tab = null;
    state.tabs = [];
    state.auditFilter = { action: "", user: "" };
    state.accessReqs = null;
    renderUserBar();
    renderPermBar();
    renderWatermark();
    renderWelcome();
    buildTabs();
    renderStatusLine();
    state.lastVersion = versionOf(state.status);
    startPolling();
    applyUrlParams();
    el.input.focus();
  }

  function resetUI() {
    stopPolling();
    clearCountdown();
    closeModal();
    state.user = null;
    state.policy = null;
    state.status = null;
    state.reports = null;
    state.tabs = [];
    state.tab = null;
    state.panelOpen = false;
    state.busy = false;
    state.scenarioId = null;
    state.scenarios = null;
    state.lastVersion = null;
    state.accessReqs = null;
    state.auditEvents = [];
    state.switchMode = false;
    state.counting = false;
    state.permBarClosed = false;
    sessionStorage.removeItem("qa_perm_bar_closed");
    el.app.classList.add("hide");
    el.loginPage.classList.remove("hide");
    document.body.classList.remove("logged-in");
    closePanel();
    clearChat();
    el.chat.querySelector(".welcome")?.classList.remove("hide");
  }

  function handleUnauthorized() {
    if (!state.user) { showLogin(); return; }
    resetUI();
    showLogin();
  }

  /* ============================== 顶栏 / 提示条 / 水印 ============================== */
  function levelInfo(levelOrName) {
    const arr = state.policy?.levels?.length ? state.policy.levels : LEVEL_FALLBACK;
    const isNum = typeof levelOrName === "number" || /^\d+$/.test(String(levelOrName ?? ""));
    if (isNum) return arr.find((l) => Number(l.level) === Number(levelOrName)) || null;
    return arr.find((l) => l.name === levelOrName) || null;
  }
  function levelColor(level, name, fallback) {
    return levelInfo(level)?.color || levelInfo(name)?.color || fallback || "#475569";
  }
  function levelBadgeHtml(level, name, extraStyle = "") {
    const info = levelInfo(level) || levelInfo(name);
    const text = name || info?.name || (level ? `${level} 级` : "");
    const color = info?.color || "#475569";
    return `<span class="badge leveltag" style="background:${rgba(color, .12)};color:${color};border-color:${rgba(color, .38)};${extraStyle}">${esc(text)}</span>`;
  }
  function grantedText() {
    const g = state.user?.grant;
    if (!g || !g.expires_at) return "";
    if (Number(g.level || 0) <= Number(state.user.base_level || 0)) return "";
    return `临时授权至 ${fmtClock(g.expires_at)}`;
  }

  function renderUserBar() {
    const u = state.user;
    if (!u) return;
    const color = u.color || "#1f4e78";
    el.userAvatar.textContent = u.avatar || u.display_name?.[0] || "?";
    el.userAvatar.style.background = color;
    el.userName.textContent = u.display_name || u.username;
    el.userRole.textContent = u.role_name || ROLE_FALLBACK[u.role] || u.role;
    el.userRole.style.background = rgba(color, .12);
    el.userRole.style.color = color;
    el.userRole.style.borderColor = rgba(color, .38);
    const info = levelInfo(u.level) || levelInfo(u.level_name);
    const lcolor = u.level_color || info?.color || "#475569";
    el.userLevel.textContent = u.level_name || info?.name || (u.level ? `${u.level} 级` : "—");
    el.userLevel.style.background = rgba(lcolor, .12);
    el.userLevel.style.color = lcolor;
    el.userLevel.style.borderColor = rgba(lcolor, .38);
    const gt = grantedText();
    el.userGrant.textContent = gt;
    el.userGrant.classList.toggle("hide", !gt);
    el.userPill.title = `${u.display_name} · ${u.role_name || ""} · ${u.department || ""}` +
      (u.grant ? " · 临时授权" : "");
  }

  function renderPermBar() {
    const u = state.user;
    if (!u) return;
    el.permBar.classList.toggle("hide", state.permBarClosed);
    if (state.permBarClosed) return;
    const levels = (state.policy?.levels?.length ? state.policy.levels : LEVEL_FALLBACK)
      .filter((l) => Number(l.level) <= Number(u.level))
      .map((l) => l.name);
    const visible = levels.length ? levels.join("/") : (u.level_name || "—");
    const scope = u.scope_label || SCOPE_LABEL[u.scope?.ledger] || SCOPE_LABEL[u.scope?.ledger_kind] || "—";
    const maskCategories =
      state.policy?.me?.mask_categories || u.mask_categories || [];
    const maskText = (Array.isArray(maskCategories) && maskCategories.length)
      ? "敏感字段自动脱敏"
      : "敏感字段不脱敏";
    const maskTitle = (Array.isArray(maskCategories) && maskCategories.length)
      ? `脱敏类别：${maskCategories.map((c) => MASK_LABEL[c] || c).join("、")}`
      : "当前角色无需脱敏";
    let html = `当前账号 <b>${esc(u.display_name)}</b>（${esc(u.role_name || ROLE_FALLBACK[u.role] || u.role)}）` +
      `｜可见：${esc(visible)}｜台账范围：${esc(scope)}` +
      `｜<span title="${esc(maskTitle)}">${esc(maskText)}</span>`;
    const gt = grantedText();
    if (gt) html += `｜<span class="grant-text">${esc(gt)}</span>`;
    el.permText.innerHTML = html;
  }

  function renderWatermark() {
    const u = state.user;
    const text = u?.watermark;
    if (!text) { el.watermark.style.backgroundImage = "none"; return; }
    const wmCfg = state.policy?.watermark || {};
    const opacity = Number(wmCfg.opacity || 0.055);
    const rotate = Number(wmCfg.rotate ?? -26);
    const fontSize = 13;
    const tileW = Math.max(420, Math.ceil(String(text).length * fontSize * 1.05) + 120);
    const tileH = Math.ceil(tileW * 0.42) + 40;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">` +
      `<text x="${tileW / 2}" y="${tileH / 2}" fill="#1f2937" font-size="${fontSize}" ` +
      `font-family="Microsoft YaHei, PingFang SC, sans-serif" text-anchor="middle" ` +
      `transform="rotate(${rotate} ${tileW / 2} ${tileH / 2})">${xmlEsc(text)}</text></svg>`;
    el.watermark.style.opacity = String(opacity);
    el.watermark.style.backgroundImage =
      `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  /* ============================== 对话区 ============================== */
  function scrollBottom() { el.chat.scrollTop = el.chat.scrollHeight; }

  function addMsg(role, html) {
    el.welcome.classList.add("hide");
    const node = document.createElement("div");
    node.className = `msg ${role}`;
    let avatar = "";
    if (role === "user") {
      const color = state.user?.color || "#0369a1";
      avatar = `<div class="avatar" style="background:${rgba(color, .14)};color:${color}">${esc(state.user?.avatar || "我")}</div>`;
    } else if (role === "bot") {
      avatar = '<div class="avatar">QA</div>';
    }
    node.innerHTML = avatar + `<div class="bubble">${html || ""}</div>`;
    el.chat.appendChild(node);
    scrollBottom();
    return node.querySelector(".bubble");
  }

  function addSystemMsg(text) {
    el.welcome.classList.add("hide");
    const node = document.createElement("div");
    node.className = "msg sys";
    node.innerHTML = `<div class="sys-bubble">${esc(text)}</div>`;
    el.chat.appendChild(node);
    scrollBottom();
  }

  function clearChat() {
    $$(".msg", el.chat).forEach((n) => n.remove());
    el.welcome?.classList.remove("hide");
  }

  function chipsForUser() {
    const p = state.user?.permissions || {};
    const chips = [
      "盐雾试验要做多久",
      "AQL 抽样方案是怎么规定的",
      "首件检验由谁做，什么时候做",
    ];
    if (p["ledger.query"]) {
      chips.push("2026年9月 A-1001 的不良数是多少");
      chips.push("台账同步了吗");
    }
    if (p["report.generate"]) {
      chips.push("生成2026年9月的不良率报表，按料号，导出 Excel 和 PPT");
    }
    if (p["memory.view"]) chips.push("你记得我问过什么吗");
    return chips;
  }

  function renderWelcome() {
    const u = state.user;
    if (!u) return;
    const p = u.permissions || {};
    const intro = (p["search"] && p["ledger.query"])
      ? "用你自己的话问。我会给出结论，并告诉你出自哪个文件、第几页 / 第几行；台账数据按你的权限统计，需要时还能生成 Excel / PPT 报表。"
      : "用你自己的话问。我会给出结论，并告诉你出自哪个文件、第几页 / 第几行；越权内容不会展示。";
    el.welcome.innerHTML = `
      <h2>你好，${esc(u.display_name)}。问点什么？</h2>
      <p>${intro}</p>
      <div class="chips" id="chips"></div>
      <p class="hint" id="welcomeMeta"></p>`;
    const box = $("#chips", el.welcome);
    box.innerHTML = chipsForUser().map((q) =>
      `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("");
    renderWelcomeMeta();
  }

  function renderWelcomeMeta() {
    const node = $("#welcomeMeta", el.welcome);
    if (!node) return;
    const status = state.status;
    const files = status?.stats || {};
    const scope = status?.scope || {};
    const led = status?.ledger?.stats || {};
    const parts = [];
    if (files.files != null) parts.push(`可见 ${num(files.files)} 个文件 / ${num(files.chunks ?? 0)} 个片段`);
    else if (scope.visible_files != null) parts.push(`可见 ${num(scope.visible_files)} 个文件`);
    if (scope.hidden_files) parts.push(`另有 ${num(scope.hidden_files)} 份受限资料按密级隐藏`);
    if (scope.hidden_records) parts.push(`台账另有 ${num(scope.hidden_records)} 条记录按权限隐藏`);
    if (led.records != null) {
      const label = scope.ledger_label || SCOPE_LABEL[scope.ledger] || "";
      parts.push(`台账 ${num(led.records)} 条${label ? `（${label}）` : ""}`);
    }
    node.textContent = parts.length ? parts.join(" · ") : "";
  }

  /* ---------------------------- 提问与回答 ---------------------------- */
  async function ask(questionOverride, opts = {}) {
    if (!state.user || state.busy) return;
    const question = String(questionOverride ?? el.input.value ?? "").trim();
    if (!question) return;
    state.busy = true;
    el.send.disabled = true;
    el.input.value = "";
    autoGrow();
    addMsg("user", md(question));
    const bubble = addMsg("bot", '<span class="typing">思考中…</span>');
    try {
      const r = await api("/api/ask", { method: "POST", body: { question, use_cache: true } });
      if (!r) { bubble.closest(".msg")?.remove(); return; }
      if (r.ok === false) {
        bubble.className = "bubble refused";
        bubble.innerHTML = `<p>${esc(r.error || "服务返回异常，请稍后再试")}</p>`;
        return;
      }
      renderAnswer(r, question, bubble);
      if (!r.permission_denied && r.intent !== "report") {
        renderSources(r.citations || [], bubble, r.security || {});
      }
    } catch (e) {
      bubble.className = "bubble refused";
      bubble.innerHTML = `<p>请求失败：${esc(e.message || e)}</p><p>请确认本地服务仍在运行。</p>`;
    } finally {
      state.busy = false;
      el.send.disabled = false;
      if (opts.scrollTopAfter) {
        // 截图/演示用：自动提问渲染完成后停在顶部，看到问题气泡与回答开头
        el.chat.scrollTop = 0;
      } else {
        scrollBottom();
      }
      el.input.focus();
    }
  }

  function renderAnswer(r, question, bubble) {
    const sec = r.security || {};
    const denied = !!r.permission_denied;
    bubble.className = "bubble" +
      (denied ? " restricted" : (r.refused ? " refused" : ""));
    let html = "";
    if (denied) {
      const lvNames = (sec.denied_levels || []).map((l) => l.name).filter(Boolean).join("、");
      const levelTxt = sec.level_name ? ` · ${esc(sec.level_name)}` : (lvNames ? ` · ${esc(lvNames)}` : "");
      const hits = sec.denied_hits ? `命中受限 ${esc(sec.denied_hits)} 份` : "权限不足";
      html += `<div class="restricted-head">${ICON_LOCK}<span>受限</span>` +
        `<span class="restricted-sub">${hits}${levelTxt}</span></div>`;
    }
    html += md(r.text || "");
    html += metaHtml(r);
    html += reportHtml(r, question);
    if (denied) html += restrictedActions(r);
    bubble.innerHTML = html;
  }

  function securityTags(r) {
    const sec = r.security || {};
    const tags = [];
    let box = "";
    if (sec.level_name) {
      const color = levelColor(sec.level, sec.level_name);
      tags.push(`<span class="tag leveltag" style="background:${rgba(color, .12)};color:${color};border-color:${rgba(color, .38)}" title="本条回答的资料密级">${esc(sec.level_name)}</span>`);
    }
    const counts = sec.mask_counts || {};
    const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sec.masked && (total > 0 || Object.keys(counts).length)) {
      const detail = Object.entries(counts)
        .map(([k, v]) => `${MASK_LABEL[k] || k}×${v}`).join("、");
      tags.push(`<span class="tag masktag" title="${esc(detail ? `脱敏明细：${detail}` : "已按当前角色自动脱敏")}">已脱敏${total ? ` ×${total}` : ""}</span>`);
    }
    if (Number(sec.denied_hits) > 0) {
      state.uid += 1;
      const id = `denybox${state.uid}`;
      tags.push(`<button type="button" class="tag warntag" data-deny-toggle="${id}" title="点击查看说明">命中受限 ${esc(sec.denied_hits)} 份</button>`);
      const canApply = canApplyLevel(sec);
      box = `<div class="denied-box hide" id="${id}">
        <p>${esc(sec.denied_reason || `命中 ${sec.denied_hits} 份当前账号无权查看的资料，内容已隐藏。`)}</p>
        ${canApply ? applyButtonHtml(sec.requested_level, "申请查看这部分资料") : ""}
      </div>`;
    }
    return { tags, box };
  }

  function metaHtml(r) {
    const tags = [];
    if (r.from_cache) tags.push('<span class="tag mem">复用记忆</span>');
    if (r.intent) tags.push(`<span class="tag">${esc(INTENT_LABEL[r.intent] || r.intent)}</span>`);
    if (r.confidence != null) tags.push(`<span class="tag">置信度 ${Number(r.confidence).toFixed(2)}</span>`);
    if (r.elapsed_ms != null) tags.push(`<span class="tag${r.elapsed_ms > 2000 ? " slow" : ""}">${r.elapsed_ms} ms</span>`);
    const sec = securityTags(r);
    tags.push(...sec.tags);
    let html = `<div class="meta">${tags.join("")}</div>` + sec.box;
    if (r.tips?.length) {
      html += `<div class="meta tips">${r.tips.map((t) => `<span>⚠ ${esc(t)}</span>`).join("")}</div>`;
    }
    return html;
  }

  function applyButtonHtml(level, label = "申请授权") {
    return `<button type="button" class="primary apply-btn" data-apply-level="${Number(level) || 0}">${esc(label)}</button>`;
  }
  function canApplyLevel(sec) {
    if (!state.user?.permissions?.["access.request"]) return false;
    if (sec?.can_request) return true;
    return !!(sec?.requested_level && Number(sec.requested_level) > Number(state.user?.level || 0));
  }
  function restrictedActions(r) {
    const sec = r.security || {};
    if (!state.user?.permissions?.["access.request"]) return "";
    const level = sec.requested_level ||
      Math.min(Number(state.user.level || 1) + 1, maxLevel());
    return `<div class="restricted-actions">${applyButtonHtml(level, "申请授权")}
      <span class="muted" style="font-size:12px;align-self:center">审批通过后限时可见，到期自动失效</span></div>`;
  }

  function reportHtml(r, question) {
    const rep = r.report;
    if (!rep) return "";
    const o = rep.overall || {};
    const kpis = [];
    if (o.inspected) kpis.push(["检验数", num(o.inspected)]);
    const dd = o.defects_display != null ? o.defects_display : o.defects;
    if (dd != null) kpis.push(["不良数", num(dd)]);
    if (o.rate != null) kpis.push(["不良率", pct(o.rate)]);
    if (o.ppm != null) kpis.push(["PPM", num(o.ppm)]);

    const artifacts = Array.isArray(r.artifacts) && r.artifacts.length
      ? r.artifacts : (rep.files || []);
    const okFiles = artifacts.filter((f) => f && f.ok);
    const asked = String(question || "");
    const wantsPpt = /ppt|幻灯片|演示文稿/i.test(asked);
    const tipsText = (r.tips || []).join(" ");
    const hasPpt = okFiles.some((f) => f.format === "pptx");
    const pptDenied = !hasPpt && (wantsPpt || /PPT/i.test(tipsText));

    const links = okFiles.map((f) => {
      const label = { xlsx: "下载 Excel", pptx: "下载 PPT", txt: "文字摘要" }[f.format] || `下载 ${f.format}`;
      return f.url
        ? `<a class="dl" href="${esc(f.url)}">${esc(label)}</a>`
        : (f.path ? `<button class="mini" data-open="${esc(f.path)}">${esc(label)}</button>` : "");
    }).join("");
    const failed = artifacts
      .filter((f) => f && !f.ok)
      .map((f) => {
        const label = { xlsx: "Excel", pptx: "PPT", txt: "摘要" }[f.format] || f.format;
        return `<span class="file-denied" title="${esc(f.error || "未生成")}">${esc(label)} · 未生成</span>`;
      }).join("");
    const grayPpt = pptDenied
      ? '<span class="file-denied" title="PPT 导出需要经理权限">PPT · 需经理权限</span>' : "";
    const open = okFiles.filter((f) => f.path)
      .map((f) => `<button class="mini" data-open="${esc(f.path)}">打开位置</button>`).join("");

    return `<div class="report">
      <div class="kpis">${kpis.map(([k, v]) => `<span><b>${esc(v)}</b>${esc(k)}</span>`).join("")}</div>
      <div class="files">${links}${grayPpt}${failed}${open}</div>
      <div class="muted">${rep.from_cache ? "台账数据未变，本次复用上次计算" : "本次已重新计算"} · 数据版本 v${esc(rep.data_version || "?")}</div>
    </div>`;
  }

  function renderSources(cites, bubble, sec = {}) {
    if (!cites.length) return;
    const box = document.createElement("div");
    box.className = "sources in-bubble";
    box.innerHTML = "<h4>来源（点「打开位置」跳到文件所在文件夹）</h4>";
    const fallbackLevel = Number(sec.level) >= 3
      ? { name: sec.level_name || levelInfo(sec.level)?.name, color: levelColor(sec.level, sec.level_name) }
      : null;
    for (const c of cites) {
      const node = document.createElement("div");
      node.className = "src";
      const cLevel = c.level || c.security?.level;
      const cName = c.level_name || c.security?.level_name || fallbackLevel?.name;
      const cColor = levelColor(cLevel, cName) || fallbackLevel?.color || "#475569";
      const tag = cName
        ? `<span class="src-level" style="background:${rgba(cColor, .12)};color:${cColor};border-color:${rgba(cColor, .38)}">${esc(cName)}</span>`
        : "";
      const displayPath = displayPathOf(c);
      node.innerHTML = `
        <div class="idx">${c.idx}</div>
        <div class="body">
          <div class="name">${esc(c.name)}${tag}</div>
          <div class="loc">${esc(c.loc || "全文")}</div>
          <div class="excerpt">${esc(c.excerpt || "")}</div>
          <div class="path" title="展示路径（已按密级脱敏）">${esc(displayPath)}</div>
        </div>
        <div class="ops">
          <button data-open="${esc(c.path)}">打开位置</button>
          <button data-copy="${esc(c.path)}">复制路径</button>
        </div>`;
      box.appendChild(node);
    }
    bubble.appendChild(box);
    scrollBottom();
  }

  /* ============================== 状态轮询 ============================== */
  function versionOf(r) {
    if (!r) return "";
    return String(r?.ledger?.stats?.data_version ?? r?.stats?.data_version ?? "");
  }

  function renderStatusLine() {
    const r = state.status;
    if (!r) return;
    const st = r.stats || {};
    const led = r.ledger || {};
    const ls = led.stats || {};
    if (r.indexing) {
      el.dot.className = "dot busy";
      const p = r.progress || {};
      el.statusText.textContent = `正在建索引… 已扫描 ${p.scanned ?? 0}，新增 ${p.added ?? 0}`;
    } else if ((st.files ?? 0) === 0 && (ls.records ?? 0) === 0) {
      el.dot.className = "dot bad";
      el.statusText.textContent = "索引与台账都为空";
    } else {
      el.dot.className = "dot ok";
      el.statusText.textContent = led.watching ? "就绪 · 台账实时同步中" : "就绪";
    }
    el.statFiles.textContent =
      `${num(st.files ?? 0)} 文件 / ${num(st.chunks ?? 0)} 片段 · 台账 ${num(ls.records ?? 0)} 条`;
    if (r.llm) {
      el.llmMode.textContent =
        r.llm.mode === "extractive"
          ? "检索模式：抽取式（不调用外部模型）"
          : `检索模式：${r.llm.mode}${r.llm.available ? "" : "（未连通，已回退抽取式）"}`;
    }
  }

  async function refreshStatus() {
    if (!state.user) return;
    const r = await api("/api/status", { silent: true });
    if (!r || !r.ok) {
      el.dot.className = "dot bad";
      el.statusText.textContent = "服务未连接";
      return;
    }
    state.status = r;
    if (r.user) {
      const prev = state.user;
      state.user = r.user;
      const changed = !prev ||
        prev.username !== r.user.username ||
        Number(prev.level) !== Number(r.user.level) ||
        JSON.stringify(prev.grant || null) !== JSON.stringify(r.user.grant || null) ||
        JSON.stringify(prev.scope || null) !== JSON.stringify(r.user.scope || null);
      if (changed) {
        renderUserBar();
        renderPermBar();
        renderWatermark();
      }
    }
    renderStatusLine();
    renderWelcomeMeta();
    const v = versionOf(r);
    if (state.lastVersion === null) {
      state.lastVersion = v;
    } else if (v && state.lastVersion !== v) {
      state.lastVersion = v;
      toast(`台账已更新（数据版本 v${v}）`, "good");
      if (state.panelOpen && !state.counting) loadTab();
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(refreshStatus, 5000);
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }
  function clearCountdown() {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    state.counting = false;
  }

  /* ============================== 侧栏 ============================== */
  function buildTabs() {
    const visible = TABS.filter((t) => {
      try { return t.show(state.user); } catch { return false; }
    });
    state.tabs = visible.map((t) => t.id);
    el.panelTabs.innerHTML = visible.map((t) =>
      `<button class="tab" data-tab="${t.id}">${t.label}</button>`).join("");
    if (state.tab && !state.tabs.includes(state.tab)) state.tab = null;
    if (!state.tab) state.tab = state.tabs[0] || null;
    $$(".tab", el.panelTabs).forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === state.tab));
  }

  function setTab(name) {
    if (!state.user) return;
    if (!name || !state.tabs.includes(name)) {
      if (name) toast("当前账号无该页面权限", "bad");
      name = state.tabs[0];
      if (!name) return;
    }
    state.tab = name;
    state.panelOpen = true;
    el.panel.classList.remove("hide");
    $("#btnPanel").classList.add("active");
    $$(".tab", el.panelTabs).forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === name));
    const meta = TABS.find((t) => t.id === name);
    el.panelTitle.textContent = `数据与安全${meta ? " · " + meta.label : ""}`;
    loadTab();
  }

  function openPanel(tab) {
    if (!state.tabs.length) buildTabs();
    setTab(tab || state.tab || state.tabs[0]);
  }
  function closePanel() {
    state.panelOpen = false;
    el.panel.classList.add("hide");
    $("#btnPanel")?.classList.remove("active");
  }
  function togglePanel() {
    if (state.panelOpen) closePanel();
    else openPanel();
  }

  async function loadTab() {
    if (!state.panelOpen || !state.tab) return;
    try {
      if (state.tab === "ledger") return await loadLedger();
      if (state.tab === "reports") return await loadReports();
      if (state.tab === "memory") return await loadMemory();
      if (state.tab === "audit") return await loadAudit();
      if (state.tab === "permissions") return await loadPermissions();
      if (state.tab === "demo") return await loadDemo();
    } catch (e) {
      el.panelBody.innerHTML = `<p class="bad">读取失败：${esc(e.message || e)}</p>`;
    }
  }

  function panelError(msg) {
    el.panelBody.innerHTML = `<p class="bad">${esc(msg || "读取失败")}</p>`;
  }

  /* ---------------------------- 台账 ---------------------------- */
  async function loadLedger() {
    el.panelBody.innerHTML = '<p class="muted">读取台账状态…</p>';
    const r = await api("/api/ledger");
    if (!r) return;
    if (!r.ok) return panelError(r.error || "读取台账失败");
    const st = r.stats || {};
    const scope = r.scope || {};
    const sources = r.sources || [];
    const conflicts = r.conflicts || [];
    const versions = r.versions || [];
    const events = r.events || [];
    const paths = r.paths || {};
    const master = r.master || {};
    const p = state.user?.permissions || {};
    const canSync = !!p["ledger.sync"];
    const canAdmin = !!p["ledger.admin"];

    const srcRows = sources.map((s) => {
      const stateTxt = { ok: "正常", empty: "无数据", error: "解析失败", missing: "文件已移除" }[s.state] || s.state || "—";
      return `<tr>
        <td title="${esc(s.file_path || "")}">${esc(s.display_name || s.source_id || "—")}</td>
        <td class="r">${num(s.n_records)}</td>
        <td><span class="state ${esc(s.state || "")}">${esc(stateTxt)}</span></td>
        <td class="r">${fmtTime(s.last_sync)}</td>
      </tr>`;
    }).join("");

    const conflictsHtml = conflicts.length
      ? `<h4>跨人登记冲突 <span class="badge-count">${conflicts.length}</span></h4>
         <ul class="conflicts">${conflicts.slice(0, 6).map((c) => {
           const field = { defects: "不良数", inspected: "检验数", defect_item: "不良项", disposition: "处理方式" }[c.field] || c.field;
           return `<li><b>${esc(field)}</b> <code>${esc(c.value_map || "")}</code></li>`;
         }).join("")}</ul>`
      : `<p class="muted">没有未解决的冲突。</p>`;

    const versionsHtml = versions.length
      ? `<h4>版本记录</h4>
         <ul class="versions">${versions.slice(0, 5).map((v) => `<li>
           <span>${fmtTime(v.ts)} · v${esc(v.id)} · ${esc(v.note || v.kind || "")}</span>
           ${v.snapshot && canAdmin ? `<button class="mini" data-act="restore" data-id="${esc(v.id)}">回滚</button>` : ""}
         </li>`).join("")}</ul>` : "";

    const hidden = Number(r.hidden_records ?? st.hidden_records ?? scope.hidden_records ?? 0);
    const scopeLabel = scope.label || SCOPE_LABEL[scope.ledger] || "—";
    el.panelBody.innerHTML = `
      <div class="scope-banner">
        <b>台账范围：${esc(scopeLabel)}</b>
        ${hidden ? `<span class="hidden-note">另有 ${num(hidden)} 条记录按权限隐藏（不显示来源名）</span>` : ""}
      </div>
      <div class="p-actions">
        ${canSync ? '<button class="primary" data-act="sync" data-force="0">立即同步</button>' +
          '<button class="ghost" data-act="sync" data-force="1">强制重读</button>' : ""}
        <a class="ghost" href="/api/template?kind=check">检验台账模板</a>
        <a class="ghost" href="/api/template?kind=measure">测量台账模板</a>
      </div>
      <div class="p-kpis">
        <div><b>${num(st.records)}</b><span>记录</span></div>
        <div><b>${num(st.sources)}</b><span>来源</span></div>
        <div><b>${num(st.conflicts ?? conflicts.length)}</b><span>冲突</span></div>
        <div><b>v${esc(st.data_version || "0")}</b><span>数据版本</span></div>
      </div>
      <p class="muted">监听：${r.watching ? "运行中（约 8 秒扫描一次）" : "未启动"} ｜
        日期：${esc(st.date_min || "—")} ~ ${esc(st.date_max || "—")}</p>
      <p class="pathline">提交区：<code>${esc(paths.submission || "")}</code></p>
      <p class="pathline">主档：<code>${esc(paths.master_file || "")}</code>
        ${master.path ? `<button class="mini" data-act="open" data-path="${esc(master.path)}">打开</button>` : ""}</p>
      <h4>来源清单（只显示当前账号可见范围）</h4>
      <table class="p-table"><thead><tr><th>来源</th><th class="r">条数</th><th>状态</th><th class="r">最近同步</th></tr></thead>
        <tbody>${srcRows || '<tr><td colspan="4" class="muted">还没有可见的成员提交台账</td></tr>'}</tbody></table>
      ${conflictsHtml}
      ${versionsHtml}
      <h4>记录检索</h4>
      <div class="rec-search">
        <input id="pRecQ" placeholder="料号 / 不良项 / 日期，如 A-1001">
        <button class="mini" data-act="records">查询</button>
      </div>
      <div id="pRecOut"></div>
      <h4>最近同步事件</h4>
      <ul class="events">${events.slice(0, 6).map((e) => `<li>${fmtTime(e.ts)} · ${esc(e.detail || e.kind || "")}</li>`).join("") || '<li class="muted">暂无</li>'}</ul>`;
    const recInput = $("#pRecQ");
    if (recInput) {
      recInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); loadRecords(); }
      });
    }
  }

  async function loadRecords() {
    const out = $("#pRecOut");
    const input = $("#pRecQ");
    if (!out) return;
    const q = (input?.value || "").trim();
    out.innerHTML = '<p class="muted">查询中…</p>';
    const r = await api(`/api/ledger/records?q=${encodeURIComponent(q)}&limit=30`);
    if (!r || !r.ok) {
      out.innerHTML = `<p class="bad">${esc(r?.error || "查询失败")}</p>`;
      return;
    }
    const recs = r.records || [];
    const rows = recs.slice(0, 10).map((x) => `<tr>
      <td>${esc(x.date || "—")}</td>
      <td>${esc(x.part_no || "—")}</td>
      <td>${esc(x.stage || "—")}</td>
      <td class="r">${x.inspected != null ? num(x.inspected) : "—"}</td>
      <td class="r">${x.defects != null ? num(x.defects) : "—"}</td>
      <td>${esc(x.defect_item || "")}</td>
      <td>${esc(x.source || "")}</td>
    </tr>`).join("");
    out.innerHTML = `<p class="rec-hit">命中 ${num(r.count ?? recs.length)} 条，显示 ${Math.min(recs.length, 10)} 条${q ? `（关键词：${esc(q)}）` : ""}</p>` +
      (rows
        ? `<table class="p-table"><thead><tr><th>日期</th><th>料号</th><th>工序</th><th class="r">检验</th><th class="r">不良</th><th>不良项</th><th>来源</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="muted">没有匹配的记录。</p>');
  }

  async function doSync(force) {
    const r = await api("/api/ledger/sync", { method: "POST", body: { force: !!force } });
    if (!r || !r.ok) return;
    const res = r.result || {};
    toast(`同步完成：${res.records ?? 0} 条，冲突 ${res.conflicts ?? 0}`, "good");
    await loadLedger();
    await refreshStatus();
  }

  /* ---------------------------- 报表 ---------------------------- */
  async function loadReports() {
    el.panelBody.innerHTML = '<p class="muted">读取报表…</p>';
    const r = await api("/api/reports");
    if (!r) return;
    if (!r.ok) return panelError(r.error || "读取报表失败");
    state.reports = r.reports || [];
    const items = state.reports;
    const canGenerate = !!state.user?.permissions?.["report.generate"];
    if (!items.length) {
      el.panelBody.innerHTML = `<p class="panel-empty">${canGenerate
        ? "当前账号还没有可下载的报表。在对话里说「生成 2026 年 9 月的不良率报表，按料号，导出 Excel」即可。"
        : "当前账号无生成报表的权限，也没有可见的历史报表。"}</p>`;
      return;
    }
    el.panelBody.innerHTML = items.map((it) => {
      const spec = it.spec || {};
      const period = spec.period || {};
      const files = (it.files || []).filter((f) => f && f.ok);
      const links = files.map((f) => {
        const label = { xlsx: "Excel", pptx: "PPT", txt: "摘要" }[f.format] || f.format;
        return f.url
          ? `<a class="dl" href="${esc(f.url)}">${esc(label)}</a>`
          : `<button class="mini" data-act="open" data-path="${esc(f.path || "")}">${esc(label)}</button>`;
      }).join("");
      const owner = it.owner ? ` · 生成人 ${esc(accountName(it.owner))}` : "";
      return `<div class="p-report">
        <div class="t">${esc(spec.title || "质量分析报表")}<span class="muted"> ${esc(period.label || "")}</span></div>
        <div class="muted">${fmtTime(it.created_at)}${owner} · 数据版本 v${esc(it.data_version || "?")} · 复用 ${num(it.used ?? 0)} 次</div>
        <div class="links">${links || '<span class="muted">无可下载文件</span>'}</div>
      </div>`;
    }).join("");
  }

  /* ---------------------------- 记忆 ---------------------------- */
  async function loadMemory() {
    el.panelBody.innerHTML = '<p class="muted">读取记忆…</p>';
    const r = await api("/api/memory");
    if (!r) return;
    if (!r.ok) return panelError(r.error || "读取记忆失败");
    const st = r.stats || {};
    const terms = r.terms || [];
    const recent = r.recent || [];
    const scopeText = r.scope === "all" ? "全员记忆" : "本人记忆";
    el.panelBody.innerHTML = `
      <div class="scope-banner"><b>记忆范围：${esc(scopeText)}</b></div>
      <div class="p-kpis">
        <div><b>${num(st.total)}</b><span>问过</span></div>
        <div><b>${num(st.cached)}</b><span>命中记忆</span></div>
        <div><b>${num(st.refused)}</b><span>拒答</span></div>
        <div><b>${num((r.reports || []).length)}</b><span>报表缓存</span></div>
      </div>
      <h4>常问主题</h4>
      <div class="terms">${terms.slice(0, 14).map((t) => `<span class="term">${esc(t.term)} ×${num(t.hits)}</span>`).join("") || '<span class="muted">暂无</span>'}</div>
      <h4>最近问过</h4>
      <ul class="events">${recent.slice(0, 12).map((q) => `<li><span>${fmtTime(q.ts)} · [${esc(INTENT_LABEL[q.intent] || q.intent)}] ${esc(q.question)}</span></li>`).join("") || '<li class="muted">暂无</li>'}</ul>
      <p class="muted">重复问题会秒回；台账与文件没变时报表不重复计算。</p>
      <button class="ghost danger" data-act="mem-clear">清空${r.scope === "all" ? "全员" : "我的"}记忆与缓存</button>`;
  }

  /* ---------------------------- 审计 ---------------------------- */
  function actionLabel(ev) {
    return ev.action_label || ACTION_LABEL[ev.action] || ev.action || "—";
  }
  function resultBadge(result) {
    const [text, cls] = RESULT_LABEL[result] || [result || "—", ""];
    return `<span class="${cls}">${esc(text)}</span>`;
  }

  function renderAuditRows() {
    const wrap = $("#auditRows");
    if (!wrap) return;
    const { action, user } = state.auditFilter;
    const evs = (state.auditEvents || []).filter((ev) => {
      if (action && ev.action !== action) return false;
      if (user) {
        const hay = `${ev.user_name || ""} ${ev.user || ""} ${ev.role_name || ""}`;
        if (!hay.includes(user)) return false;
      }
      return true;
    });
    const count = $("#auditCount");
    if (count) count.textContent = `共 ${evs.length} 条${(action || user) ? "（已筛选）" : ""}`;
    wrap.innerHTML = evs.length
      ? evs.slice(0, 150).map((ev) => `<tr>
          <td>${fmtTime(ev.ts)}</td>
          <td title="${esc(ev.role_name || "")}">${esc(ev.user_name || ev.user || "—")}</td>
          <td>${esc(actionLabel(ev))}</td>
          <td class="detail">${esc(ev.detail || "")}</td>
          <td>${resultBadge(ev.result)}</td>
        </tr>`).join("")
      : '<tr><td colspan="5" class="muted">没有符合条件的审计记录。</td></tr>';
  }

  async function loadAudit() {
    el.panelBody.innerHTML = '<p class="muted">读取审计与授权申请…</p>';
    const [audit, reqs] = await Promise.all([
      api("/api/audit?limit=200"),
      api("/api/access/requests"),
    ]);
    if (!audit) return;
    if (!audit.ok) return panelError(audit.error || "读取审计日志失败");
    state.auditEvents = audit.events || [];
    state.accessReqs = reqs?.ok ? reqs : { pending: [], decided: [] };
    const req = state.accessReqs;
    const pending = req.pending || [];
    const decided = req.decided || [];

    const pendingHtml = pending.length
      ? `<div class="pending-wrap">
          <h4>待审批授权申请 <span class="badge-count">${pending.length}</span></h4>
          ${pending.map((q) => {
            const lv = levelBadgeHtml(q.level, q.level_name, "font-size:12px");
            const who = q.user_name || displayNameOf(q.username);
            const role = q.role_name || roleNameOf(q.username);
            return `<div class="pending-card">
              <div class="pending-head">
                <span class="pending-who">${esc(who)}${role ? `（${esc(role)}）` : ""}</span>
                ${lv}
              </div>
              <div class="muted">${fmtTime(q.ts)} · 申请「${esc(levelInfo(q.level)?.name || `${q.level} 级`)}」授权</div>
              <div class="pending-reason">${esc(q.reason || "（未填写）")}</div>
              <div class="pending-ops">
                <select data-minutes="${esc(q.id)}" title="授权时长">
                  <option value="15">15 分钟</option>
                  <option value="30" selected>30 分钟</option>
                  <option value="60">60 分钟</option>
                  <option value="120">120 分钟</option>
                </select>
                <input data-note="${esc(q.id)}" placeholder="审批意见（可选）">
                <button class="primary" data-act="approve" data-id="${esc(q.id)}">批准</button>
                <button class="ghost danger" data-act="deny" data-id="${esc(q.id)}">驳回</button>
              </div>
            </div>`;
          }).join("")}
        </div>`
      : `<p class="panel-empty">当前没有待审批的授权申请。</p>`;

    const decidedHtml = decided.length
      ? `<h4>最近处理</h4><ul class="events">${decided.slice(0, 8).map((q) => {
          const ok = ["approved", "granted", "ok", true].includes(q.status) || q.approve === true;
          return `<li><span>${fmtTime(q.ts)} · ${esc(q.user_name || displayNameOf(q.username))} · ${esc(levelInfo(q.level)?.name || q.level_name || (q.level ? q.level + " 级" : ""))} · ${ok ? "已批准" : "已驳回"}${q.note ? ` · ${esc(q.note)}` : ""}</span></li>`;
        }).join("")}</ul>` : "";

    const actionOptions = Object.entries(ACTION_LABEL).map(([k, v]) =>
      `<option value="${esc(k)}">${esc(v)}</option>`).join("");

    el.panelBody.innerHTML = `
      ${pendingHtml}
      ${decidedHtml}
      <h4>审计日志</h4>
      <div class="audit-filters">
        <select id="auditAction" title="按动作筛选"><option value="">全部动作</option>${actionOptions}</select>
        <input id="auditUser" placeholder="按用户筛选，如 王芳" value="${esc(state.auditFilter.user)}">
      </div>
      <p class="muted" id="auditCount" style="margin:0 0 6px"></p>
      <table class="audit-table">
        <thead><tr><th class="col-time">时间</th><th class="col-user">用户</th><th class="col-act">动作</th><th>详情</th><th class="col-res">结果</th></tr></thead>
        <tbody id="auditRows"></tbody>
      </table>`;
    const sel = $("#auditAction");
    const uin = $("#auditUser");
    if (sel) {
      sel.value = state.auditFilter.action;
      sel.addEventListener("change", () => { state.auditFilter.action = sel.value; renderAuditRows(); });
    }
    if (uin) {
      uin.addEventListener("input", () => { state.auditFilter.user = uin.value.trim(); renderAuditRows(); });
    }
    renderAuditRows();
  }

  async function decideAccess(btn, approve) {
    const id = Number(btn.dataset.id);
    const card = btn.closest(".pending-card");
    const minutes = Number(card?.querySelector("select[data-minutes]")?.value || 30);
    const note = (card?.querySelector("input[data-note]")?.value || "").trim();
    btn.disabled = true;
    const r = await api("/api/access/approve", {
      method: "POST", body: { id, approve, minutes, note },
    });
    btn.disabled = false;
    if (!r) return;
    if (!r.ok) { toast(r.error || "操作失败", "bad"); return; }
    toast(approve ? `已批准，临时授权 ${minutes} 分钟` : "已驳回该申请", approve ? "good" : "");
    await loadAudit();
    await refreshStatus();
  }

  /* ---------------------------- 权限 ---------------------------- */
  async function loadPermissions() {
    el.panelBody.innerHTML = '<p class="muted">读取权限策略…</p>';
    const r = await api("/api/policy");
    if (!r) return;
    if (!r.ok) return panelError(r.error || "读取权限策略失败");
    state.policy = r;
    renderPermBar();
    renderWatermark();
    const me = r.me || state.user || {};
    const levels = r.levels || LEVEL_FALLBACK;
    const features = r.features || {};
    const roles = r.roles || {};
    const scopeLabels = { all: "全部门", own: "仅本人", complaints: "客诉范围", none: "无" };
    const maskAliases = r.mask_aliases || {};
    const maskCodes = me.mask_categories || state.user?.mask_categories || [];
    const maskText = (Array.isArray(maskCodes) && maskCodes.length)
      ? `自动脱敏：${maskCodes.map((c) => maskAliases[c] || MASK_LABEL[c] || c).join("、")}`
      : "无需脱敏（可查看完整字段）";
    const featMine = me.features || me.permissions || state.user?.permissions || {};
    const featureGrid = Object.entries(features).map(([k, label]) => {
      const on = !!featMine[k];
      return `<span><span class="${on ? "yes" : "no"}">${on ? "✓" : "✗"}</span>${esc(label)}</span>`;
    }).join("");

    const myRoleKey = me.role || state.user?.role;
    const cols = Object.keys(features);
    const head = `<tr><th class="role">角色</th>${cols.map((k) => `<th title="${esc(features[k])}">${esc(features[k])}</th>`).join("")}</tr>`;
    const body = Object.entries(roles).map(([key, role]) => {
      const own = key === myRoleKey;
      const fs = new Set(role.features || []);
      return `<tr class="${own ? "own" : ""}">
        <td class="role">${esc(role.name || key)}<span class="muted" style="font-size:12px"> · ${esc((levels.find((l) => l.level === role.max_level) || {}).name || role.max_level + " 级")}</span></td>
        ${cols.map((c) => `<td><span class="${fs.has(c) ? "yes" : "no"}">${fs.has(c) ? "✓" : "✗"}</span></td>`).join("")}
      </tr>`;
    }).join("");

    let myAccessHtml = "";
    if (!state.user?.permissions?.["access.approve"]) {
      const rq = await api("/api/access/requests", { silent: true });
      if (rq?.ok) {
        const grantList = rq.grants || (rq.grant ? [rq.grant] : []);
        const grant = grantList.find((g) => Number(g.expires_at || 0) > Date.now() / 1000) || grantList[0];
        const grantTxt = grant
          ? `临时授权：${esc(levelInfo(grant.level)?.name || `${grant.level} 级`)}，至 ${fmtClock(grant.expires_at)}`
          : "暂无临时授权";
        const levelTxt = (level) => levelInfo(level)?.name || (level ? `${level} 级` : "");
        const pendingRows = (rq.pending || []).map((q) =>
          `<li><span>${fmtTime(q.ts)} · ${esc(levelTxt(q.level))} · 待审批 · ${esc(q.reason || "")}</span></li>`).join("");
        const decidedRows = (rq.decided || []).slice(0, 4).map((q) =>
          `<li><span>${fmtTime(q.ts)} · ${esc(levelTxt(q.level))} · ${q.status === "approved" ? "已批准" : (q.status === "denied" ? "已驳回" : "已处理")}${q.note ? ` · ${esc(q.note)}` : ""}</span></li>`).join("");
        myAccessHtml = `<div class="perm-card">
          <h4 style="margin-top:0">我的授权申请</h4>
          <p class="muted" style="margin:0 0 6px">${grantTxt}</p>
          <ul class="events">${pendingRows}${decidedRows || (pendingRows ? "" : '<li class="muted">暂无授权申请记录</li>')}</ul>
        </div>`;
      }
    }

    el.panelBody.innerHTML = `
      <div class="perm-card">
        <div class="who">
          <b>${esc(me.display_name || state.user.display_name)}</b>
          ${levelBadgeHtml(me.level || state.user.level, me.level_name || state.user.level_name)}
          <span class="muted">${esc(me.role_name || ROLE_FALLBACK[me.role] || "")}</span>
        </div>
        <div class="kv">
          <span class="k">所属部门</span><span>${esc(me.department || state.user.department || "—")}</span>
          <span class="k">可见密级</span><span>${esc((levels.filter((l) => l.level <= Number(me.level || state.user.level)).map((l) => l.name).join(" / ")) || "—")}</span>
          <span class="k">台账范围</span><span>${esc(scopeLabels[me.scope?.ledger] || me.scope_label || scopeLabels[state.user.scope?.ledger] || "—")}</span>
          <span class="k">报表范围</span><span>${esc(scopeLabels[me.scope?.report] || scopeLabels[state.user.scope?.report] || "—")}</span>
          <span class="k">脱敏</span><span>${esc(maskText)}</span>
          ${grantedText() ? `<span class="k">临时授权</span><span class="grant-text" style="color:#047857">${esc(grantedText())}</span>` : ""}
        </div>
        <h4>功能开关</h4>
        <div class="feature-grid">${featureGrid}</div>
      </div>
      ${myAccessHtml}
      <h4>角色 × 功能矩阵（高亮为当前角色）</h4>
      <div class="matrix-wrap"><table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <h4>密级图例</h4>
      <ul class="level-legend">${levels.map((l) =>
        `<li><span class="lv-dot" style="background:${esc(l.color)}"></span><b>${esc(l.name)}</b><span class="desc">${esc(l.desc || "")}</span></li>`).join("")}</ul>`;
  }

  async function clearMemory() {
    if (!confirm("确认清空查询记忆与报表缓存？（台账数据不受影响）")) return;
    const r = await api("/api/memory/clear", { method: "POST", body: {} });
    if (!r || !r.ok) return;
    toast(`已清空：${r.qcache ?? 0} 条问答、${r.report_cache ?? 0} 份报表`, "good");
    await loadMemory();
    await refreshStatus();
  }

  /* ---------------------------- 演示控制台 ---------------------------- */
  async function loadDemo() {
    el.panelBody.innerHTML = '<p class="muted">读取演示场景…</p>';
    let data = state.scenarios;
    if (!data) {
      const r = await api("/api/demo/scenarios");
      if (!r) return;
      if (!r.ok) return panelError(r.error || "读取演示场景失败");
      data = r;
      state.scenarios = r;
    }
    const list = data.scenarios || [];
    list.forEach((s) => {
      if (s.account_info?.username) state.accountInfo[s.account_info.username] = s.account_info;
    });
    const canSim = !!state.user?.permissions?.["demo.control"];
    const cards = list.map((s) => {
      const info = s.account_info || accountByUsername(s.account);
      const account = info
        ? `${info.display_name || s.account}${info.role_name ? `（${info.role_name}）` : ""}`
        : accountName(s.account);
      const actionLabel = DEMO_ACTION_LABEL[s.action] || s.action;
      const active = state.scenarioId === s.id;
      return `<div class="sc-card ${active ? "active" : ""}" data-scid="${esc(s.id)}">
        <div class="sc-head">
          <span class="sc-id">${esc(s.id)}</span>
          <span class="sc-phase">${esc(s.phase || "")}</span>
          <span class="sc-min">${esc(s.minutes || "—")} 分钟</span>
        </div>
        <div class="sc-title">${esc(s.title || "")}</div>
        <div class="sc-line">账号：<b>${esc(account)}</b> · 动作：${esc(actionLabel)}</div>
        ${s.question ? `<div class="sc-q">问题：${esc(s.question)}</div>` : ""}
        <div class="sc-why"><b>为什么：</b>${esc(s.why || "")}</div>
        <div class="sc-expect"><b>预期：</b>${esc(s.expect || "")}</div>
        <div class="sc-ops">
          <button class="ghost" data-act="demo-switch" data-user="${esc(s.account)}">切换到该账号</button>
          <button class="primary" data-act="demo-run" data-id="${esc(s.id)}">执行</button>
        </div>
      </div>`;
    }).join("");
    el.panelBody.innerHTML = `
      <div class="demo-head">
        <h3>${esc(data.title || "权限与保密演示")}</h3>
        <p>${esc(data.intro || "")}</p>
        <div class="p-actions">
          ${canSim ? '<button class="primary" data-act="sim-save" id="btnSimSave">模拟王芳保存台账</button>' : ""}
          <button class="ghost danger" data-act="demo-reset">重置演示</button>
        </div>
      </div>
      ${cards || '<p class="panel-empty">没有演示场景。</p>'}
      <p class="demo-foot">按场景顺序点「执行」即可；「模拟保存」后监听器会在 8 秒内把新台账合并进主档。</p>`;
    if (state.scenarioScroll) {
      state.scenarioScroll = false;
      const active = el.panelBody.querySelector(".sc-card.active");
      if (active) active.scrollIntoView({ block: "center" });
    }
  }

  async function executeScenario(id, btn) {
    const list = state.scenarios?.scenarios || [];
    const sc = list.find((x) => x.id === id);
    if (!sc) { toast("未找到该演示场景", "bad"); return; }
    state.scenarioId = sc.id;
    if (state.user?.username !== sc.account) {
      toast(`正在切换到 ${accountName(sc.account)}…`);
      const ok = await switchAccount(sc.account, { quiet: true });
      if (!ok) return;
    }
    const action = sc.action;
    if (action === "ask" || action === "report") {
      if (!sc.question) { toast("该场景没有预设问题", "bad"); return; }
      await ask(sc.question);
    } else if (action === "approve") {
      setTab("audit");
      toast("请在审计页批准待处理的授权申请");
    } else if (action === "audit") {
      setTab("audit");
    } else if (action === "policy") {
      setTab("permissions");
    } else if (action === "simulate_save") {
      if (!state.panelOpen || state.tab !== "demo") setTab("demo");
      await simulateSave($("#btnSimSave") || btn);
    } else {
      toast("未知的场景动作：" + action, "bad");
    }
    if (state.scenarioId === sc.id && state.panelOpen && state.tab === "demo") {
      loadDemo();
    }
  }

  async function simulateSave(btn) {
    if (state.counting) { toast("正在等待上一次模拟保存合并，请稍候"); return; }
    const r = await api("/api/demo/simulate-ledger-save", { method: "POST", body: {} });
    if (!r) return;
    if (!r.ok) { toast(r.error || "模拟保存失败", "bad"); return; }
    toast(r.message || "已模拟保存台账", "good");
    const target = btn || $("#btnSimSave");
    const oldText = target ? (target.dataset.oldText || target.textContent) : "";
    if (target) target.dataset.oldText = oldText;
    state.counting = true;
    let left = 10;
    const paint = () => {
      if (!target) return;
      target.disabled = true;
      target.textContent = `等待合并… ${left}s`;
    };
    paint();
    state.countdownTimer = setInterval(async () => {
      left -= 1;
      if (left > 0) { paint(); return; }
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      state.counting = false;
      if (target) {
        target.disabled = false;
        target.textContent = oldText || "模拟王芳保存台账";
        delete target.dataset.oldText;
      }
      await refreshStatus();
      const v = versionOf(state.status);
      addSystemMsg(`系统提示：已检测到王芳提交区的台账更新，主档记录已刷新（数据版本 v${v || "?"}）。`);
      if (state.panelOpen) loadTab();
    }, 1000);
  }

  async function resetDemo() {
    if (!confirm("确认重置演示？将清空本次演示产生的记忆、审计与授权，并重建演示台账。")) return;
    const r = await api("/api/demo/reset", { method: "POST", body: {} });
    if (!r) return;
    if (!r.ok) { toast(r.error || "重置失败（服务可能未实现该接口）", "bad"); return; }
    toast("已重置演示数据", "good");
    state.lastVersion = null;
    state.scenarioId = null;
    await refreshStatus();
    if (state.panelOpen) loadTab();
  }

  /* ============================== 授权申请弹窗 ============================== */
  function maxLevel() {
    const arr = state.policy?.levels?.length ? state.policy.levels : LEVEL_FALLBACK;
    return Math.max(...arr.map((l) => Number(l.level) || 1));
  }

  function openAccessRequest(level, hint) {
    if (!state.user?.permissions?.["access.request"]) {
      toast("当前账号无申请授权的权限", "bad");
      return;
    }
    const maxLv = maxLevel();
    let lv = Number(level) || 0;
    if (!lv || lv <= Number(state.user.level || 0)) {
      lv = Math.min(Number(state.user.level || 1) + 1, maxLv);
    }
    if (lv > maxLv) lv = maxLv;
    state.modalLevel = lv;
    const info = levelInfo(lv) || { name: `${lv} 级`, color: "#475569" };
    el.modalTitle.textContent = "申请临时授权";
    el.modalBody.innerHTML = `
      <div class="modal-row"><span class="muted">目标密级</span>
        ${levelBadgeHtml(lv, info.name)}
        <span class="muted">· 审批通过后限时可见</span></div>
      <div class="modal-row"><span class="muted">申请人</span>
        <b>${esc(state.user.display_name)}（${esc(state.user.role_name || ROLE_FALLBACK[state.user.role] || "")}）</b>
        <span class="muted">· 当前可见至 ${esc(state.user.level_name || "")}</span></div>
      <label class="modal-label">用途说明 <span class="req">*</span><span class="muted">至少 5 个字，审批人可见</span>
        <textarea id="reqReason" rows="3" maxlength="300" placeholder="${esc(hint || "例如：处理客户审核整改，需要查看审核报告")}"></textarea>
      </label>
      <p class="modal-error hide" id="reqErr"></p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-modal-close="1">取消</button>
        <button type="button" class="primary" id="reqSubmit">提交申请</button>
      </div>
      <p class="modal-hint">审批通过后顶栏显示「临时授权至 HH:MM」，到期自动失效；全程记录审计。</p>`;
    openModal();
    $("#reqSubmit").addEventListener("click", submitAccessRequest);
    $("#reqReason").focus();
  }

  async function submitAccessRequest() {
    const reasonEl = $("#reqReason");
    const errEl = $("#reqErr");
    const btn = $("#reqSubmit");
    const reason = (reasonEl?.value || "").trim();
    if (reason.length < 5) {
      errEl.textContent = "请填写用途说明（至少 5 个字）";
      errEl.classList.remove("hide");
      reasonEl?.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = "提交中…";
    const r = await api("/api/access/request", {
      method: "POST", body: { level: state.modalLevel, reason },
    });
    btn.disabled = false;
    btn.textContent = "提交申请";
    if (!r) return;
    if (r.ok) {
      closeModal();
      toast("已提交，等待经理审批", "good");
      if (state.panelOpen && state.tab === "permissions") loadTab();
    } else {
      errEl.textContent = r.error || "提交失败";
      errEl.classList.remove("hide");
    }
  }

  /* ============================== 文件 / 路径 ============================== */
  async function openPath(path) {
    if (!path) return;
    const r = await api("/api/open?path=" + encodeURIComponent(path));
    if (!r) return;
    if (r.ok) toast("已在资源管理器中定位文件");
    else toast(r.error || "打开失败", "bad");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("路径已复制");
    } catch {
      toast(text);
    }
  }

  /* ============================== URL 参数 ============================== */
  function applyUrlParams() {
    if (!state.user) return;
    const p = state.params;
    const panelParam = p.get("panel");
    const tabParam = (p.get("tab") || "").trim();
    if (panelParam) {
      const tab = state.tabs.includes(tabParam) ? tabParam : state.tabs[0];
      if (tab) setTab(tab);
    }
    const sc = (p.get("scenario") || "").trim().toUpperCase();
    if (sc) {
      state.scenarioId = sc;
      if (state.user.permissions?.["demo.control"] && state.tabs.includes("demo")) {
        setTab("demo");
        state.scenarioScroll = true;
      }
    }
    const q = p.get("q");
    if (q && !state.qDone) {
      state.qDone = true;
      try {
        const u = new URL(location.href);
        u.searchParams.delete("q");
        history.replaceState(null, "", u.pathname + (u.search ? `?${u.searchParams.toString()}` : "") + u.hash);
      } catch { /* 忽略 */ }
      const askDelay = p.get("panel") ? 300 : 80;
      const scrollTopAfter = (p.get("scroll") || "").toLowerCase() === "top";
      setTimeout(() => ask(q, { scrollTopAfter }), askDelay);
    }
  }

  /* ============================== 演示账号名称 ============================== */
  function accountByUsername(username) {
    return state.demoAccounts.find((x) => x.username === username) ||
      state.accountInfo[username] || null;
  }
  function displayNameOf(username) {
    if (!username) return "—";
    const a = accountByUsername(username);
    return a?.display_name || username;
  }
  function roleNameOf(username) {
    const a = accountByUsername(username);
    if (!a) return "";
    return a.role_name || state.policy?.roles?.[a.role]?.name || a.role || "";
  }
  /** 展示用路径：真实路径只在「打开/复制」按钮里用，正文最多显示末三级 */
  function shortPath(p) {
    const raw = String(p || "");
    if (!raw) return "";
    const parts = raw.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 3) return raw;
    return "…\\" + parts.slice(-3).join("\\");
  }
  /** 来源卡片展示路径：优先 display_path，并去掉本机绝对路径前缀 */
  function displayPathOf(c) {
    let dp = String(c?.display_path || "").trim();
    if (dp) {
      const hit = dp.search(/(公共盘|质量部)[\\/]/);
      if (hit > 0) dp = dp.slice(hit);
      else if (/^[A-Za-z]:[\\/]/.test(dp) || dp.startsWith("\\\\")) dp = shortPath(dp);
      const useful = /[\\/]/.test(dp) || dp.length >= 8;
      if (useful) return dp;
    }
    return shortPath(c?.path);
  }
  function accountName(username) {
    if (!username) return "—";
    const a = accountByUsername(username);
    if (!a) return username;
    const role = a.role_name || (a.role && state.policy?.roles?.[a.role]?.name) || a.role || "";
    return `${a.display_name || username}${role ? `（${role}）` : ""}`;
  }

  /* ============================== 事件绑定 ============================== */
  function autoGrow() {
    if (!el.input) return;
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 150) + "px";
  }

  function bindEvents() {
    /* --- 登录页 --- */
    el.accountGrid.addEventListener("click", (ev) => {
      const card = ev.target.closest(".acc-card");
      if (!card) return;
      fillLoginAccount(card.dataset.user);
    });
    el.loginForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      doLogin();
    });
    el.loginBack.addEventListener("click", backToApp);
    [el.loginUser, el.loginPass].forEach((node) =>
      node.addEventListener("input", () => el.loginError.classList.add("hide")));

    /* --- 对话 --- */
    el.send.addEventListener("click", () => ask());
    el.input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        ask();
      }
    });
    el.input.addEventListener("input", autoGrow);

    el.chat.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (t.classList.contains("chip")) { ask(t.dataset.q); return; }
      if (t.dataset?.open) { await openPath(t.dataset.open); return; }
      if (t.dataset?.copy) { await copyText(t.dataset.copy); return; }
      if (t.dataset?.denyToggle) {
        const box = document.getElementById(t.dataset.denyToggle);
        if (box) box.classList.toggle("hide");
        return;
      }
      if (t.dataset?.applyLevel !== undefined) {
        openAccessRequest(Number(t.dataset.applyLevel));
        return;
      }
    });

    /* --- 顶栏 --- */
    $("#btnPanel").addEventListener("click", togglePanel);
    $("#btnMyPerm").addEventListener("click", () => openPanel("permissions"));
    $("#btnSwitch").addEventListener("click", () => showLogin({ switchMode: true }));
    $("#btnLogout").addEventListener("click", doLogout);
    $("#permClose").addEventListener("click", () => {
      state.permBarClosed = true;
      sessionStorage.setItem("qa_perm_bar_closed", "1");
      renderPermBar();
    });

    /* --- 侧栏 --- */
    $("#panelClose").addEventListener("click", closePanel);
    el.panelTabs.addEventListener("click", (ev) => {
      const tab = ev.target.closest(".tab");
      if (tab?.dataset.tab) setTab(tab.dataset.tab);
    });
    el.panelBody.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "sync") { await doSync(btn.dataset.force === "1"); return; }
      if (act === "restore") {
        const id = Number(btn.dataset.id);
        if (!confirm(`确认把主档回滚到版本 #${id}？当前主档会先自动备份。`)) return;
        const r = await api("/api/ledger/restore", { method: "POST", body: { id } });
        if (r?.ok) { toast(`已回滚到版本 #${id}`, "good"); await loadLedger(); await refreshStatus(); }
        return;
      }
      if (act === "open") { await openPath(btn.dataset.path); return; }
      if (act === "records") { await loadRecords(); return; }
      if (act === "mem-clear") { await clearMemory(); return; }
      if (act === "approve") { await decideAccess(btn, true); return; }
      if (act === "deny") { await decideAccess(btn, false); return; }
      if (act === "demo-switch") {
        const card = btn.closest(".sc-card");
        if (card?.dataset.scid) state.scenarioId = card.dataset.scid;
        const ok = await switchAccount(btn.dataset.user);
        if (ok && state.tabs.includes("demo")) setTab("demo");
        return;
      }
      if (act === "demo-run") { await executeScenario(btn.dataset.id, btn); return; }
      if (act === "demo-reset") { await resetDemo(); return; }
      if (act === "sim-save") { await simulateSave(btn); return; }
    });

    /* --- 弹窗 / Esc --- */
    document.addEventListener("click", (ev) => {
      if (ev.target.matches("[data-modal-close]")) closeModal();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        if (isModalOpen()) closeModal();
        else if (state.panelOpen) closePanel();
      }
    });
  }

  /* ============================== 启动 ============================== */
  async function boot() {
    const params = new URLSearchParams(location.search);
    state.params = params;
    const as = (params.get("as") || "").trim();

    const me = await rawGet("/api/auth/me");
    const sessionData = (me.status === 200 && me.data?.ok && me.data.user) ? me.data : null;

    if (sessionData && (!as || as === sessionData.user.username)) {
      await enterApp(sessionData);
      return;
    }
    if (as) {
      const dl = await rawPost("/api/auth/demo-login", { username: as });
      if (dl.status === 200 && dl.data?.ok && dl.data.user) {
        await enterApp(dl.data);
        return;
      }
      if (!state.loginAccountsLoaded) await loadDemoAccounts();
      const acc = state.demoAccounts.find((x) => x.username === as);
      const pw = acc?.demo_password || acc?.password;
      if (pw) {
        const lr = await rawPost("/api/auth/login", { username: as, password: pw });
        if (lr.status === 200 && lr.data?.ok && lr.data.user) {
          await enterApp(lr.data);
          return;
        }
      }
    }
    if (sessionData) {
      await enterApp(sessionData);
      return;
    }
    await showLogin({ preselect: as || null });
  }

  /* 供调试 / 自动化检查使用 */
  window.__qa = { state, version: "0.3" };

  bindEvents();
  boot();
})();
