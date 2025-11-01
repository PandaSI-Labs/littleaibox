(() => {
  // --- 常量与状态 ---
  const STORAGE_KEY_ENABLED = 'timelineFloatEnabled';
  const STORAGE_KEY_POS = 'timelineFloatPos';
  const CHAT_SELECTOR = '#chat-container';
  const ANCHOR_SELECTOR = '.message.assistant';

  let rootEl, mainEl, upEl, downEl, container, observer, throttledScrollListener, debouncedScrollListener;
  let anchors = [];
  let isDragging = false;
  let dragStart = null;
  let expanded = false;
  let scrollInterval = null;

  // --- 工具函数 ---
  const qs = (sel, base = document) => base.querySelector(sel);
  const qsa = (sel, base = document) => Array.from(base.querySelectorAll(sel));

  function isAiBusy() {
    if (typeof window.isChatProcessing === 'function') {
      return window.isChatProcessing();
    }
    return false; 
  }

  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const throttle = (func, limit) => {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  // --- 锚点与滚动 ---
  function getScrollContainer() {
    if (!container || !document.body.contains(container)) {
      container = qs(CHAT_SELECTOR);
    }
    return container;
  }

  function measureAnchors() {
    const cont = getScrollContainer();
    if (!cont) {
      anchors = [];
      return;
    }
    const nodes = qsa(ANCHOR_SELECTOR, cont);
    anchors = nodes.map(node => ({ node, top: node.offsetTop })).sort((a, b) => a.top - b.top);
    updateButtonStates();
  }

  function updateButtonStates() {
    if (!upEl || !downEl) return;
    const cont = getScrollContainer();
    if (!cont) return;

    const st = cont.scrollTop;

    const prevAnchorExists = anchors.some(a => a.top < st - 2);
    const nextAnchorExists = anchors.some(a => a.top > st + 2);

    upEl.disabled = !prevAnchorExists;
    downEl.disabled = !nextAnchorExists;
  }

  function goPrev() {
    const cont = getScrollContainer();
    if (!cont) return;
    const st = cont.scrollTop;
    const prevAnchor = [...anchors].reverse().find(a => a.top < st - 2);
    if (prevAnchor) {
      const behavior = isAiBusy() ? 'auto' : 'smooth';
      cont.scrollTo({ top: prevAnchor.top, behavior: behavior });
    }
  }

  function goNext() {
    const cont = getScrollContainer();
    if (!cont) return;
    const st = cont.scrollTop;
    const nextAnchor = anchors.find(a => a.top > st + 2);
    if (nextAnchor) {
      const behavior = isAiBusy() ? 'auto' : 'smooth';
      cont.scrollTo({ top: nextAnchor.top, behavior: behavior });
    }
  }

  // --- UI 与交互 ---
  function toggleExpanded(force) {
    expanded = typeof force === 'boolean' ? force : !expanded;
    if (rootEl) {
      rootEl.classList.toggle('is-expanded', expanded);
      if (expanded) {
        measureAnchors();
      }
    }
  }

  function savePos() {
    if (!rootEl) return;
    try {
      const rect = rootEl.getBoundingClientRect();
      const pos = { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight };
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
    } catch (e) { console.error("保存位置失败:", e); }
  }

  function loadPos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_POS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function applyPos(pos) {
    if (!rootEl || !pos) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw <= 640;

    const floatSize = isMobile ? 48 : 56;

    const pillHeight = isMobile ? 72 : 80;
    const arrowSize = isMobile ? 40 : 44;
    const gap = 12;
    const expandedHeight = pillHeight + (arrowSize * 2) + (gap * 2);

    const currentHeight = expanded ? expandedHeight : floatSize;

    const left = Math.max(8, Math.min(vw - floatSize - 8, pos.x * vw));
    const top = Math.max(8, Math.min(vh - currentHeight - 8, pos.y * vh));


    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
  }

  // --- 拖拽与展开处理 ---
  function onMainPointerDown(e) {
    if (!mainEl.contains(e.target)) return;

    isDragging = false;
    const rect = rootEl.getBoundingClientRect();
    dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };

    mainEl.setPointerCapture(e.pointerId);
    mainEl.addEventListener('pointermove', onMainPointerMove);
    mainEl.addEventListener('pointerup', onMainPointerUp);
  }

  function onMainPointerMove(e) {
    if (dragStart === null) return;

    if (!isDragging && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 5) {
      isDragging = true;
      if (expanded) toggleExpanded(false);
      rootEl.classList.add('is-dragging');
    }

    if (isDragging) {
      rootEl.style.left = `${dragStart.left + e.clientX - dragStart.x}px`;
      rootEl.style.top = `${dragStart.top + e.clientY - dragStart.y}px`;
    }
  }

  function onMainPointerUp(e) {
    mainEl.releasePointerCapture(e.pointerId);
    mainEl.removeEventListener('pointermove', onMainPointerMove);
    mainEl.removeEventListener('pointerup', onMainPointerUp);

    if (isDragging) {
      rootEl.classList.remove('is-dragging');
      applyPos({ x: rootEl.getBoundingClientRect().left / window.innerWidth, y: rootEl.getBoundingClientRect().top / window.innerHeight });
      savePos();
    } else {
      toggleExpanded();
    }

    isDragging = false;
    dragStart = null;
  }

  // --- 箭头长按处理 ---
  function startScrolling(direction) {
    stopScrolling();
    const scrollFn = direction === 'up' ? goPrev : goNext;
    scrollFn(); 

    if (isAiBusy()) {
      return;
    }
    scrollInterval = setInterval(scrollFn, 200);
  }

  function stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }

  function addArrowListeners(arrowEl, direction) {
    arrowEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (arrowEl.disabled) return;
      startScrolling(direction);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
      arrowEl.addEventListener(evt, (e) => {
        e.stopPropagation();
        stopScrolling();
      });
    });
  }

  // --- 创建与销毁 ---
  function createUI() {
    if (rootEl) return;

    rootEl = document.createElement('div');
    rootEl.className = 'timeline-float-root';

    mainEl = document.createElement('div');
    mainEl.className = 'timeline-float-main';
    mainEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    upEl = document.createElement('button');
    upEl.type = 'button';
    upEl.className = 'timeline-arrow up';
    upEl.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>`;

    downEl = document.createElement('button');
    downEl.type = 'button';
    downEl.className = 'timeline-arrow down';
    downEl.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`;

    rootEl.append(mainEl, upEl, downEl);
    document.body.appendChild(rootEl);

    mainEl.addEventListener('pointerdown', onMainPointerDown);
    addArrowListeners(upEl, 'up');
    addArrowListeners(downEl, 'down');

    const savedPos = loadPos();
    if (savedPos) applyPos(savedPos);

    rootEl.style.display = 'block';
  }

  function destroyUI() {
    if (!rootEl) return;
    unwatch();
    stopScrolling();
    rootEl.remove();
    rootEl = mainEl = upEl = downEl = null;
  }

  function watchMutations() {
    const cont = getScrollContainer();
    if (!cont || observer) return;

    observer = new MutationObserver(debounce(measureAnchors, 250));
    observer.observe(cont, { childList: true, subtree: true, characterData: false });

    throttledScrollListener = throttle(updateButtonStates, 100);
    cont.addEventListener('scroll', throttledScrollListener);

    debouncedScrollListener = debounce(updateButtonStates, 150);
    cont.addEventListener('scroll', debouncedScrollListener);
  }

  function unwatch() {
    if (observer) observer.disconnect();
    const cont = getScrollContainer();
    if (cont) {
      if (throttledScrollListener) cont.removeEventListener('scroll', throttledScrollListener);
      if (debouncedScrollListener) cont.removeEventListener('scroll', debouncedScrollListener);
    }
    observer = throttledScrollListener = debouncedScrollListener = null;
  }

  // --- 公共 API 与初始化 ---
  function enable() {
    if (rootEl) return;
    if (!getScrollContainer()) {
      const checkExist = setInterval(() => {
        if (getScrollContainer()) { clearInterval(checkExist); enable(); }
      }, 100);
      return;
    }
    createUI();
    measureAnchors();
    watchMutations();
    try { localStorage.setItem(STORAGE_KEY_ENABLED, '1'); } catch { }
  }

  function disable() {
    destroyUI();
    try { localStorage.setItem(STORAGE_KEY_ENABLED, '0'); } catch { }
  }

  window.TimelineFloat = {
    enable,
    disable,
    isEnabled: () => !!rootEl,
    refresh: measureAnchors,
  };

  function init() {
    const toggle = qs('#timeline-floating-toggle');
    if (toggle) {
      try {
        toggle.checked = (localStorage.getItem(STORAGE_KEY_ENABLED) === '1');
      } catch { }
      toggle.addEventListener('change', () => {
        toggle.checked ? enable() : disable();
      });
    }

    try {
      if (localStorage.getItem(STORAGE_KEY_ENABLED) === '1') {
        enable();
      }
    } catch { }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

