const DATA_URL = "./恋斌场.json";
const POLL_INTERVAL = 20000;
const MIND_SURFACE = { width: 1100, height: 720 };
const MIND_SCALE_MIN = 0.42;
const MIND_SCALE_MAX = 2.2;
const MIND_SCALE_STEP = 1.16;

const state = {
  data: null,
  selectedIndex: 0,
  globalSearch: "",
  globalSearchComposing: false,
  transcriptSearch: "",
  roleFilter: "all",
  speakerFilters: new Set(),
  dataSignature: "",
  mobileRailOpen: false,
  mindViews: {}
};

const el = {
  loadingScreen: document.getElementById("loadingScreen"),
  mobileRailBackdrop: document.getElementById("mobileRailBackdrop"),
  heroDescription: document.getElementById("heroDescription"),
  globalSearchPanel: document.getElementById("globalSearchPanel"),
  heroMetrics: document.getElementById("heroMetrics"),
  overview: document.getElementById("overview"),
  updatedChip: document.getElementById("updatedChip"),
  refreshButton: document.getElementById("refreshButton"),
  sessionRail: document.getElementById("sessionRail"),
  focusPanel: document.getElementById("focusPanel"),
  transcriptPanel: document.getElementById("transcriptPanel")
};

boot();

function boot() {
  document.body.classList.add("loading");
  bindEvents();
  refreshData("初始化载入");
  window.setInterval(() => refreshData("定时轮询", { silent: true }), POLL_INTERVAL);
}

