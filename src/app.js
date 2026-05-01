const DATA_URL = "./data/嘻斌库.json";
const ARTICLES_DATA_URL = "./data/articles.json";
const ROMANCE_DATA_URL = "./data/恋斌场.json";
const WHATS_NEW_STORAGE_KEY = "xibinku-whats-new-dismissed-signature";
const POLL_INTERVAL = 20000;
const DEV_EVENTS_URL = "/__events";
const MIND_SURFACE = { width: 1100, height: 720 };
const MIND_SCALE_MIN = 0.42;
const MIND_SCALE_MAX = 2.2;
const MIND_SCALE_STEP = 1.16;
const LOCATION_CARD_OVERRIDES = new Map([
  [
    "豪客来卤菜店|湖北省咸宁市通山县通羊镇月亮湾农贸市场",
    {
      name: "豪客来卤菜店（月亮湾水岸花园店）",
      image: "./assets/images/places/hkl.jpg",
      city: "咸宁市",
      url: "https://ditu.amap.com/place/B0GKHC1MIJ"
    }
  ]
]);

const CATEGORY_RULES = [
  {
    id: "ideology",
    label: "制度与路线",
    color: "#c57c56",
    keywords: ["左派", "毛主席", "制度", "改开", "改革开放", "计划经济", "资本", "经济", "贸易", "全球", "工农", "农民", "富人", "共产主义", "朝鲜", "生活水平", "贸易体系"]
  },
  {
    id: "local",
    label: "地域日常",
    color: "#70877f",
    keywords: ["通山", "广场", "豪客来", "必胜客", "达美乐", "口音", "普通话", "方言", "卤菜", "位置卡片", "县城"]
  },
  {
    id: "school",
    label: "学习与成绩",
    color: "#b79a57",
    keywords: ["考试", "毛概", "学生", "71"]
  },
  {
    id: "group",
    label: "群务与管理",
    color: "#9a725c",
    keywords: ["管理", "恢复管理", "群里", "理论", "旺座理论", "管理员"]
  }
];

const STOPWORDS = new Set([
  "现在", "以前", "这个", "那个", "还是", "就是", "我们", "你们", "他们", "一个", "没有",
  "不是", "什么", "怎么", "可以", "不会", "觉得", "真的", "时候", "因为", "那么", "然后",
  "已经", "但是", "如果", "只是", "还有", "这样", "那样", "自己", "大家", "一下", "出来",
  "天天", "的话", "之前", "之后", "其实", "问题", "东西", "有些", "有的", "这种", "那种",
  "一样", "知道", "一下子", "而且", "至少", "咱们", "说白了", "哈哈", "哈哈哈", "笑死",
  "动画表情", "位置卡片", "确实", "是的", "现在的", "以前的", "还是那句话"
]);

const STANCE_TEXT = {
  core: "核心发言",
  support: "接话附和",
  challenge: "现实反驳",
  tease: "玩梗围观",
  observe: "补充观察"
};

const state = {
  analysis: null,
  articlesData: null,
  romanceData: null,
  selectedIndex: 0,
  initialEntryApplied: false,
  globalSearch: "",
  globalSearchComposing: false,
  speakerFilter: "all",
  campFilter: "all",
  search: "",
  dataSignature: "",
  lastLoadedAt: null,
  eventSource: null,
  mindViews: {},
  mobileRailOpen: false,
  whatsNewOpen: false,
  whatsNewAutoSuppressed: false
};

const el = {
  loadingScreen: document.getElementById("loadingScreen"),
  mobileRailBackdrop: document.getElementById("mobileRailBackdrop"),
  whatsNewButton: document.getElementById("whatsNewButton"),
  whatsNewModal: document.getElementById("whatsNewModal"),
  heroDescription: document.getElementById("heroDescription"),
  globalSearchPanel: document.getElementById("globalSearchPanel"),
  heroMetrics: document.getElementById("heroMetrics"),
  updatedChip: document.getElementById("updatedChip"),
  refreshButton: document.getElementById("refreshButton"),
  spotlightPanel: document.getElementById("spotlightPanel"),
  networkPanel: document.getElementById("networkPanel"),
  overview: document.getElementById("overview"),
  sessionRail: document.getElementById("sessionRail"),
  focusPanel: document.getElementById("focusPanel"),
  campPanel: document.getElementById("campPanel"),
  transcriptPanel: document.getElementById("transcriptPanel"),
  loadingTitle: document.getElementById("loadingTitle")
};

let loadingInterval = null;

boot();

function boot() {
  document.body.classList.add("loading");
  startLoadingAnimation();
  bindEvents();
  setupLiveHooks();
  refreshData("初始化载入");
  window.setInterval(() => refreshData("定时轮询", { silent: true }), POLL_INTERVAL);
}

function bindEvents() {
  el.refreshButton.addEventListener("click", () => refreshData("手动刷新"));
  el.whatsNewButton?.addEventListener("click", () => showWhatsNew());

  document.addEventListener("click", (event) => {
    const whatsNewAction = event.target.closest("[data-whats-new-action]");
    if (whatsNewAction) {
      handleWhatsNewAction(whatsNewAction.dataset.whatsNewAction);
      return;
    }

    if (event.target === el.whatsNewModal) {
      closeWhatsNew();
      return;
    }

    const mobileAction = event.target.closest("[data-mobile-action]");
    if (mobileAction) {
      handleMobileAction(mobileAction.dataset.mobileAction);
      return;
    }

    const mobileClose = event.target.closest("[data-mobile-close]");
    if (mobileClose) {
      closeMobileRail();
      return;
    }

    if (event.target === el.mobileRailBackdrop) {
      closeMobileRail();
      return;
    }

    const jumpButton = event.target.closest("[data-jump-target]");
    if (jumpButton) {
      closeMobileRail();
      scrollToTarget(jumpButton.dataset.jumpTarget);
      return;
    }

    const mindAction = event.target.closest("[data-mind-action]");
    if (mindAction) {
      const wrap = mindAction.closest(".mind-wrap");
      const viewport = wrap?.querySelector("[data-mind-viewport]");
      if (viewport) {
        handleMindAction(mindAction.dataset.mindAction, viewport);
      }
      return;
    }

    const globalEntry = event.target.closest("[data-global-entry-index]");
    if (globalEntry) {
      if (globalEntry.dataset.globalEntryUrl) {
        window.location.href = globalEntry.dataset.globalEntryUrl;
        return;
      }

      state.selectedIndex = Number(globalEntry.dataset.globalEntryIndex);
      state.globalSearch = "";
      render();
      closeMobileRail();
      scrollToFocusAnchor();
      return;
    }

    const sessionButton = event.target.closest("[data-session-index]");
    if (sessionButton) {
      state.selectedIndex = Number(sessionButton.dataset.sessionIndex);
      state.speakerFilter = "all";
      state.campFilter = "all";
      state.search = "";
      render();
      closeMobileRail();
      scrollToFocusAnchor();
      return;
    }

    const speakerButton = event.target.closest("[data-speaker-filter]");
    if (speakerButton) {
      state.speakerFilter = speakerButton.dataset.speakerFilter;
      renderCampPanel();
      renderTranscript();
      return;
    }

    const campButton = event.target.closest("[data-camp-filter]");
    if (campButton) {
      state.campFilter = campButton.dataset.campFilter;
      renderTranscript();
      return;
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-global-search-box]")) {
      state.globalSearch = event.target.value;
      if (state.globalSearchComposing) {
        return;
      }
      renderGlobalSearchPanel();
      refocusGlobalSearchInput();
      return;
    }

    if (event.target.matches("[data-search-box]")) {
      state.search = event.target.value;
      renderTranscriptResults();
    }
  });

  document.addEventListener("compositionstart", (event) => {
    if (event.target.matches("[data-global-search-box]")) {
      state.globalSearchComposing = true;
    }
  });

  document.addEventListener("compositionend", (event) => {
    if (event.target.matches("[data-global-search-box]")) {
      state.globalSearchComposing = false;
      state.globalSearch = event.target.value;
      renderGlobalSearchPanel();
      refocusGlobalSearchInput();
    }
  });

  document.addEventListener("wheel", (event) => {
    const scrollable = event.target.closest(".session-rail, .message-list, .timeline-list");
    if (!scrollable || scrollable.scrollHeight <= scrollable.clientHeight) {
      return;
    }

    const delta = event.deltaY;
    const nextTop = scrollable.scrollTop + delta;
    const maxTop = scrollable.scrollHeight - scrollable.clientHeight;
    if ((delta < 0 && scrollable.scrollTop > 0) || (delta > 0 && scrollable.scrollTop < maxTop)) {
      event.preventDefault();
      scrollable.scrollTop = clamp(nextTop, 0, maxTop);
    }
  }, { passive: false });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      closeMobileRail();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWhatsNew();
      closeMobileRail();
    }
  });
}

function setupLiveHooks() {
  if (!window.EventSource || location.protocol === "file:") {
    return;
  }
  try {
    const source = new EventSource(DEV_EVENTS_URL);
    source.addEventListener("open", () => {
      state.eventSource = source;
    });
    source.addEventListener("data-changed", () => {
      refreshData("文件变更推送", { silent: true });
    });
  } catch (error) {
    console.warn(error);
  }
}

