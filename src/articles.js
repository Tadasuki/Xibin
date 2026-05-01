const DATA_URL = "./data/articles.json";
const POLL_INTERVAL = 20000;
const MIND_SURFACE = { width: 1100, height: 720 };
const MIND_SCALE_MIN = 0.42;
const MIND_SCALE_MAX = 2.2;
const MIND_SCALE_STEP = 1.16;

const state = {
  data: null,
  selectedIndex: 0,
  initialEntryApplied: false,
  globalSearch: "",
  globalSearchComposing: false,
  dataSignature: "",
  mobileRailOpen: false,
  mindViews: {}
};

const el = {
  loadingScreen: document.getElementById("loadingScreen"),
  mobileRailBackdrop: document.getElementById("mobileRailBackdrop"),
  previewModal: document.getElementById("previewModal"),
  previewModalViewer: document.getElementById("previewModalViewer"),
  previewDownloadLink: document.getElementById("previewDownloadLink"),
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

    const pptxAction = event.target.closest("[data-pptx-action]");
    if (pptxAction) {
      handlePptxAction(pptxAction.dataset.pptxAction);
      return;
    }

    if (event.target === el.previewModal) {
      closePreviewModal();
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
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawText = await response.text();
    const signature = rawText.length.toString();
    if (signature === state.dataSignature && options.silent) return;

    state.data = JSON.parse(rawText);
    state.dataSignature = signature;
    applyInitialEntrySelection();
    state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.data.articles.length - 1));

    el.updatedChip.textContent = `已更新 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    render();
    document.body.classList.remove("loading");
    if (el.loadingScreen) el.loadingScreen.classList.add("hidden");
  } catch (error) {
    console.error(error);
  }
}

function applyInitialEntrySelection() {
  if (state.initialEntryApplied || !Array.isArray(state.data?.articles)) {
    return;
  }
  state.initialEntryApplied = true;
  const params = new URLSearchParams(window.location?.search || "");
  const entry = Number(params.get("entry"));
  if (Number.isInteger(entry)) {
    state.selectedIndex = clamp(entry, 0, Math.max(0, state.data.articles.length - 1));
  }
}

function render() {
  if (!state.data || !state.data.articles) return;
  closePreviewModal();
  renderGlobalSearchPanel();

  el.heroMetrics.innerHTML = `
    <div class="metric-chip"><span>共计</span><strong>${state.data.articles.length} 条收录</strong></div>
    <div class="metric-chip"><span>作者</span><strong>${escapeHtml(state.data.metadata.target_person.name)}</strong></div>
  `;

  el.overview.innerHTML = `
    <article class="overview-item">
      <div class="overview-kicker">最新收录</div>
      <div class="overview-value" style="font-size:18px">${escapeHtml(state.data.articles[0]?.title || "暂无")}</div>
      <p class="overview-sub">${escapeHtml(state.data.articles[0]?.date || "")}</p>
    </article>
  `;

  el.sessionRail.innerHTML = state.data.articles.map((article, i) => `
    <button class="session-button ${state.selectedIndex === i ? "active" : ""}" data-session-index="${i}">
      <div class="session-topline">
        <div class="session-event">${escapeHtml(article.title)}</div>
        <span class="session-type" style="color:#b79a57">${escapeHtml(getArticleKindLabel(article))}</span>
      </div>
      <div class="session-date">${escapeHtml(article.date)}</div>
      <div class="session-meta" style="margin-top: 12px;">
        <span>${escapeHtml(getArticleMetric(article))}</span>
      </div>
    </button>
  `).join("");

  const article = state.data.articles[state.selectedIndex];
  if (!article) return;

  const mind = buildMindOrbit(article);

  el.focusPanel.innerHTML = `
    <section class="focus-summary">
      <div class="focus-title-row">
        <div class="focus-date">${escapeHtml(article.title)}</div>
        <button class="jump-button" type="button" data-jump-target="transcriptAnchor">${article.kind === "pptx" ? "查看预览" : "阅读正文"}</button>
      </div>
      <div class="focus-headline">
        <span class="small-pill">${escapeHtml(article.date)}</span>
        <span class="small-pill">${escapeHtml(getArticleHeadlineTag(article))}</span>
      </div>
      <div class="focus-facts article-summary">
        <article class="fact-card full-width">
          <div class="fact-kicker">核心主旨</div>
          <div class="fact-value long-text">${renderRichText(article.summary)}</div>
        </article>
      </div>
    </section>

    <div class="story-layout">
      <section class="story-panel timeline-panel">
        <h3 class="story-title">层次结构</h3>
        <div class="timeline-list">
          ${article.structure.map((item) => `
            <article class="timeline-item" style="--node-color:${item.color}">
              <div class="timeline-head">
                <div>
                  <div class="timeline-time">${escapeHtml(item.time)}</div>
                </div>
                <span class="timeline-tag" style="color:${item.color}">${escapeHtml(item.title)}</span>
              </div>
              <p>${escapeHtml(item.content)}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="story-panel">
        <h3 class="story-title">分层解析导图</h3>
        <div class="mind-wrap">
          <div class="mind-toolbar">
            <button class="mind-tool-button" type="button" data-mind-action="zoom-in">放大</button>
            <button class="mind-tool-button" type="button" data-mind-action="zoom-out">缩小</button>
            <button class="mind-tool-button" type="button" data-mind-action="reset">恢复</button>
            <button class="mind-tool-button" type="button" data-mind-action="fullscreen">全屏</button>
          </div>
          <div class="mind-viewport" data-mind-viewport data-session-key="${escapeHtml(article.date)}">
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

  renderArticleBody(article);
  activateMindMap();
}

function renderArticleBody(article) {
  if (article.kind === "pptx") {
    const asset = article.asset || {};
    el.transcriptPanel.innerHTML = `
      <div class="chat-thread">
        ${(article.transcript || []).map((message) => renderArticleMessage(message, article)).join("")}
        <div class="document-actions" style="justify-content:center; margin-top: 4px;">
          <button class="document-action" type="button" data-pptx-action="open-modal">放大预览</button>
          <a class="document-action" href="${escapeAttr(asset.file || "#")}" download="${escapeAttr(asset.downloadName || article.title)}">下载到本地</a>
        </div>
      </div>
    `;
    initPptxPreview(article, el.transcriptPanel.querySelector("[data-pptx-preview]"), "thumb");
    return;
  }

  const formattedText = escapeHtml(article.text)
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  el.transcriptPanel.innerHTML = `<div class="article-text">${formattedText}</div>`;
  closePreviewModal();
}

function renderArticleMessage(message, article) {
  const head = `
    <div class="message-meta">
      <div class="message-meta-main">
        <div class="message-sender">${escapeHtml(message.sender || "未知")}</div>
        <div class="message-time">${escapeHtml(message.time || "")}</div>
      </div>
    </div>
  `;

  if (message.type === "file") {
    const asset = article.asset || {};
    return `
      <article class="message-card">
        <div class="chat-main">
          ${head}
          <button class="chat-file-card" type="button" data-pptx-action="open-modal">
            <div class="chat-file-meta">
              <div>
                <div class="chat-file-title">${escapeHtml(message.fileLabel || asset.downloadName || article.title)}</div>
                <div class="chat-file-size">${escapeHtml(message.sizeLabel || asset.sizeLabel || "")}</div>
              </div>
              <div class="chat-file-icon">P</div>
            </div>
            <div class="document-viewer-shell thumb-shell">
              <div class="document-viewer document-viewer-thumb" data-pptx-preview data-pptx-mode="thumb"></div>
            </div>
          </button>
        </div>
      </article>
    `;
  }

  if (message.type === "reply") {
    return `
      <article class="message-card">
        <div class="chat-main">
          ${head}
          <div class="reply-quote">
            <div class="reply-quote-sender">${escapeHtml(message.quoteSender || "")}</div>
            <div class="reply-quote-content">${escapeHtml(message.quoteContent || "")}</div>
          </div>
          <p class="message-content">${escapeHtml(message.content || "")}</p>
        </div>
      </article>
    `;
  }

  return `
    <article class="message-card">
      <div class="chat-main">
        ${head}
        <p class="message-content">${escapeHtml(message.content || "")}</p>
      </div>
    </article>
  `;
}

function initPptxPreview(article, preview, mode = "full") {
  if (!preview) {
    return;
  }

  const fileUrl = getAbsoluteAssetUrl(article.asset?.file);
  const viewerUrl = getMicrosoftOfficeViewerUrl(fileUrl);
  preview.innerHTML = "";
  preview.dataset.pptxMode = mode;
  preview.dataset.pptxArticleId = article.id || article.title || "pptx";
  preview.innerHTML = `
    <iframe
      class="document-viewer-frame"
      src="${escapeAttr(viewerUrl)}"
      title="${escapeAttr(article.asset?.downloadName || article.title || "PPTX 预览")}"
      loading="${mode === "thumb" ? "lazy" : "eager"}"
      referrerpolicy="no-referrer-when-downgrade"
      allowfullscreen
    ></iframe>
  `;
}

function handlePptxAction(action) {
  const article = state.data?.articles?.[state.selectedIndex];
  if (!article || article.kind !== "pptx") {
    return;
  }

  if (action === "open-modal") {
    openPreviewModal(article);
    return;
  }

  if (action === "close-modal") {
    closePreviewModal();
  }
}

function openPreviewModal(article) {
  if (!el.previewModal || !el.previewModalViewer) {
    return;
  }
  el.previewModal.hidden = false;
  document.body.classList.add("preview-open");
  el.previewDownloadLink.href = article.asset?.file || "#";
  el.previewDownloadLink.download = article.asset?.downloadName || article.title || "document.pptx";
  initPptxPreview(article, el.previewModalViewer, "full");
}

function closePreviewModal() {
  if (!el.previewModal || el.previewModal.hidden) {
    return;
  }
  el.previewModal.hidden = true;
  document.body.classList.remove("preview-open");
  if (el.previewModalViewer) {
    el.previewModalViewer.innerHTML = "";
  }
}

function renderGlobalSearchPanel() {
  if (!el.globalSearchPanel || !state.data?.articles) {
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
          placeholder="全局搜索标题或正文，例如 远星 / 投射 / 喜欢"
        >
        ${state.globalSearch.trim() ? renderGlobalSearchDropdown(matches) : ""}
      </div>
      <div class="global-search-hint">
        ${state.globalSearch.trim() ? `当前关键词：<span class="global-search-keyword">${escapeHtml(state.globalSearch.trim())}</span> · ` : ""}
        输入关键词，直接跳到命中的文章。
      </div>
    </div>
  `;
}

function renderGlobalSearchDropdown(matches) {
  if (!matches.length) {
    return `<div class="global-search-dropdown"><div class="global-search-empty">没有命中文章，换个标题词或正文关键词试试。</div></div>`;
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

  return state.data.articles
    .map((article, index) => {
      const titleField = `${article.title} ${article.date}`.toLowerCase();
      const bodyField = `${article.summary || ""} ${article.text || ""} ${article.asset?.downloadName || ""} ${article.asset?.note || ""}`.toLowerCase();
      if (!titleField.includes(query) && !bodyField.includes(query)) {
        return null;
      }
      const matchedSource = titleField.includes(query) ? `${article.title} ${article.date}` : `${article.summary || ""} ${article.text || ""} ${article.asset?.downloadName || ""} ${article.asset?.note || ""}`;
      return {
        index,
        kicker: `${article.date} · 全斌文`,
        title: article.title,
        snippet: createSearchSnippet(matchedSource, state.globalSearch) || article.summary || article.text
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

function getArticleKindLabel(article) {
  return article.kind === "pptx" ? "文档" : "散文";
}

function getArticleMetric(article) {
  if (article.kind === "pptx") {
    return `${article.asset?.sizeLabel || "PPTX"} · 对话附件`;
  }
  return `${article.text.length} 字`;
}

function getArticleHeadlineTag(article) {
  return article.kind === "pptx" ? "文档预览" : "文章解析";
}

function getAbsoluteAssetUrl(file) {
  try {
    return new URL(file || "", window.location.href).href;
  } catch (error) {
    return file || "";
  }
}

function getMicrosoftOfficeViewerUrl(fileUrl) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

function escapeHtml(str) {
  if (!str) return "";
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

function renderRichText(text) {
  const source = String(text || "");
  const links = [];
  const html = escapeHtml(source).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const id = links.push({
      label: escapeHtml(label),
      url: escapeAttr(url)
    }) - 1;
    return `__RICH_LINK_${id}__`;
  });

  return html.replace(/__RICH_LINK_(\d+)__/g, (_, index) => {
    const link = links[Number(index)];
    if (!link) {
      return "";
    }
    return `<a href="${link.url}" style="color:var(--accent); text-decoration:underline;">${link.label}</a>`;
  });
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

function buildMindOrbit(article) {
  const nodes = [
    mindNode("center", 550, 360, "核心意象与主题", article.title, article.date, 0)
  ];

  if (article.mindMap[0]) nodes.push(mindNode("", 385, 225, article.mindMap[0].kicker, article.mindMap[0].title, article.mindMap[0].body, 0.2));
  if (article.mindMap[1]) nodes.push(mindNode("", 390, 495, article.mindMap[1].kicker, article.mindMap[1].title, article.mindMap[1].body, 0.35));
  if (article.mindMap[2]) nodes.push(mindNode("", 715, 225, article.mindMap[2].kicker, article.mindMap[2].title, article.mindMap[2].body, 0.5));
  if (article.mindMap[3]) nodes.push(mindNode("", 720, 500, article.mindMap[3].kicker, article.mindMap[3].title, article.mindMap[3].body, 0.65));
  if (article.mindMap[4]) nodes.push(mindNode("", 550, 140, article.mindMap[4].kicker, article.mindMap[4].title, article.mindMap[4].body, 0.8));

  const edges = [
    [0, 1, "#c57c56", 3.2, 0.42],
    [0, 2, "#b79a57", 3.2, 0.42],
    [0, 3, "#70877f", 3.2, 0.42],
    [0, 4, "#9a725c", 3.2, 0.42],
    [0, 5, "#c57c56", 3.2, 0.42]
  ];

  const paths = edges.map(([fromIndex, toIndex, color, width, opacity]) => {
    if (nodes[fromIndex] && nodes[toIndex]) {
      return bezier(nodes[fromIndex], nodes[toIndex], color, width, opacity);
    }
    return null;
  }).filter(Boolean);

  return { nodes, paths };
}