function bindEvents() {
  el.refreshButton.addEventListener("click", () => refreshData("手动刷新"));

  document.addEventListener("click", (event) => {
    const mobileAction = event.target.closest("[data-mobile-action]");
    if (mobileAction) {
      if (mobileAction.dataset.mobileAction === "toggle-rail") {
        state.mobileRailOpen = !state.mobileRailOpen;
        document.body.classList.toggle("mobile-rail-open", state.mobileRailOpen);
      }
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

    const mobileClose = event.target.closest("[data-mobile-close]");
    if (mobileClose || event.target === el.mobileRailBackdrop) {
      state.mobileRailOpen = false;
      document.body.classList.remove("mobile-rail-open");
      return;
    }

    const jumpButton = event.target.closest("[data-jump-target]");
    if (jumpButton) {
      state.mobileRailOpen = false;
      document.body.classList.remove("mobile-rail-open");
      const target = document.getElementById(jumpButton.dataset.jumpTarget);
      if (target) {
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }

    const globalEntry = event.target.closest("[data-global-entry-index]");
    if (globalEntry) {
      state.selectedIndex = Number(globalEntry.dataset.globalEntryIndex);
      state.globalSearch = "";
      resetTranscriptFilters();
      render();
      state.mobileRailOpen = false;
      document.body.classList.remove("mobile-rail-open");
      const focusAnchor = document.getElementById("focusAnchor");
      if (focusAnchor) {
        window.requestAnimationFrame(() => {
          focusAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }

    const sessionButton = event.target.closest("[data-session-index]");
    if (sessionButton) {
      state.selectedIndex = Number(sessionButton.dataset.sessionIndex);
      resetTranscriptFilters();
      render();
      state.mobileRailOpen = false;
      document.body.classList.remove("mobile-rail-open");

      const focusAnchor = document.getElementById("focusAnchor");
      if (focusAnchor) {
        window.requestAnimationFrame(() => {
          focusAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }

    const speakerButton = event.target.closest("[data-speaker-filter]");
    if (speakerButton) {
      toggleSpeakerFilter(speakerButton.dataset.speakerFilter || "");
      renderTranscript(currentStory());
      return;
    }

    const roleButton = event.target.closest("[data-role-filter]");
    if (roleButton) {
      state.roleFilter = roleButton.dataset.roleFilter || "all";
      renderTranscript(currentStory());
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

    if (event.target.matches("[data-transcript-search-box]")) {
      state.transcriptSearch = event.target.value;
      renderTranscript(currentStory());
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
}

async function refreshData(reason, options = {}) {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rawText = await response.text();
    const signature = hashText(rawText);
    if (signature === state.dataSignature && options.silent) return;

    state.data = JSON.parse(rawText);
    state.dataSignature = signature;
    state.selectedIndex = clamp(state.selectedIndex, 0, Math.max(0, (state.data.stories?.length || 1) - 1));

    el.updatedChip.textContent = `已更新 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    render();
    document.body.classList.remove("loading");
    if (el.loadingScreen) el.loadingScreen.classList.add("hidden");
  } catch (error) {
    console.error(error);
    el.focusPanel.innerHTML = '<div class="empty-state">读取 <code>恋斌场.json</code> 失败，请通过开发服务器访问页面。</div>';
  }
}

function render() {
  if (!state.data || !Array.isArray(state.data.stories) || !state.data.stories.length) return;

  const current = currentStory();
  const totalMessages = state.data.stories.reduce((sum, story) => sum + (story.transcript?.length || 0), 0);

  el.heroDescription.textContent = escapeHtml(state.data.metadata?.description || "");
  renderGlobalSearchPanel();
  el.heroMetrics.innerHTML = `
    <div class="metric-chip"><span>共计</span><strong>${state.data.stories.length} 条情感记录</strong></div>
    <div class="metric-chip"><span>主角</span><strong>${escapeHtml(state.data.metadata?.target_person?.name || "未知")}</strong></div>
    <div class="metric-chip"><span>对话数</span><strong>${totalMessages} 条</strong></div>
  `;

  el.overview.innerHTML = `
    <article class="overview-card card">
      <div class="overview-label">最新收录</div>
      <div class="overview-value">${escapeHtml(state.data.stories[0]?.title || "暂无")}</div>
      <div class="overview-text">${escapeHtml(state.data.stories[0]?.date || "")}</div>
    </article>
    <article class="overview-card card">
      <div class="overview-label">当前阶段</div>
      <div class="overview-value">${escapeHtml(current?.stage || "未标注")}</div>
      <div class="overview-text">${escapeHtml(current?.status || "")}</div>
    </article>
    <article class="overview-card card">
      <div class="overview-label">主要对象</div>
      <div class="overview-value">${escapeHtml(current?.counterpart || "未标注")}</div>
      <div class="overview-text">${escapeHtml(current?.source || "")}</div>
    </article>
  `;

  el.sessionRail.innerHTML = state.data.stories.map((story, index) => `
    <button class="session-button ${state.selectedIndex === index ? "active" : ""}" data-session-index="${index}">
      <div class="session-topline">
        <div class="session-event">${escapeHtml(story.title)}</div>
        <span class="session-type" style="color:#b46a5e">情史</span>
      </div>
      <div class="session-date">${escapeHtml(story.date)}</div>
      <div class="session-meta" style="margin-top: 12px;">
        <span>${escapeHtml(story.stage || "未分类")}</span>
        <span>${story.transcript?.length || 0} 条聊天</span>
      </div>
    </button>
  `).join("");

  renderFocusPanel(current);
  renderTranscript(current);
}

function renderFocusPanel(story) {
  const graph = buildEmotionOrbit(story);
  const tags = (story.tags || []).map((tag) => `<span class="small-pill">${escapeHtml(tag)}</span>`).join("");

  el.focusPanel.innerHTML = `
    <section class="focus-summary">
      <div class="focus-title-row">
        <div class="focus-date">${escapeHtml(story.title)}</div>
        <button class="jump-button" type="button" data-jump-target="transcriptAnchor">查看原始聊天</button>
      </div>
      <div class="focus-headline">
        <span class="small-pill">${escapeHtml(story.date)}</span>
        <span class="small-pill">${escapeHtml(story.stage || "未标注")}</span>
        <span class="small-pill">${escapeHtml(story.status || "未标注")}</span>
      </div>
      <div class="focus-facts story-summary">
        <article class="fact-card">
          <div class="fact-kicker">核心提问</div>
          <div class="fact-value">${escapeHtml(story.overview?.premise || "")}</div>
        </article>
        <article class="fact-card">
          <div class="fact-kicker">关键转折</div>
          <div class="fact-value">${escapeHtml(story.overview?.turning_point || "")}</div>
        </article>
        <article class="fact-card">
          <div class="fact-kicker">对象定位</div>
          <div class="fact-value">${escapeHtml(story.overview?.verdict || "")}</div>
        </article>
        <article class="fact-card">
          <div class="fact-kicker">关键词</div>
          <div class="fact-value">${escapeHtml((story.tags || []).join(" / "))}</div>
        </article>
        <article class="fact-card full-width">
          <div class="fact-kicker">摘要</div>
          <div class="fact-value long-text">${escapeHtml(story.summary || "")}</div>
        </article>
      </div>
    </section>

    <div class="story-layout">
      <section class="story-panel timeline-panel">
        <h3 class="story-title">感情线</h3>
        <div class="timeline-list">
          ${(story.relationshipLine || []).map((item) => `
            <article class="timeline-item" style="--node-color:${item.color}">
              <div class="timeline-head">
                <div>
                  <div class="timeline-time">${escapeHtml(item.time)}</div>
                </div>
                <span class="timeline-tag" style="color:${item.color}">${escapeHtml(item.title)}</span>
              </div>
              <p>${escapeHtml(item.content)}</p>
              <div class="timeline-impact">${escapeHtml(item.impact)}</div>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="story-panel">
        <h3 class="story-title">情感图</h3>
        <div class="mind-wrap">
          <div class="mind-toolbar">
            <button class="mind-tool-button" type="button" data-mind-action="zoom-in">放大</button>
            <button class="mind-tool-button" type="button" data-mind-action="zoom-out">缩小</button>
            <button class="mind-tool-button" type="button" data-mind-action="reset">恢复</button>
            <button class="mind-tool-button" type="button" data-mind-action="fullscreen">全屏</button>
          </div>
          <div class="mind-viewport" data-mind-viewport data-session-key="${escapeAttr(story.id)}">
            <div class="mind-surface" data-mind-surface>
              <svg class="mind-svg" viewBox="0 0 ${MIND_SURFACE.width} ${MIND_SURFACE.height}" aria-hidden="true">
                ${graph.paths.map((path) => `
                  <path
                    class="mind-beam"
                    d="M ${path.from.x} ${path.from.y} C ${path.c1.x} ${path.c1.y}, ${path.c2.x} ${path.c2.y}, ${path.to.x} ${path.to.y}"
                    stroke="${path.color}"
                    stroke-width="${path.width}"
                    opacity="${path.opacity}"
                  />
                `).join("")}
              </svg>
              ${graph.nodes.map((node) => `
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

function renderTranscript(story) {
  if (!story) {
    el.transcriptPanel.innerHTML = '<div class="empty-state">当前没有可展示的原始聊天。</div>';
    return;
  }
  const targetId = state.data.metadata?.target_person?.chat_id || "";
  const visibleMessages = getVisibleTranscriptMessages(story);
  const speakerStats = getSpeakerStats(story);
  const speakerChips = [
    filterSpeakerChip("__all__", state.speakerFilters.size === 0, "全部说话人", story.transcript?.length || 0),
    ...speakerStats.map(({ sender, count }) => filterSpeakerChip(sender, state.speakerFilters.has(sender), sender, count))
  ].join("");
  const roleChips = [
    filterRoleChip("all", state.roleFilter === "all", "全部身份"),
    filterRoleChip("target", state.roleFilter === "target", "老斌发言"),
    filterRoleChip("other", state.roleFilter === "other", "对方判断")
  ].join("");

  el.transcriptPanel.innerHTML = `
    <div class="toolbar-row">
      <input
        class="search-box"
        data-transcript-search-box
        type="search"
        value="${escapeAttr(state.transcriptSearch)}"
        placeholder="搜索名字或内容，例如 复合 / 放下 / 富家女"
      >
      <div class="toolbar-group">${speakerChips}</div>
    </div>
    <div style="margin-top:12px" class="toolbar-group">${roleChips}</div>
    <div class="transcript-meta">
      <span>显示 ${visibleMessages.length} / ${story.transcript?.length || 0} 条消息</span>
      <span>${escapeHtml(story.date)} · ${escapeHtml(story.source || "")}</span>
    </div>
    <div class="message-list">
      ${visibleMessages.length ? visibleMessages.map((message) => {
        const badgeRail = renderMessageBadges([
          {
            tone: message.sender === targetId ? "core" : "observe",
            label: message.sender === targetId ? "老斌发言" : "对方判断"
          }
        ]);
        return `
        <article class="message-card ${message.sender === targetId ? "target" : ""}">
          <div class="message-meta">
            <div class="message-meta-main">
              <div class="message-sender">${escapeHtml(message.sender)}</div>
              <div class="message-time">${escapeHtml(message.time)}</div>
            </div>
            ${badgeRail}
          </div>
          ${message.reply_to ? `
            <div class="reply-quote">
              <div class="reply-quote-sender">${escapeHtml(message.reply_to.sender)}</div>
              <div class="reply-quote-content">${escapeHtml(message.reply_to.content)}</div>
            </div>
          ` : ""}
          <p class="message-content">${escapeHtml(message.content)}</p>
        </article>
      `;
      }).join("") : '<div class="empty-state">当前筛选条件下没有命中聊天。</div>'}
    </div>
  `;
}

function currentStory() {
  return state.data.stories[state.selectedIndex] || state.data.stories[0];
}

function resetTranscriptFilters() {
  state.transcriptSearch = "";
  state.roleFilter = "all";
  state.speakerFilters = new Set();
}

function getSpeakerStats(story) {
  const counts = new Map();
  for (const message of story.transcript || []) {
    counts.set(message.sender, (counts.get(message.sender) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([sender, count]) => ({ sender, count }))
    .sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender, "zh-CN"));
}

function toggleSpeakerFilter(sender) {
  if (!sender || sender === "__all__") {
    state.speakerFilters = new Set();
    return;
  }
  const next = new Set(state.speakerFilters);
  if (next.has(sender)) {
    next.delete(sender);
  } else {
    next.add(sender);
  }
  state.speakerFilters = next;
}

function getVisibleTranscriptMessages(story) {
  const targetId = state.data.metadata?.target_person?.chat_id || "";
  const query = state.transcriptSearch.trim();
  return (story.transcript || []).filter((message) => {
    const speakerOk = state.speakerFilters.size === 0 || state.speakerFilters.has(message.sender);
    const role = message.sender === targetId ? "target" : "other";
    const roleOk = state.roleFilter === "all" || state.roleFilter === role;
    const searchOk = !query
      || message.sender.includes(query)
      || message.content.includes(query)
      || message.reply_to?.sender?.includes(query)
      || message.reply_to?.content?.includes(query);
    return speakerOk && roleOk && searchOk;
  });
}

function filterSpeakerChip(value, active, label, count) {
  return `<button class="filter-chip ${active ? "active" : ""}" data-speaker-filter="${escapeAttr(value)}">${escapeHtml(label)}${typeof count === "number" ? ` · ${count}` : ""}</button>`;
}

function filterRoleChip(value, active, label) {
  return `<button class="filter-chip ${active ? "active" : ""}" data-role-filter="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function renderGlobalSearchPanel() {
  if (!el.globalSearchPanel || !Array.isArray(state.data?.stories)) {
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
          placeholder="全局搜索标题或原始聊天，例如 分手 / 富家女 / 放下"
        >
        ${state.globalSearch.trim() ? renderGlobalSearchDropdown(matches) : ""}
      </div>
      <div class="global-search-hint">
        ${state.globalSearch.trim() ? `当前关键词：<span class="global-search-keyword">${escapeHtml(state.globalSearch.trim())}</span> · ` : ""}
        输入关键词，直接跳到命中的情感条目。
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
        <button class="global-search-option" type="button" data-global-entry-index="${match.index}">
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

  return state.data.stories
    .map((story, index) => {
      const titleField = `${story.title} ${story.date} ${story.stage} ${story.status}`.toLowerCase();
      const transcriptField = (story.transcript || []).map((message) => `${message.sender} ${message.content} ${message.reply_to?.content || ""}`).join(" ");
      const haystack = `${titleField} ${transcriptField}`.toLowerCase();
      if (!haystack.includes(query)) {
        return null;
      }
      const matchedSource = titleField.includes(query) ? `${story.title} ${story.date} ${story.stage}` : transcriptField;
      return {
        index,
        kicker: `${story.date} · ${story.stage || "情感条目"}`,
        title: story.title,
        snippet: createSearchSnippet(matchedSource, state.globalSearch) || story.summary
      };
    })
    .filter(Boolean)
    .slice(0, 8);
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

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#096;");
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

function hashText(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function activateMindMap() {
  const viewport = document.querySelector("[data-mind-viewport]");
  const surface = document.querySelector("[data-mind-surface]");
  if (!viewport || !surface) return;

  const key = viewport.dataset.sessionKey;
  applyMindTransform(surface, ensureMindView(viewport));

  let activePointers = new Map();
  let lastDist = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

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
      const points = Array.from(activePointers.values());
      lastDist = Math.hypot(
        points[0].clientX - points[1].clientX,
        points[0].clientY - points[1].clientY
      );
    }
  };

  viewport.onpointermove = (event) => {
    activePointers.set(event.pointerId, event);

    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      const dist = Math.hypot(
        points[0].clientX - points[1].clientX,
        points[0].clientY - points[1].clientY
      );
      if (lastDist > 0) {
        const factor = dist / lastDist;
        const centerX = (points[0].clientX + points[1].clientX) / 2;
        const centerY = (points[0].clientY + points[1].clientY) / 2;
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
    const button = wrap?.querySelector('[data-mind-action="fullscreen"]');
    if (button) button.textContent = isFull ? "退出" : "全屏";

    window.setTimeout(() => {
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
  if (!surface) return;

  const view = ensureMindView(viewport);
  const nextScale = clamp(view.scale * factor, MIND_SCALE_MIN, MIND_SCALE_MAX);
  if (nextScale === view.scale) return;

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
  if (!surface) return;
  const key = viewport.dataset.sessionKey;
  state.mindViews[key] = fitMindView(viewport);
  applyMindTransform(surface, state.mindViews[key]);
}

function fitMindView(viewport) {
  const scale = Math.min(
    viewport.clientWidth / MIND_SURFACE.width,
    viewport.clientHeight / MIND_SURFACE.height
  ) * 0.94;
  return {
    scale,
    x: (viewport.clientWidth - MIND_SURFACE.width * scale) / 2,
    y: (viewport.clientHeight - MIND_SURFACE.height * scale) / 2
  };
}

function applyMindTransform(surface, view) {
  if (!surface || !view) return;
  surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function buildEmotionOrbit(story) {
  const centerLabel = story.stage || "情感阶段";
  const centerBody = story.status || story.date || "";
  const nodes = [
    mindNode("center", 550, 360, "情感核心", story.title, `${centerLabel} · ${centerBody}`, 0)
  ];

  const items = story.emotionMap || [];
  if (items[0]) nodes.push(mindNode("", 385, 225, items[0].kicker, items[0].title, items[0].body, 0.2));
  if (items[1]) nodes.push(mindNode("", 390, 495, items[1].kicker, items[1].title, items[1].body, 0.35));
  if (items[2]) nodes.push(mindNode("", 715, 225, items[2].kicker, items[2].title, items[2].body, 0.5));
  if (items[3]) nodes.push(mindNode("", 720, 500, items[3].kicker, items[3].title, items[3].body, 0.65));
  if (items[4]) nodes.push(mindNode("", 550, 140, items[4].kicker, items[4].title, items[4].body, 0.8));

  const edges = [
    [0, 1, "#c57c56", 3.2, 0.42],
    [0, 2, "#b79a57", 3.2, 0.42],
    [0, 3, "#70877f", 3.2, 0.42],
    [0, 4, "#9a725c", 3.2, 0.42],
    [0, 5, "#c57c56", 3.2, 0.42]
  ];

  const paths = edges
    .map(([fromIndex, toIndex, color, width, opacity]) => {
      if (nodes[fromIndex] && nodes[toIndex]) {
        return bezier(nodes[fromIndex], nodes[toIndex], color, width, opacity);
      }
      return null;
    })
    .filter(Boolean);

  return { nodes, paths };
}