async function refreshData(reason, options = {}) {
  try {
    const [mainRawText, articlesRawText, romanceRawText] = await Promise.all([
      fetchDataText(DATA_URL),
      fetchDataText(ARTICLES_DATA_URL),
      fetchDataText(ROMANCE_DATA_URL)
    ]);
    const signature = hashText([mainRawText, articlesRawText, romanceRawText].join("\n---global-search---\n"));
    if (signature === state.dataSignature && options.silent) {
      updateLoadMeta(reason, false);
      return;
    }

    const data = JSON.parse(mainRawText);
    state.dataSignature = signature;
    state.analysis = analyzeData(data);
    state.articlesData = JSON.parse(articlesRawText);
    state.romanceData = JSON.parse(romanceRawText);
    applyInitialEntrySelection();
    state.selectedIndex = clampIndex(state.selectedIndex, state.analysis.sessions.length);
    state.lastLoadedAt = new Date();
    updateLoadMeta(reason, true);
    render();
    hideLoadingScreen();
    maybeShowWhatsNew(options);
  } catch (error) {
    console.error(error);
    renderError(`读取 ${DATA_URL} 失败。请通过 \`npm run dev\` 或部署后的 Pages 域名访问页面，而不是直接双击 HTML。`);
    hideLoadingScreen();
  }
}

function applyInitialEntrySelection() {
  if (state.initialEntryApplied || !Array.isArray(state.analysis?.sessions)) {
    return;
  }
  state.initialEntryApplied = true;
  const params = new URLSearchParams(window.location?.search || "");
  const entry = Number(params.get("entry"));
  if (Number.isInteger(entry)) {
    state.selectedIndex = clampIndex(entry, state.analysis.sessions.length);
  }
}

function maybeShowWhatsNew(options = {}) {
  const currentSignature = getCurrentWhatsNewSignature();
  if (
    options.silent
    || state.whatsNewAutoSuppressed
    || (currentSignature && getDismissedWhatsNewSignature() === currentSignature)
  ) {
    return;
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(() => showWhatsNew(), 180);
  });
}

function showWhatsNew() {
  if (!el.whatsNewModal) {
    return;
  }
  state.whatsNewOpen = true;
  el.whatsNewModal.hidden = false;
  document.body.classList.add("whats-new-open");
}

function closeWhatsNew() {
  if (!el.whatsNewModal || !state.whatsNewOpen) {
    return;
  }
  state.whatsNewOpen = false;
  el.whatsNewModal.hidden = true;
  document.body.classList.remove("whats-new-open");
}

function handleWhatsNewAction(action) {
  if (action === "close") {
    state.whatsNewAutoSuppressed = true;
  } else if (action === "dismiss-current") {
    state.whatsNewAutoSuppressed = true;
    setDismissedWhatsNewSignature(getCurrentWhatsNewSignature());
  }
  closeWhatsNew();
}

function getDismissedWhatsNewSignature() {
  try {
    return window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
  } catch (error) {
    return "";
  }
}

function setDismissedWhatsNewSignature(signature) {
  if (!signature) {
    return;
  }
  try {
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, signature);
  } catch (error) {
    console.warn(error);
  }
}

function getCurrentWhatsNewSignature() {
  if (!el.whatsNewModal) {
    return "";
  }
  const text = el.whatsNewModal.textContent?.replace(/\s+/g, " ").trim() || "";
  return text ? hashText(text) : "";
}

async function fetchDataText(url) {
  const response = await fetch(`${url}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  });
  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status}`);
  }
  return response.text();
}

function updateLoadMeta(reason, changed) {
  state.lastLoadedAt = new Date();
  const timeText = state.lastLoadedAt.toLocaleTimeString("zh-CN", { hour12: false });
  el.updatedChip.textContent = `${changed ? "已更新" : "已检查"} · ${timeText}`;
  el.heroDescription.textContent = "";
}

function render() {
  if (!state.analysis) {
    return;
  }
  renderGlobalSearchPanel();
  renderHeroMetrics();
  renderHeroPanels();
  renderOverview();
  renderSessionRail();
  renderFocusPanel();
  renderCampPanel();
  renderTranscript();
}

function renderError(message) {
  const empty = `<div class="empty-state">${escapeHtml(message)}</div>`;
  el.spotlightPanel.innerHTML = empty;
  el.networkPanel.innerHTML = empty;
  el.overview.innerHTML = empty;
  el.sessionRail.innerHTML = empty;
  el.focusPanel.innerHTML = empty;
  el.campPanel.innerHTML = empty;
  el.transcriptPanel.innerHTML = empty;
}

function hideLoadingScreen() {
  document.body.classList.remove("loading");
  stopLoadingAnimation();
  if (el.loadingScreen) {
    el.loadingScreen.classList.add("hidden");
  }
}

function startLoadingAnimation() {
  if (!el.loadingTitle) return;
  let dotCount = 0;
  const update = () => {
    dotCount = (dotCount % 6) + 1;
    el.loadingTitle.innerHTML = `正在划龙舟<br>进入通三河<br>${".".repeat(dotCount)}`;
  };
  update();
  loadingInterval = setInterval(update, 60);
}

function stopLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
}

function handleMobileAction(action) {
  if (action === "toggle-rail") {
    toggleMobileRail();
  }
}

function toggleMobileRail() {
  if (window.innerWidth > 760) {
    return;
  }
  state.mobileRailOpen = !state.mobileRailOpen;
  syncMobileRailState();
}

function closeMobileRail() {
  if (!state.mobileRailOpen) {
    return;
  }
  state.mobileRailOpen = false;
  syncMobileRailState();
}

function syncMobileRailState() {
  const shouldOpen = state.mobileRailOpen && window.innerWidth <= 760;
  document.body.classList.toggle("mobile-rail-open", shouldOpen);
}

function renderHeroMetrics() {
  const { totals, targetName } = state.analysis;
  const archiveStats = getUnifiedArchiveStats();
  el.heroMetrics.innerHTML = [
    metricChip(`${archiveStats.totalEntries} 个跨库条目`),
    metricChip(`${archiveStats.conversationMessages} 条对话`),
    metricChip(`${archiveStats.articleCount} 条全斌文`),
    metricChip(`${archiveStats.romanceCount} 条恋斌场`),
    metricChip(`${targetName} 发言 ${totals.targetMessages} 条`),
    metricChip(`最热条目 ${archiveStats.hottestItem?.date || "未知"}`),
    metricChip(`活跃说话人 ${totals.activeParticipants} 人`)
  ].join("");
}

function renderGlobalSearchPanel() {
  if (!el.globalSearchPanel || !state.analysis) {
    return;
  }

  const matches = getGlobalSearchMatches();
  el.globalSearchPanel.innerHTML = `
    <div class="global-search-shell">
      <div class="global-search-field">
        <input
          class="global-search-box"
          data-global-search-box
          type="search"
          value="${escapeAttr(state.globalSearch)}"
          placeholder="全局搜索嘻斌库、全斌文、恋斌场，例如 通山 / 投射 / 富家女"
        >
        ${state.globalSearch.trim() ? renderGlobalSearchDropdown(matches) : ""}
      </div>
      <div class="global-search-hint">
        ${state.globalSearch.trim() ? `当前关键词：<span class="global-search-keyword">${escapeHtml(state.globalSearch.trim())}</span> · ` : ""}
        输入关键词，直接跳到命中的日期、文章或情感条目。
      </div>
    </div>
  `;
}

function renderGlobalSearchDropdown(matches) {
  if (!matches.length) {
    return `<div class="global-search-dropdown"><div class="global-search-empty">没有命中条目，换个标题词或原话关键词试试。</div></div>`;
  }

  return `
    <div class="global-search-dropdown">
      ${matches.map((match) => `
        <button
          class="global-search-option"
          type="button"
          data-global-entry-index="${match.index}"
          ${match.url ? `data-global-entry-url="${escapeAttr(match.url)}"` : ""}
        >
          <div class="global-search-kicker">${escapeHtml(match.kicker)}</div>
          <div class="global-search-title">${highlightMatchHtml(match.title, state.globalSearch)}</div>
          <div class="global-search-snippet">${highlightMatchHtml(match.snippet, state.globalSearch)}</div>
        </button>
      `).join("")}
    </div>
  `;
}

function getGlobalSearchMatches() {
  const query = state.globalSearch.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return [
    ...getSessionSearchMatches(query),
    ...getArticleSearchMatches(query),
    ...getRomanceSearchMatches(query)
  ].slice(0, 10);
}

function getSessionSearchMatches(query) {
  return state.analysis.sessions
    .map((session, index) => {
      const corpus = session.messages.map((message) => `${message.sender} ${message.content} ${message.replyTo?.content || ""}`).join(" ");
      const titleHit = `${session.title} ${session.date} ${session.category.label}`.toLowerCase();
      const matchedSource = titleHit.includes(query) ? `${session.title} ${session.category.label}` : corpus;
      const haystack = `${titleHit} ${corpus}`.toLowerCase();
      if (!haystack.includes(query)) return null;
      return {
        index,
        kicker: `嘻斌库 · ${session.date} · ${session.category.label}`,
        title: session.title,
        snippet: createSearchSnippet(matchedSource, state.globalSearch) || session.summary
      };
    })
    .filter(Boolean);
}

function getArticleSearchMatches(query) {
  if (!Array.isArray(state.articlesData?.articles)) {
    return [];
  }

  return state.articlesData.articles
    .map((article, index) => {
      const titleField = `${article.title} ${article.date}`.toLowerCase();
      const bodyField = `${article.summary || ""} ${article.text || ""}`.toLowerCase();
      if (!titleField.includes(query) && !bodyField.includes(query)) return null;
      const matchedSource = titleField.includes(query) ? `${article.title} ${article.date}` : `${article.summary || ""} ${article.text || ""}`;
      return {
        index,
        url: `./articles.html?entry=${index}`,
        kicker: `全斌文 · ${article.date}`,
        title: article.title,
        snippet: createSearchSnippet(matchedSource, state.globalSearch) || article.summary || article.text
      };
    })
    .filter(Boolean);
}

function getRomanceSearchMatches(query) {
  if (!Array.isArray(state.romanceData?.stories)) {
    return [];
  }

  return state.romanceData.stories
    .map((story, index) => {
      const titleField = `${story.title} ${story.date} ${story.stage || ""} ${story.status || ""} ${(story.tags || []).join(" ")}`.toLowerCase();
      const summaryField = `${story.summary || ""} ${story.overview ? Object.values(story.overview).join(" ") : ""}`;
      const transcriptField = (story.transcript || []).map((message) => `${message.sender} ${message.content} ${message.reply_to?.content || ""}`).join(" ");
      const haystack = `${titleField} ${summaryField} ${transcriptField}`.toLowerCase();
      if (!haystack.includes(query)) return null;
      const matchedSource = titleField.includes(query) ? `${story.title} ${story.date} ${story.stage || ""}` : `${summaryField} ${transcriptField}`;
      return {
        index,
        url: `./恋斌场.html?entry=${index}`,
        kicker: `恋斌场 · ${story.date} · ${story.stage || "情感条目"}`,
        title: story.title,
        snippet: createSearchSnippet(matchedSource, state.globalSearch) || story.summary
      };
    })
    .filter(Boolean);
}

function refocusGlobalSearchInput() {
  const box = el.globalSearchPanel?.querySelector("[data-global-search-box]");
  if (!box) {
    return;
  }
  const caret = state.globalSearch.length;
  box.focus();
  if (typeof box.setSelectionRange === "function") {
    box.setSelectionRange(caret, caret);
  }
}

function renderHeroPanels() {
  const archiveStats = getUnifiedArchiveStats();
  const spotlight = archiveStats.topPressureItems.map((item, index) => `
    <article class="hero-rank-item">
      <div class="hero-rank-head">
        <strong>${index + 1}. ${escapeHtml(item.date)}</strong>
        <span>${item.pressureScore}/100</span>
      </div>
      <div style="margin-top:10px" class="hero-rank-track">
        <div class="hero-rank-fill" style="width:${item.pressureScore}%"></div>
      </div>
      <p>${escapeHtml(`${item.sourceLabel} · ${item.metricText} · ${item.summary}`)}</p>
    </article>
  `).join("");

  const responders = state.analysis.topTargetResponders.slice(0, 4).map((item) => `
    <article class="hero-rank-item">
      <div class="hero-rank-head">
        <strong>${escapeHtml(item.sender)}</strong>
        <span>${item.count} 次接话</span>
      </div>
      <div style="margin-top:10px" class="hero-rank-track">
        <div class="hero-rank-fill" style="width:${(item.count / Math.max(state.analysis.topTargetResponders[0]?.count || 1, 1)) * 100}%"></div>
      </div>
      <p>${escapeHtml(`${item.dominantRoleLabel} 为主 · 同场日期 ${item.sessions} 天`)}</p>
    </article>
  `).join("");

  const mostTalkative = state.analysis.topParticipants[0];
  el.spotlightPanel.innerHTML = `
    <div class="hero-panel-title">跨库最容易炸起来的内容</div>
    <div class="hero-ranking" style="margin-top:12px">${spotlight}</div>
  `;
  el.networkPanel.innerHTML = `
    <div class="hero-panel-title">谁最常接通三哥的话</div>
    <div class="hero-ranking" style="margin-top:12px">${responders || '<div class="empty-state">暂无回应链。</div>'}</div>
    ${mostTalkative ? `<div class="hero-panel-foot">${escapeHtml(`全局最密：${mostTalkative.sender} · ${mostTalkative.count} 条`)}</div>` : ""}
  `;
}

function renderOverview() {
  const { topTargetResponders } = state.analysis;
  const archiveStats = getUnifiedArchiveStats();
  const topResponder = topTargetResponders[0];
  el.overview.innerHTML = [
    overviewCard("时间跨度", `${archiveStats.dateRange.start} → ${archiveStats.dateRange.end}`, `共跨 ${archiveStats.totalEntries} 个条目，包含主库、全斌文与恋斌场。`),
    overviewCard("最长内容", archiveStats.longestItem?.title || "暂无", archiveStats.longestItem ? `${archiveStats.longestItem.sourceLabel} · ${archiveStats.longestItem.metricText}，对应日期 ${archiveStats.longestItem.date}。` : "暂无内容。"),
    overviewCard("高压内容", archiveStats.topPressureItems[0]?.title || "暂无", archiveStats.topPressureItems[0] ? `${archiveStats.topPressureItems[0].sourceLabel} · 压力 ${archiveStats.topPressureItems[0].pressureScore}/100 · ${archiveStats.topPressureItems[0].metricText}。` : "暂无高压条目。"),
    overviewCard("最常接话者", topResponder ? topResponder.sender : "暂无", topResponder ? `累计 ${topResponder.count} 次接在通三哥发言后出现，主模式是 ${topResponder.dominantRoleLabel}。` : "暂无接话统计。")
  ].join("");
}

function renderSessionRail() {
  const maxMessages = Math.max(...state.analysis.sessions.map((session) => session.messageCount), 1);
  el.sessionRail.innerHTML = state.analysis.sessions.map((session, index) => `
    <button class="session-button ${state.selectedIndex === index ? "active" : ""}" data-session-index="${index}">
      <div class="session-topline">
        <div class="session-event">${escapeHtml(session.title)}</div>
        <span class="session-type" style="color:${session.category.color}">${escapeHtml(session.category.label)}</span>
      </div>
      <div class="session-date">${escapeHtml(session.date)}</div>
      <div style="margin:12px 0 10px" class="bar-track">
        <div class="bar-fill" style="width:${(session.messageCount / maxMessages) * 100}%"></div>
      </div>
      <div class="session-meta">
        <span>${session.messageCount} 条 · 通三哥 ${session.targetCount} 条</span>
        <span>${session.timeRange}</span>
      </div>
    </button>
  `).join("");
}

function renderFocusPanel() {
  const session = currentSession();
  const campMeta = getCampMeta(session.category.id);
  const mind = buildMindOrbit(session, campMeta);
  el.focusPanel.innerHTML = `
    <section class="focus-summary">
      <div class="focus-title-row">
        <div class="focus-date">${escapeHtml(session.title)}</div>
        <button class="jump-button" type="button" data-jump-target="transcriptAnchor">查看原始对话流</button>
      </div>
      <div class="focus-headline">
        <span class="small-pill">${escapeHtml(session.date)}</span>
        <span class="small-pill">${escapeHtml(session.category.label)}</span>
      </div>
      <div class="focus-facts">
        ${factCard("活跃时段", session.timeRange)}
        ${factCard("消息体量", `${session.messageCount} 条`)}
        ${factCard("回应主色", session.dominantCampLabel)}
        ${factCard("接话最猛", session.topSpeakers[0] ? `${session.topSpeakers[0].sender} · ${session.topSpeakers[0].count}` : "暂无")}
      </div>
    </section>

    <div class="story-layout">
      <section class="story-panel timeline-panel">
        <h3 class="story-title">时间线</h3>
        <div class="timeline-list">
          ${session.timelineMoments.map((moment) => `
            <article class="timeline-item" style="--node-color:${moment.color}">
              <div class="timeline-head">
                <div>
                  <div class="timeline-time">${escapeHtml(moment.time)}</div>
                  <div class="timeline-speaker">${escapeHtml(moment.sender)}</div>
                </div>
                <span class="timeline-tag" style="color:${moment.color}">${escapeHtml(moment.title)}</span>
              </div>
              <p>${escapeHtml(moment.content)}</p>
              <div class="timeline-impact">${escapeHtml(moment.impact)}</div>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="story-panel">
        <h3 class="story-title">日期思维导图</h3>
        <div class="mind-wrap">
          <div class="mind-toolbar">
            <button class="mind-tool-button" type="button" data-mind-action="zoom-in">放大</button>
            <button class="mind-tool-button" type="button" data-mind-action="zoom-out">缩小</button>
            <button class="mind-tool-button" type="button" data-mind-action="reset">恢复</button>
            <button class="mind-tool-button" type="button" data-mind-action="fullscreen">全屏</button>
          </div>
          <div class="mind-viewport" data-mind-viewport data-session-key="${escapeAttr(session.date)}">
            <div class="mind-surface" data-mind-surface>
              <svg class="mind-svg" viewBox="0 0 ${MIND_SURFACE.width} ${MIND_SURFACE.height}" aria-hidden="true">
                ${mind.paths.map((path) => `
                  <path
                    class="mind-beam"
                    d="M ${path.from.x} ${path.from.y} C ${path.c1.x} ${path.c1.y}, ${path.c2.x} ${path.c2.y}, ${path.to.x} ${path.to.y}"
                    stroke="${path.color}"
                    stroke-width="${path.width}"
                    opacity="${path.opacity}"
                  />
                `).join("")}
              </svg>
              ${mind.nodes.map((node) => `
                <article class="mind-node ${node.kind}" style="left:${node.x}px; top:${node.y}px; animation-delay:${node.delay}s">
                  <small>${escapeHtml(node.kicker)}</small>
                  <strong>${escapeHtml(node.title)}</strong>
                  <p>${escapeHtml(node.body)}</p>
                </article>
              `).join("")}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  activateMindMap();
}

function scrollToFocusAnchor() {
  scrollToTarget("focusAnchor");
}

function scrollToTarget(id) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderCampPanel() {
  const session = currentSession();
  const campMeta = getCampMeta(session.category.id);
  const totalCampMessages = Math.max(session.camp.messageCount, 1);
  const meter = ["challenge", "observe", "tease", "support"].map((camp) => `
    <span class="camp-segment" style="width:${(session.camp.summary[camp].messages / totalCampMessages) * 100}%; background:${campMeta[camp].color}"></span>
  `).join("");

  const columns = ["challenge", "observe", "tease", "support"].map((camp) => {
    const group = session.camp.participants.filter((participant) => participant.camp === camp);
    const rows = group.length
      ? group.slice(0, 4).map((participant) => `
          <div
            class="camp-person ${state.speakerFilter === participant.sender ? "active" : ""}"
            style="--camp-color:${campMeta[camp].color}"
          >
            <div class="camp-person-head">
              <strong>${escapeHtml(participant.sender)}</strong>
              <span>${participant.messageCount} 条</span>
            </div>
            <p>${escapeHtml(trimText(participant.strongestQuote?.content || "没有代表句。", 62))}</p>
          </div>
        `).join("")
      : '<div class="empty-state">你觉得这里会有人吗？</div>';

    return `
      <section class="camp-column">
        <div class="camp-column-head">
          <strong style="color:${campMeta[camp].color}">${escapeHtml(campMeta[camp].label)}</strong>
          <span>${session.camp.summary[camp].participants} 人 · ${session.camp.summary[camp].messages} 条</span>
        </div>
        <div class="camp-list">${rows}</div>
      </section>
    `;
  }).join("");

  el.campPanel.innerHTML = `
    <div class="camp-meter">
      <div class="camp-meter-fill">${meter}</div>
    </div>
    <div class="camp-ribbon">
      ${escapeHtml(`${campMeta.core.label} ${session.targetCount} 条 · 非通三哥 ${session.messageCount - session.targetCount} 条 · 主回应 ${session.dominantCampLabel}`)}
    </div>
    <div class="camp-grid">${columns}</div>
  `;
}

function renderTranscript() {
  const session = currentSession();
  const campMeta = getCampMeta(session.category.id);

  const speakerChips = [
    filterChip("all", state.speakerFilter === "all", "全部说话人"),
    ...session.topSpeakers.slice(0, 8).map((speaker) => filterChip(speaker.sender, state.speakerFilter === speaker.sender, shortName(speaker.sender), speaker.count))
  ].join("");

  const campChips = [
    filterCampChip("all", state.campFilter === "all", "全部阵营"),
    filterCampChip("core", state.campFilter === "core", campMeta.core.label),
    filterCampChip("support", state.campFilter === "support", campMeta.support.label),
    filterCampChip("challenge", state.campFilter === "challenge", campMeta.challenge.label),
    filterCampChip("tease", state.campFilter === "tease", campMeta.tease.label),
    filterCampChip("observe", state.campFilter === "observe", campMeta.observe.label)
  ].join("");

  el.transcriptPanel.innerHTML = `
    <div class="toolbar-row">
      <input class="search-box" data-search-box type="search" value="${escapeAttr(state.search)}" placeholder="搜索名字或内容，例如 改开 / 通山 / 杰福.">
      <div class="toolbar-group">${speakerChips}</div>
    </div>
    <div style="margin-top:12px" class="toolbar-group">${campChips}</div>
    <div class="transcript-meta" data-transcript-meta></div>
    <div class="message-list" data-message-list></div>
  `;
  renderTranscriptResults();
}

function renderTranscriptResults() {
  const session = currentSession();
  const campMeta = getCampMeta(session.category.id);
  const visibleMessages = getVisibleTranscriptMessages(session);
  const transcriptMeta = el.transcriptPanel.querySelector("[data-transcript-meta]");
  const messageList = el.transcriptPanel.querySelector("[data-message-list]");
  if (!transcriptMeta || !messageList) {
    return;
  }

  transcriptMeta.innerHTML = `
    <span>显示 ${visibleMessages.length} / ${session.messages.length} 条消息</span>
    <span>${escapeHtml(session.date)} · ${escapeHtml(session.category.label)}</span>
  `;

  messageList.innerHTML = visibleMessages.length
    ? visibleMessages.map((message) => {
      const badgeItems = [];
      if (message.isTarget) {
        badgeItems.push({ tone: "core", label: campMeta.core.label });
      } else {
        if (message.stance !== "observe") {
          badgeItems.push({ tone: message.stance, label: STANCE_TEXT[message.stance] });
        }
        if (message.participantCamp !== "observe" && message.participantCamp !== message.stance) {
          badgeItems.push({ tone: message.participantCamp, label: campMeta[message.participantCamp].label });
        }
      }
      const badgeRail = renderMessageBadges(badgeItems);
      return `
        <article class="message-card ${message.isTarget ? "target" : ""}">
          <div class="message-meta">
            <div class="message-meta-main">
              <div class="message-sender">${escapeHtml(message.sender)}</div>
              <div class="message-time">${escapeHtml(message.time)}</div>
            </div>
            ${badgeRail}
          </div>
          ${message.replyTo ? `
            <div class="reply-quote">
              <div class="reply-quote-sender">${escapeHtml(message.replyTo.sender)}</div>
              <div class="reply-quote-content">${escapeHtml(message.replyTo.content)}</div>
            </div>
          ` : ""}
          ${renderMessageContent(message)}
        </article>
      `;
    }).join("")
    : '<div class="empty-state">当前筛选条件下没有命中消息。</div>';
}

function renderMessageContent(message) {
  const location = parseLocationMessage(message.content);
  if (!location) {
    return `<p class="message-content">${escapeHtml(message.content)}</p>`;
  }

  return `
    <a class="location-card" href="${escapeAttr(location.url)}" target="_blank" rel="noopener noreferrer" aria-label="在高德地图打开 ${escapeAttr(location.name)}">
      <img class="location-card-image" src="${escapeAttr(location.image)}" alt="${escapeAttr(location.name)} 地图缩略图" loading="lazy">
      <span class="location-card-body">
        <span class="location-card-name">${escapeHtml(location.name)}</span>
        <span class="location-card-address">${escapeHtml(location.address)}</span>
      </span>
    </a>
  `;
}

function parseLocationMessage(content) {
  const text = String(content || "").trim();
  const match = text.match(/^\[位置卡片\]\s*(.+?)(?:\s*[（(]([^()（）]+)[）)])?\s*$/u);
  if (!match) {
    return null;
  }

  const rawName = match[1].trim();
  const address = (match[2] || "").trim();
  const override = LOCATION_CARD_OVERRIDES.get(`${rawName}|${address}`) || {};
  const name = override.name || rawName;
  const city = override.city || "";
  const image = override.image || "./assets/images/places/hkl.jpg";
  return {
    name,
    address,
    image,
    url: override.url || createAmapSearchUrl(name, address, city)
  };
}

function createAmapSearchUrl(name, address, city) {
  const keyword = encodeURIComponent([name, address].filter(Boolean).join(" "));
  const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
  return `https://uri.amap.com/search?keyword=${keyword}${cityParam}&view=map&src=xibinku&callnative=0`;
}

function renderMessageBadges(badgeItems) {
  const seen = new Set();
  const uniqueBadges = badgeItems.filter((badge) => {
    if (!badge?.label) return false;
    const key = `${badge.tone}:${badge.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!uniqueBadges.length) {
    return "";
  }

  return `
    <div class="message-badge-rail message-badge-rail-inline">
      ${uniqueBadges.map((badge) => `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>`).join("")}
    </div>
  `;
}

function getVisibleTranscriptMessages(session) {
  const search = state.search.trim();
  return session.messages.filter((message) => {
    const speakerOk = state.speakerFilter === "all" || message.sender === state.speakerFilter;
    const campOk = state.campFilter === "all" || message.stance === state.campFilter || message.participantCamp === state.campFilter;
    const searchOk = !search
      || message.content.includes(search)
      || message.sender.includes(search)
      || message.replyTo?.sender?.includes(search)
      || message.replyTo?.content?.includes(search);
    return speakerOk && campOk && searchOk;
  });
}

function getUnifiedArchiveStats() {
  const items = getUnifiedArchiveItems();
  const datedItems = items.filter((item) => item.date);
  const sortedDates = datedItems.map((item) => item.date).sort();
  const hottestItem = items.slice().sort((a, b) => b.comparableSize - a.comparableSize || b.pressureScore - a.pressureScore)[0] || null;
  const longestItem = items.slice().sort((a, b) => b.comparableSize - a.comparableSize || b.metricValue - a.metricValue)[0] || null;
  const topPressureItems = items
    .slice()
    .sort((a, b) => b.pressureScore - a.pressureScore || b.comparableSize - a.comparableSize)
    .slice(0, 3);

  return {
    items,
    totalEntries: items.length,
    articleCount: state.articlesData?.articles?.length || 0,
    romanceCount: state.romanceData?.stories?.length || 0,
    conversationMessages: items.reduce((sum, item) => sum + item.conversationMessages, 0),
    dateRange: {
      start: sortedDates[0] || "未知",
      end: sortedDates.at(-1) || "未知"
    },
    hottestItem,
    longestItem,
    topPressureItems
  };
}

function getUnifiedArchiveItems() {
  const sessionItems = (state.analysis?.sessions || []).map((session) => ({
    source: "main",
    sourceLabel: `嘻斌库 · ${session.category.label}`,
    date: session.date,
    title: session.title,
    metricValue: session.messageCount,
    metricText: `${session.messageCount} 条消息`,
    comparableSize: session.messageCount,
    conversationMessages: session.messageCount,
    pressureScore: clamp(Math.round(session.debateIntensity), 0, 100),
    summary: `${session.timelineMoments[0]?.title || "当天起点"} 到 ${session.timelineMoments.at(-1)?.title || "当天收尾"}`
  }));

  const articleItems = (state.articlesData?.articles || []).map((article) => {
    const textLength = String(article.text || article.summary || "").length;
    return {
      source: "articles",
      sourceLabel: "全斌文",
      date: article.date || "未知",
      title: article.title || "未命名文章",
      metricValue: textLength,
      metricText: `${textLength} 字`,
      comparableSize: Math.ceil(textLength / 40),
      conversationMessages: 0,
      pressureScore: clamp(Math.round(textLength / 70), 8, 100),
      summary: article.summary || "个人长文、随笔与附件文档"
    };
  });

  const romanceItems = (state.romanceData?.stories || []).map((story) => {
    const transcriptCount = story.transcript?.length || 0;
    const lineCount = story.relationshipLine?.length || 0;
    const tagCount = story.tags?.length || 0;
    const pressureScore = transcriptCount * 8 + lineCount * 5 + tagCount * 2;
    return {
      source: "romance",
      sourceLabel: `恋斌场 · ${story.stage || "情感条目"}`,
      date: story.date || "未知",
      title: story.title || "未命名情感条目",
      metricValue: transcriptCount,
      metricText: `${transcriptCount} 条聊天`,
      comparableSize: transcriptCount + lineCount * 2,
      conversationMessages: transcriptCount,
      pressureScore: clamp(Math.round(pressureScore), 10, 100),
      summary: story.status || story.summary || "情感记录"
    };
  });

  return [...sessionItems, ...articleItems, ...romanceItems];
}

function analyzeData(data) {
  const metadata = data.metadata || {};
  const targetId = metadata.target_person?.chat_id || "";
  const targetName = metadata.target_person?.name || targetId || "目标人物";
  const aliasMap = buildAliasMap(data.participants || {}, targetId);
  const sessions = (data.sessions || []).map((session, index) => analyzeSession(session, index, targetId, aliasMap));
  const allMessages = sessions.flatMap((session) => session.messages);
  const topParticipants = entriesFromMap(countBy(allMessages, (message) => message.sender))
    .map(([sender, count]) => ({ sender, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const totals = {
    sessionCount: sessions.length,
    messageCount: allMessages.length,
    targetMessages: allMessages.filter((message) => message.isTarget).length,
    activeParticipants: new Set(allMessages.map((message) => message.sender)).size
  };
  const hottestSession = sessions.slice().sort((a, b) => b.messageCount - a.messageCount)[0] || sessions[0];
  const strongestResponseSession = sessions.slice().sort((a, b) => b.responsePressure - a.responsePressure)[0] || sessions[0];
  const topDebateDays = sessions.slice().sort((a, b) => b.debateIntensity - a.debateIntensity || b.messageCount - a.messageCount).slice(0, 3);
  const topTargetResponders = buildTargetResponderStats(sessions, targetId);
  return {
    metadata,
    targetId,
    targetName,
    sessions,
    totals,
    topParticipants,
    hottestSession,
    strongestResponseSession,
    topDebateDays,
    topTargetResponders,
    dateRange: {
      start: sessions[0]?.date || "未知",
      end: sessions[sessions.length - 1]?.date || "未知"
    }
  };
}

function analyzeSession(session, sessionIndex, targetId, aliasMap) {
  const messages = (session.messages || []).map((message, messageIndex) => {
    const sender = aliasMap.get(message.sender) || message.sender;
    const replySender = message.reply_to?.sender ? (aliasMap.get(message.reply_to.sender) || message.reply_to.sender) : "";
    return {
      id: `${sessionIndex}-${messageIndex}`,
      time: normalizeTime(message.time || "未知时间"),
      sender,
      originalSender: message.sender,
      content: String(message.content || "").trim(),
      replyTo: message.reply_to ? {
        sender: replySender || "未知对象",
        content: String(message.reply_to.content || "").trim()
      } : null,
      isTarget: sender === targetId
    };
  });

  const category = classifyCategory(messages);
  const title = session.title || deriveSessionTitle(messages, category.id, session.date);
  const keywords = extractKeywords(messages.map((message) => message.content));
  const targetMessages = messages.filter((message) => message.isTarget);
  const topSpeakers = entriesFromMap(countBy(messages, (message) => message.sender))
    .map(([sender, count]) => ({ sender, count }))
    .sort((a, b) => b.count - a.count);
  const camp = analyzeCamp(messages, targetId, category.id);
  const questionRatio = ratio(messages.filter((message) => /[?？]/.test(message.content)).length, messages.length);
  const longRatio = ratio(messages.filter((message) => cleanText(message.content).length >= 24).length, messages.length);
  const debateIntensity = Math.min(100, Math.round(camp.summary.challenge.messages * 1.25 + camp.summary.support.messages * 0.8 + camp.activeParticipants * 2 + questionRatio * 24 + longRatio * 30));
  const campMeta = getCampMeta(category.id);
  const timelineMoments = buildTimelineMoments(messages, targetId, category.id, campMeta);
  const responsePressure = (messages.length - targetMessages.length) / Math.max(targetMessages.length, 1);
  const targetQuotes = selectQuotes(targetMessages, 3);
  const nonTargetQuotes = selectQuotes(messages.filter((message) => !message.isTarget), 4);
  const dominantCampKey = dominantCamp(camp);

  const messagesWithCamp = messages.map((message) => {
    const participant = camp.participantMap.get(message.sender);
    return {
      ...message,
      stance: message.isTarget ? "core" : classifyStance(message.content),
      participantCamp: message.isTarget ? "core" : participant?.camp || "observe"
    };
  });

  return {
    date: session.date,
    title,
    category,
    messageCount: messages.length,
    targetCount: targetMessages.length,
    responsePressure,
    keywords,
    targetQuotes,
    nonTargetQuotes,
    topSpeakers,
    camp,
    dominantCampLabel: campMeta[dominantCampKey].label,
    dominantCampKey,
    debateIntensity,
    timelineMoments,
    timeRange: `${messages[0]?.time || "未知"} - ${messages[messages.length - 1]?.time || "未知"}`,
    summary: buildSessionSummary(title, session.date, category, messages, timelineMoments, campMeta, dominantCampKey),
    messages: messagesWithCamp,
    campMethodNote: `${campMeta.core.label} ${targetMessages.length} 条`,
    sessionIndex
  };
}

function analyzeCamp(messages, targetId, categoryId) {
  const participantMap = new Map();
  const summary = {
    support: { participants: 0, messages: 0 },
    challenge: { participants: 0, messages: 0 },
    tease: { participants: 0, messages: 0 },
    observe: { participants: 0, messages: 0 }
  };

  for (const message of messages) {
    if (message.sender === targetId) {
      continue;
    }
    const stance = classifyStance(message.content);
    if (!participantMap.has(message.sender)) {
      participantMap.set(message.sender, {
        sender: message.sender,
        messageCount: 0,
        support: 0,
        challenge: 0,
        tease: 0,
        observe: 0,
        strongestQuote: null
      });
    }
    const participant = participantMap.get(message.sender);
    participant.messageCount += 1;
    participant[stance] += 1;
    if (!participant.strongestQuote || cleanText(message.content).length > cleanText(participant.strongestQuote.content).length) {
      participant.strongestQuote = message;
    }
  }

  const participants = Array.from(participantMap.values()).map((participant) => {
    const camp = finalizeCamp(participant, categoryId);
    summary[camp].participants += 1;
    summary[camp].messages += participant.messageCount;
    const enriched = { ...participant, camp };
    participantMap.set(participant.sender, enriched);
    return enriched;
  }).sort((a, b) => b.messageCount - a.messageCount);

  return {
    participantMap,
    participants,
    summary,
    activeParticipants: participants.length,
    messageCount: participants.reduce((sum, participant) => sum + participant.messageCount, 0)
  };
}

function buildTimelineMoments(messages, targetId, categoryId, campMeta) {
  if (!messages.length) {
    return [];
  }

  const meaningfulIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => cleanText(message.content).length >= 2)
    .map(({ index }) => index);

  const openerIndex = meaningfulIndexes[0] ?? 0;
  const firstReactionIndex = findIndexAfter(messages, openerIndex, (message) => !message.isTarget && (classifyStance(message.content) === "challenge" || classifyStance(message.content) === "tease" || /[?？]/.test(message.content)));
  const longTargetIndex = pickBestIndex(messages, (message) => message.isTarget, (message, index) => messageImportance(message, index, messages));
  const personalIndex = pickBestIndex(messages, (message) => /我家|我爸|我妈|小时候|苦恼|没钱|吃不饱|心烦意乱|没看明白|我不想|我只知道/.test(message.content), (message, index) => messageImportance(message, index, messages) + 3);
  const crowdPeakIndex = pickBestIndex(messages, () => true, (_message, index) => localActivityScore(messages, index) + messageImportance(messages[index], index, messages));
  const closerIndex = [...meaningfulIndexes].reverse().find((index) => cleanText(messages[index].content).length >= 4) ?? messages.length - 1;

  const seeds = [openerIndex, firstReactionIndex, longTargetIndex, personalIndex, crowdPeakIndex, closerIndex].filter((value) => value !== -1 && value !== undefined);
  const unique = pickDistinctMoments(seeds, messages);

  return unique.map((index, position) => {
    const message = messages[index];
    const stance = message.isTarget ? "core" : classifyStance(message.content);
    const color = stance === "core" ? campMeta.core.color : campMeta[stance].color;
    return {
      index,
      time: message.time,
      sender: message.sender,
      content: trimText(message.content, 82),
      title: momentTitle(message, categoryId, position, messages, index),
      impact: describeMomentImpact(messages, index, targetId),
      color
    };
  });
}

function pickDistinctMoments(seedIndexes, messages) {
  const scored = Array.from(new Set(seedIndexes)).map((index) => ({
    index,
    score: messageImportance(messages[index], index, messages) + localActivityScore(messages, index)
  })).sort((a, b) => b.score - a.score);

  const picked = [];
  for (const candidate of scored) {
    if (picked.every((existing) => Math.abs(existing - candidate.index) >= 4)) {
      picked.push(candidate.index);
    }
  }

  if (picked.length < 4) {
    const extras = messages.map((message, index) => ({
      index,
      score: messageImportance(message, index, messages) + localActivityScore(messages, index)
    })).sort((a, b) => b.score - a.score);
    for (const candidate of extras) {
      if (picked.every((existing) => Math.abs(existing - candidate.index) >= 4)) {
        picked.push(candidate.index);
      }
      if (picked.length >= 4) {
        break;
      }
    }
  }

  return picked.sort((a, b) => a - b).slice(0, 4);
}

function momentTitle(message, categoryId, position, messages, index) {
  const stance = message.isTarget ? "core" : classifyStance(message.content);
  if (categoryId === "ideology") {
    if (position === 0 && message.isTarget) return "立场抛出";
    if (stance === "challenge") return "现实派反击";
    if (stance === "tease") return "群体开始起哄";
    if (message.isTarget) return index > messages.length * 0.55 ? "通三哥继续硬顶" : "通三哥补充论点";
    if (stance === "support") return "有人顺着接";
  }
  if (categoryId === "local") {
    if (position === 0 && message.isTarget) return "信息抛点";
    if (stance === "challenge") return "现场质疑";
    if (stance === "tease") return "误读引爆笑场";
    if (/苦恼|心烦意乱/.test(message.content)) return "情绪反转";
  }
  if (categoryId === "group") {
    if (message.isTarget) return position === 0 ? "管理想法抛出" : "继续试探";
    if (stance === "challenge") return "担心后果";
    if (stance === "tease") return "抽象梗上线";
  }
  if (categoryId === "school") {
    if (message.isTarget) return "成绩抛点";
    if (stance === "tease" || stance === "challenge") return "集体吐槽";
  }
  if (message.isTarget) return position === 0 ? "起点" : "继续加码";
  if (stance === "challenge") return "直接回怼";
  if (stance === "tease") return "玩梗放大";
  if (stance === "support") return "顺势接话";
  return "补充材料";
}

function describeMomentImpact(messages, index, targetId) {
  const nextMessages = [];
  for (let i = index + 1; i < messages.length && nextMessages.length < 6; i += 1) {
    if (messages[i].sender === targetId && messages[index].sender === targetId) {
      break;
    }
    nextMessages.push(messages[i]);
  }
  if (!nextMessages.length) {
    return "这句之后对话基本就收住了，没有再形成新的连续接话。";
  }

  const uniqueSpeakers = new Set(nextMessages.map((message) => message.sender)).size;
  const counts = { challenge: 0, support: 0, tease: 0, observe: 0 };
  for (const message of nextMessages) {
    if (message.sender === targetId) {
      continue;
    }
    counts[classifyStance(message.content)] += 1;
  }

  const dominant = ["challenge", "tease", "support", "observe"]
    .map((key) => ({ key, count: counts[key] }))
    .sort((a, b) => b.count - a.count)[0];

  const labelMap = {
    challenge: "现实反驳",
    tease: "起哄玩梗",
    support: "顺势接话",
    observe: "补充材料"
  };

  return `后面连续 ${nextMessages.length} 条里有 ${uniqueSpeakers} 个人接上来，主色是 ${labelMap[dominant.key]}（${dominant.count} 条）。`;
}

function buildSessionSummary(title, date, category, messages, timelineMoments, campMeta, dominantCampKey) {
  const first = timelineMoments[0];
  const last = timelineMoments[timelineMoments.length - 1];
  const loudestSpeaker = topSpeakerForMessages(messages);
  return `这组对话可以直接概括成“${title}”。它从“${first?.title || "起点"}”开始，经过“${timelineMoments[1]?.title || "中段升级"}”，最后落到“${last?.title || "收尾"}”。最常见的接法是 ${campMeta[dominantCampKey].label}，而最活跃的说话人是 ${loudestSpeaker?.sender || "暂无"}。`;
}

function buildMindOrbit(session, campMeta) {
  const challengePerson = session.camp.participants.find((participant) => participant.camp === "challenge");
  const teasePerson = session.camp.participants.find((participant) => participant.camp === "tease");
  const supportPerson = session.camp.participants.find((participant) => participant.camp === "support");

  const nodes = [
    mindNode("center", 550, 360, "当天命题", session.title, `${session.date} · ${session.category.label}`, 0),
    mindNode("", 385, 225, "关键词簇", session.keywords.slice(0, 3).map((item) => item.token).join(" · ") || "关键词分散", session.timelineMoments[0]?.title || "起点", 0.2),
    mindNode("", 390, 495, campMeta.core.label, trimText(session.targetQuotes[0]?.content || "通三哥这天更偏短句", 34), session.targetQuotes[1]?.content || "", 0.35),
    mindNode("", 715, 225, "群体回声", trimText(session.nonTargetQuotes[0]?.content || "当天回应偏短", 34), session.nonTargetQuotes[1]?.content || "", 0.5),
    mindNode("", 720, 500, "阵营结果", session.dominantCampLabel, `${session.camp.summary.challenge.messages + session.camp.summary.support.messages + session.camp.summary.tease.messages} 条高反应消息`, 0.65),
    mindNode("", 305, 140, "补充词", session.keywords[4]?.token || "通山", session.keywords[4] ? `权重 ${session.keywords[4].score.toFixed(1)}` : "", 0.9),
    mindNode("", 505, 130, "补充词", session.keywords[5]?.token || "改开", session.keywords[5] ? `权重 ${session.keywords[5].score.toFixed(1)}` : "", 1.05),
    mindNode("", 315, 585, "延展句", trimText(session.targetQuotes[1]?.content || session.targetQuotes[0]?.content || "暂无", 24), session.targetQuotes[1] ? `${session.targetQuotes[1].sender} · ${session.targetQuotes[1].time}` : "", 1.2),
    mindNode("", 505, 590, challengePerson ? campMeta.challenge.label : campMeta.support.label, trimText(challengePerson?.strongestQuote?.content || supportPerson?.strongestQuote?.content || "暂无", 28), `${challengePerson?.sender || supportPerson?.sender || "未知"}`, 1.35),
    mindNode("", 805, 320, teasePerson ? campMeta.tease.label : campMeta.observe.label, trimText(teasePerson?.strongestQuote?.content || session.nonTargetQuotes[2]?.content || "暂无", 28), `${teasePerson?.sender || session.nonTargetQuotes[2]?.sender || "未知"}`, 1.5),
    mindNode("", 810, 555, "人数与消息", `${session.camp.summary.challenge.participants}/${session.camp.summary.support.participants}/${session.camp.summary.tease.participants}`, "反驳 / 附和 / 起哄", 1.65)
  ];

  const edges = [
    [0, 1, session.category.color, 3.6, 0.42],
    [0, 2, campMeta.core.color, 3.6, 0.42],
    [0, 3, campMeta.observe.color, 3.2, 0.42],
    [0, 4, campMeta.challenge.color, 3.2, 0.42],
    [1, 5, session.category.color, 2.4, 0.32],
    [1, 6, session.category.color, 2.4, 0.32],
    [2, 7, campMeta.core.color, 2.4, 0.32],
    [2, 8, campMeta.challenge.color, 2.4, 0.32],
    [3, 9, campMeta.tease.color, 2.4, 0.32],
    [4, 10, campMeta.challenge.color, 2.4, 0.32]
  ];

  const paths = edges.map(([fromIndex, toIndex, color, width, opacity]) => bezier(nodes[fromIndex], nodes[toIndex], color, width, opacity));
  return { nodes, paths };
}

function activateMindMap() {
  const viewport = document.querySelector("[data-mind-viewport]");
  const surface = document.querySelector("[data-mind-surface]");
  if (!viewport || !surface) {
    return;
  }

  const key = viewport.dataset.sessionKey;
  applyMindTransform(surface, ensureMindView(viewport));

  let activePointers = new Map();
  let lastDist = 0;
  let dragging = false;
  let startX = 0, startY = 0;
  let originX = 0, originY = 0;

  viewport.onpointerdown = (event) => {
    if (event.target.closest("button")) return;
    activePointers.set(event.pointerId, event);
    viewport.setPointerCapture(event.pointerId);

    if (activePointers.size === 1) {
      dragging = true;
      viewport.classList.add("dragging");
      startX = event.clientX;
      startY = event.clientY;
      originX = state.mindViews[key].x;
      originY = state.mindViews[key].y;
    } else if (activePointers.size === 2) {
      dragging = false;
      const pts = Array.from(activePointers.values());
      lastDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
    }
  };

  viewport.onpointermove = (event) => {
    activePointers.set(event.pointerId, event);

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      if (lastDist > 0) {
        const factor = dist / lastDist;
        const centerX = (pts[0].clientX + pts[1].clientX) / 2;
        const centerY = (pts[0].clientY + pts[1].clientY) / 2;
        zoomMindAt(viewport, factor, centerX, centerY);
      }
      lastDist = dist;
    } else if (dragging && activePointers.size === 1) {
      state.mindViews[key].x = originX + (event.clientX - startX);
      state.mindViews[key].y = originY + (event.clientY - startY);
      applyMindTransform(surface, state.mindViews[key]);
    }
  };

  viewport.onpointerup = (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) lastDist = 0;
    if (activePointers.size === 0) {
      dragging = false;
      viewport.classList.remove("dragging");
    }
  };

  viewport.onpointercancel = viewport.onpointerup;
  viewport.ondblclick = () => {
    state.mindViews[key] = fitMindView(viewport);
    applyMindTransform(surface, state.mindViews[key]);
  };
}

function zoomMindAt(viewport, factor, clientX, clientY) {
  const surface = viewport.querySelector("[data-mind-surface]");
  const view = ensureMindView(viewport);
  const rect = viewport.getBoundingClientRect();
  const nextScale = clamp(view.scale * factor, MIND_SCALE_MIN, MIND_SCALE_MAX);

  if (nextScale === view.scale) return;

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const worldX = (localX - view.x) / view.scale;
  const worldY = (localY - view.y) / view.scale;

  view.scale = nextScale;
  view.x = localX - worldX * nextScale;
  view.y = localY - worldY * nextScale;
  applyMindTransform(surface, view);
}

function handleMindAction(action, viewport) {
  const wrap = viewport.closest(".mind-wrap");

  if (action === "fullscreen") {
    wrap?.classList.toggle("fullscreen");
    const isFull = wrap?.classList.contains("fullscreen");
    const btn = wrap?.querySelector('[data-mind-action="fullscreen"]');
    if (btn) btn.textContent = isFull ? "退出" : "全屏";

    // Resize logic
    setTimeout(() => {
      const key = viewport.dataset.sessionKey;
      state.mindViews[key] = fitMindView(viewport);
      applyMindTransform(viewport.querySelector("[data-mind-surface]"), state.mindViews[key]);
    }, 50);
    return;
  }

  if (action === "reset") {
    resetMindView(viewport);
    return;
  }

  if (action === "zoom-in") {
    zoomMindView(viewport, MIND_SCALE_STEP);
    return;
  }

  if (action === "zoom-out") {
    zoomMindView(viewport, 1 / MIND_SCALE_STEP);
  }
}

function ensureMindView(viewport) {
  const key = viewport.dataset.sessionKey;
  if (!state.mindViews[key]) {
    state.mindViews[key] = fitMindView(viewport);
  }
  return state.mindViews[key];
}

function zoomMindView(viewport, factor) {
  const surface = viewport.querySelector("[data-mind-surface]");
  if (!surface) {
    return;
  }

  const view = ensureMindView(viewport);
  const nextScale = clamp(view.scale * factor, MIND_SCALE_MIN, MIND_SCALE_MAX);
  if (nextScale === view.scale) {
    return;
  }

  const centerX = viewport.clientWidth / 2;
  const centerY = viewport.clientHeight / 2;
  const worldX = (centerX - view.x) / view.scale;
  const worldY = (centerY - view.y) / view.scale;

  view.scale = nextScale;
  view.x = centerX - worldX * nextScale;
  view.y = centerY - worldY * nextScale;
  applyMindTransform(surface, view);
}

function resetMindView(viewport) {
  const surface = viewport.querySelector("[data-mind-surface]");
  if (!surface) {
    return;
  }
  const key = viewport.dataset.sessionKey;
  state.mindViews[key] = fitMindView(viewport);
  applyMindTransform(surface, state.mindViews[key]);
}

function fitMindView(viewport) {
  const scale = Math.min(viewport.clientWidth / MIND_SURFACE.width, viewport.clientHeight / MIND_SURFACE.height) * 0.94;
  return {
    scale,
    x: (viewport.clientWidth - MIND_SURFACE.width * scale) / 2,
    y: (viewport.clientHeight - MIND_SURFACE.height * scale) / 2
  };
}

function applyMindTransform(surface, view) {
  surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function buildTargetResponderStats(sessions, targetId) {
  const map = new Map();
  for (const session of sessions) {
    for (let i = 0; i < session.messages.length; i += 1) {
      const message = session.messages[i];
      if (message.sender !== targetId) {
        continue;
      }
      const seenInThisReplyWindow = new Set();
      for (let j = i + 1, steps = 0; j < session.messages.length && steps < 6; j += 1) {
        if (session.messages[j].sender === targetId) {
          break;
        }
        steps += 1;
        const reply = session.messages[j];
        if (!map.has(reply.sender)) {
          map.set(reply.sender, {
            sender: reply.sender,
            count: 0,
            sessions: new Set(),
            support: 0,
            challenge: 0,
            tease: 0,
            observe: 0
          });
        }
        const entry = map.get(reply.sender);
        entry.count += 1;
        if (!seenInThisReplyWindow.has(reply.sender)) {
          entry.sessions.add(session.date);
          seenInThisReplyWindow.add(reply.sender);
        }
        entry[classifyStance(reply.content)] += 1;
      }
    }
  }

  return Array.from(map.values())
    .map((item) => {
      const dominantRole = ["challenge", "support", "tease", "observe"]
        .map((key) => ({ key, count: item[key] }))
        .sort((a, b) => b.count - a.count)[0].key;
      const roleLabel = {
        challenge: "现实反驳",
        support: "接话附和",
        tease: "玩梗围观",
        observe: "补充观察"
      };
      return {
        sender: item.sender,
        count: item.count,
        sessions: item.sessions.size,
        dominantRole,
        dominantRoleLabel: roleLabel[dominantRole]
      };
    })
    .sort((a, b) => b.count - a.count);
}

function classifyCategory(messages) {
  const ranked = CATEGORY_RULES.map((rule) => ({
    ...rule,
    score: messages.reduce((sum, message) => sum + rule.keywords.reduce((inner, keyword) => inner + (message.content.includes(keyword) ? 1 : 0), 0), 0)
  })).sort((a, b) => b.score - a.score);

  if (!ranked[0] || ranked[0].score === 0) {
    return { id: "general", label: "群聊切片", color: "#9a725c", keywords: [] };
  }
  return ranked[0];
}

function extractKeywords(contents) {
  const freq = new Map();
  for (const content of contents) {
    const text = cleanText(content);
    if (!text) {
      continue;
    }

    for (const rule of CATEGORY_RULES) {
      for (const keyword of rule.keywords) {
        if (text.includes(keyword)) {
          addCount(freq, keyword, 2);
        }
      }
    }

    const chineseChunks = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
    for (const chunk of chineseChunks) {
      if (chunk.length <= 4 && !STOPWORDS.has(chunk)) {
        addCount(freq, chunk, 1.1);
      }
      if (chunk.length >= 4) {
        for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
          for (let i = 0; i <= chunk.length - size; i += 1) {
            const token = chunk.slice(i, i + size);
            if (!STOPWORDS.has(token)) {
              addCount(freq, token, size >= 3 ? 0.65 : 0.45);
            }
          }
        }
      }
    }
  }

  return entriesFromMap(freq)
    .map(([token, score]) => ({ token, score }))
    .filter((item) => item.token.length >= 2 && !STOPWORDS.has(item.token))
    .sort((a, b) => b.score - a.score || b.token.length - a.token.length)
    .filter((item, index, array) => !array.some((other, otherIndex) => otherIndex < index && other.token.includes(item.token) && other.score >= item.score))
    .slice(0, 12);
}

function classifyStance(text) {
  if (!text || /^\[[^\]]+\]$/.test(text.trim())) {
    return "observe";
  }

  const normalized = text.toLowerCase();
  const supportPatterns = [/支持/, /同意/, /是的/, /确实/, /有道理/, /没错/, /正面意义/, /包的/, /对啊/, /可以/];
  const challengePatterns = [/不主张/, /不可能/, /不会/, /不是/, /搞笑/, /做梦/, /疯了/, /意义不明/, /你在说啥/, /说反了/, /没听懂/, /不想/, /不如/, /怎么跟你说/, /真的假的/, /那不会/, /你在幻想什么/];
  const teasePatterns = [/哈哈/, /笑死/, /😂/, /🤣/, /🧐/, /暴论/, /抽象/, /梗/, /nm/, /乐/, /666/, /六六六/];

  let support = countHits(normalized, supportPatterns);
  let challenge = countHits(normalized, challengePatterns);
  let tease = countHits(normalized, teasePatterns);
  const length = cleanText(text).length;

  if (/[?？]/.test(normalized) && length <= 14) {
    challenge += 0.8;
  }
  if (length >= 28) {
    support += 0.35;
    challenge += 0.35;
  }
  if (tease >= 1.2 && support === 0 && challenge === 0) {
    return "tease";
  }
  if (challenge >= support + 0.8) {
    return tease > challenge ? "tease" : "challenge";
  }
  if (support >= challenge + 0.8) {
    return "support";
  }
  if (tease >= 1) {
    return "tease";
  }
  return "observe";
}

function finalizeCamp(participant, categoryId) {
  if (participant.support >= participant.challenge + 1 && participant.support >= participant.tease) {
    return "support";
  }
  if (participant.challenge >= participant.support + 1) {
    return "challenge";
  }
  if (participant.tease >= Math.max(participant.support, participant.challenge) && participant.tease >= 1) {
    return "tease";
  }
  if (categoryId === "local" && participant.challenge === 0 && participant.tease >= 1) {
    return "tease";
  }
  return "observe";
}

function getCampMeta(categoryId) {
  if (categoryId === "ideology") {
    return {
      core: { label: "通三哥主张", color: "#c57c56" },
      support: { label: "制度共振", color: "#70877f" },
      challenge: { label: "现实派反驳", color: "#c96a50" },
      tease: { label: "玩梗围观", color: "#b79a57" },
      observe: { label: "材料补充", color: "#988c7f" }
    };
  }
  if (categoryId === "local") {
    return {
      core: { label: "通山叙述", color: "#70877f" },
      support: { label: "顺势接话", color: "#7a938b" },
      challenge: { label: "现场质疑", color: "#c57c56" },
      tease: { label: "群嘲起哄", color: "#b79a57" },
      observe: { label: "围观补充", color: "#988c7f" }
    };
  }
  if (categoryId === "group") {
    return {
      core: { label: "管理主张", color: "#9a725c" },
      support: { label: "顺势接球", color: "#70877f" },
      challenge: { label: "风险质疑", color: "#c96a50" },
      tease: { label: "抽象调侃", color: "#b79a57" },
      observe: { label: "旁路补充", color: "#988c7f" }
    };
  }
  if (categoryId === "school") {
    return {
      core: { label: "成绩抛点", color: "#b79a57" },
      support: { label: "顺手接话", color: "#70877f" },
      challenge: { label: "打趣质疑", color: "#c57c56" },
      tease: { label: "起哄玩梗", color: "#b79a57" },
      observe: { label: "轻量围观", color: "#988c7f" }
    };
  }
  return {
    core: { label: "核心发言", color: "#c57c56" },
    support: { label: "接话附和", color: "#70877f" },
    challenge: { label: "直接质疑", color: "#c96a50" },
    tease: { label: "玩梗围观", color: "#b79a57" },
    observe: { label: "补充观察", color: "#988c7f" }
  };
}

function currentSession() {
  return state.analysis.sessions[state.selectedIndex];
}

function buildAliasMap(participants, targetId) {
  const aliasMap = new Map();
  for (const [name, profile] of Object.entries(participants)) {
    if (name === targetId) {
      aliasMap.set(name, targetId);
      for (const nickname of profile.nicknames || []) {
        aliasMap.set(nickname, targetId);
      }
      continue;
    }
    if ((profile.note || "").includes(targetId)) {
      aliasMap.set(name, targetId);
    } else {
      aliasMap.set(name, name);
    }
  }
  return aliasMap;
}

function selectQuotes(messages, limit) {
  return messages
    .filter((message) => cleanText(message.content).length >= 6)
    .sort((a, b) => cleanText(b.content).length - cleanText(a.content).length)
    .filter((message, index, array) => array.findIndex((item) => item.content === message.content) === index)
    .slice(0, limit)
    .map((message) => ({
      sender: message.sender,
      time: message.time,
      content: trimText(message.content, 90)
    }));
}

function topSpeakerForMessages(messages) {
  return entriesFromMap(countBy(messages, (message) => message.sender))
    .map(([sender, count]) => ({ sender, count }))
    .sort((a, b) => b.count - a.count)[0];
}

function deriveSessionTitle(messages, categoryId, date) {
  const fullText = messages.map((message) => message.content).join(" ");
  const checks = {
    local: [
      ["你指出来", "通山未脱贫"],
      ["豪客来卤菜店", "豪客来卤菜店"],
      ["三无语言", "三无语言"],
      ["普通话之乡", "普通话之乡"],
      ["通山新闻联播", "通山新闻联播"]
    ],
    school: [
      ["毛概考试", "毛概 71"],
      ["毛概 71", "毛概 71"]
    ],
    group: [
      ["恢复管理", "恢复管理"],
      ["旺座理论", "旺座理论"]
    ],
    ideology: [
      ["你指出来", "通山未脱贫"],
      ["恢复毛主席时期的制度", "恢复毛主席时期的制度"],
      ["改开是有成就的", "改开两面看待"],
      ["计划经济", "计划经济能不能回去"],
      ["控制资本", "控制资本就行了？"]
    ],
    general: [
      ["你指出来", "通山未脱贫"]
    ]
  };

  for (const [needle, title] of checks[categoryId] || []) {
    if (fullText.includes(needle)) {
      return title;
    }
  }

  const candidate = extractKeywords(messages.map((message) => message.content))
    .map((item) => item.token)
    .find((token) => token.length >= 3 && !/现在|以前|我们|他们|什么|没有/.test(token));

  if (candidate) {
    return candidate;
  }

  const firstLong = messages.find((message) => cleanText(message.content).length >= 4);
  return firstLong ? trimText(firstLong.content, 16) : date;
}

function countBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    addCount(map, getter(item), 1);
  }
  return map;
}

function addCount(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function entriesFromMap(map) {
  return Array.from(map.entries());
}

function countHits(text, patterns) {
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

function cleanText(text) {
  return String(text || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/@[^\s@]+/g, " ")
    .replace(/[“”"'`~!@#$%^&*()_+\-={}\[\]|\\:;"<>,./?·！￥…（）—【】、；：‘’“”，。《》？\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }
  return raw;
}

function trimText(text, maxLength) {
  const raw = String(text || "").trim();
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw;
}

function shortName(name) {
  return name.length <= 8 ? name : `${name.slice(0, 7)}…`;
}

function messageImportance(message, index, messages) {
  const length = cleanText(message.content).length;
  const mentionCount = (message.content.match(/@/g) || []).length;
  const stance = message.isTarget ? "core" : classifyStance(message.content);
  const stanceWeight = {
    core: 2.6,
    challenge: 2.2,
    support: 1.3,
    tease: 1.5,
    observe: 0.8
  };
  return length / 12 + mentionCount * 0.6 + stanceWeight[stance] + localActivityScore(messages, index) * 0.2;
}

function localActivityScore(messages, index) {
  const slice = messages.slice(Math.max(0, index - 3), Math.min(messages.length, index + 4));
  const uniqueSpeakers = new Set(slice.map((message) => message.sender)).size;
  const nonObserve = slice.filter((message) => message.isTarget || classifyStance(message.content) !== "observe").length;
  return uniqueSpeakers + nonObserve * 0.4;
}

function findIndexAfter(messages, startIndex, predicate) {
  for (let i = startIndex + 1; i < messages.length; i += 1) {
    if (predicate(messages[i], i)) {
      return i;
    }
  }
  return -1;
}

function pickBestIndex(messages, predicate, scorer) {
  let bestIndex = -1;
  let bestScore = -Infinity;
  messages.forEach((message, index) => {
    if (!predicate(message, index)) {
      return;
    }
    const score = scorer(message, index);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function dominantCamp(camp) {
  return ["challenge", "support", "tease", "observe"]
    .map((key) => ({ key, count: camp.summary[key].messages }))
    .sort((a, b) => b.count - a.count)[0].key;
}

function factCard(label, value) {
  return `
    <article class="fact-card">
      <div class="fact-head">
        <span class="section-kicker">${escapeHtml(label)}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function overviewCard(label, value, text) {
  return `
    <article class="overview-card card">
      <div class="overview-label">${escapeHtml(label)}</div>
      <div class="overview-value">${escapeHtml(value)}</div>
      <div class="overview-text">${escapeHtml(text)}</div>
    </article>
  `;
}

function metricChip(text) {
  return `<span class="metric-chip">${escapeHtml(text)}</span>`;
}

function filterChip(value, active, label, count) {
  return `<button class="filter-chip ${active ? "active" : ""}" data-speaker-filter="${escapeAttr(value)}">${escapeHtml(label)}${typeof count === "number" ? ` · ${count}` : ""}</button>`;
}

function filterCampChip(value, active, label) {
  return `<button class="filter-chip ${active ? "active" : ""}" data-camp-filter="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function mindNode(kind, x, y, kicker, title, body, delay) {
  return { kind, x, y, kicker, title, body, delay };
}

function bezier(fromNode, toNode, color, width, opacity) {
  return {
    from: { x: fromNode.x, y: fromNode.y },
    to: { x: toNode.x, y: toNode.y },
    c1: { x: fromNode.x + (toNode.x - fromNode.x) * 0.34, y: fromNode.y },
    c2: { x: fromNode.x + (toNode.x - fromNode.x) * 0.68, y: toNode.y },
    color,
    width,
    opacity
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function clampIndex(index, length) {
  if (!length) {
    return 0;
  }
  return Math.max(0, Math.min(index, length - 1));
}

function ratio(a, b) {
  return b ? a / b : 0;
}

function percent(a, b) {
  return Math.round(ratio(a, b) * 100);
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function createSearchSnippet(text, query, radius = 38) {
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  const key = String(query ?? "").trim().toLowerCase();
  if (!source) {
    return "";
  }
  if (!key) {
    return source.slice(0, radius * 2);
  }
  const lower = source.toLowerCase();
  const index = lower.indexOf(key);
  if (index === -1) {
    return source.slice(0, radius * 2);
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + key.length + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function highlightMatchHtml(text, query) {
  const source = String(text ?? "");
  const key = String(query ?? "").trim();
  if (!source) {
    return "";
  }
  if (!key) {
    return escapeHtml(source);
  }

  const lowerSource = source.toLowerCase();
  const lowerKey = key.toLowerCase();
  let cursor = 0;
  let html = "";

  while (cursor < source.length) {
    const hit = lowerSource.indexOf(lowerKey, cursor);
    if (hit === -1) {
      html += escapeHtml(source.slice(cursor));
      break;
    }
    html += escapeHtml(source.slice(cursor, hit));
    html += `<span class="global-search-mark">${escapeHtml(source.slice(hit, hit + key.length))}</span>`;
    cursor = hit + key.length;
  }

  return html;
}
