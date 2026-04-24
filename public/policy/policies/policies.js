const isFromAppNavigation = (() => {
    try {
        if (!document.referrer) return false;
        const referrer = new URL(document.referrer);
        return referrer.origin === window.location.origin;
    } catch (_) {
        return false;
    }
})();

const fontMap = {
    system:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    monospace: "'Fira Code', 'Source Code Pro', 'Courier New', monospace",
    cursive_kai: "'Kaiti SC', 'KaiTi', 'STKaiti', 'BiauKai', 'DFKai-SB', serif",
};
const POLICY_THEME_STORAGE_KEY = "policySelectedTheme";

function getStoredThemeSettings() {
    const raw =
        localStorage.getItem("userThemeSettings") ||
        localStorage.getItem("guestThemeSettings");
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function updateThemeIndicator(theme) {
    const indicator = document.getElementById("policy-theme-indicator");
    if (!indicator) return;
    indicator.dataset.theme = theme;
    indicator.setAttribute(
        "aria-label",
        theme === "dark" ? "Dark theme" : "Light theme"
    );
}

function setThemePreset(preset, persist) {
    document.documentElement.setAttribute("data-theme", preset);
    updateThemeIndicator(preset);

    if (!persist) return;

    try {
        localStorage.setItem(POLICY_THEME_STORAGE_KEY, preset);
    } catch (_) {
        return;
    }
}

function initThemeToggle() {
    const indicator = document.getElementById("policy-theme-indicator");
    if (!indicator) return;

    indicator.addEventListener("click", () => {
        const current =
            document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        setThemePreset(next, true);
    });
}

// 读取主题偏好并应用到页面根节点
function initTheme() {
    let preset = "light";
    let fontKey = null;
    let policyTheme = null;

    try {
        policyTheme = localStorage.getItem(POLICY_THEME_STORAGE_KEY);
    } catch (_) {
        policyTheme = null;
    }

    if (isFromAppNavigation) {
        const themeSettings = getStoredThemeSettings();
        preset =
            themeSettings?.preset || localStorage.getItem("selectedTheme") || policyTheme || "light";
        fontKey = themeSettings?.font || null;
    } else if (policyTheme) {
        preset = policyTheme;
    }

    setThemePreset(preset, false);
    if (isFromAppNavigation && fontKey && fontMap[fontKey]) {
        document.documentElement.style.setProperty(
            "--font-family",
            fontMap[fontKey]
        );
    }
}

// 语言选择器支持列表
const languageOptions = [
    { code: "zh-CN", label: "简体中文" },
    { code: "zh-TW", label: "繁體中文" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
];

const localeCache = new Map();

function normalizeLanguage(langRaw) {
    if (!langRaw) return "en";
    const val = langRaw.toLowerCase();
    if (val.startsWith("zh-tw") || val.startsWith("zh-hk")) return "zh-TW";
    if (val.startsWith("zh")) return "zh-CN";
    if (val.startsWith("ja")) return "ja";
    if (val.startsWith("ko")) return "ko";
    if (val.startsWith("fr")) return "fr";
    if (val.startsWith("es")) return "es";
    if (val.startsWith("en")) return "en";
    return "en";
}

function resolveInitialLanguage() {
    const storedLang = isFromAppNavigation
        ? localStorage.getItem("selectedLanguage")
        : null;
    const navigatorLang =
        Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages[0]
            : navigator.language;
    let currentLang = normalizeLanguage(storedLang || navigatorLang);

    if (!languageOptions.some((option) => option.code === currentLang)) {
        currentLang = "en";
    }

    return currentLang;
}

async function prefetchLocales(primaryLang) {
    const languages = new Set(["en", primaryLang].filter(Boolean));
    await Promise.all(
        Array.from(languages).map((lang) => loadLocaleData(lang))
    );
}

async function loadLocaleData(lang) {
    if (localeCache.has(lang)) {
        return localeCache.get(lang);
    }
    try {
        const response = await fetch(`/locales/${lang}.json`, {
            cache: "no-store",
        });
        if (!response.ok) return null;
        const data = await response.json();
        localeCache.set(lang, data);
        return data;
    } catch (error) {
        console.warn("Failed to load locale:", lang, error);
        return null;
    }
}

function resolveTranslation(data, key) {
    if (!data || !key) return null;
    return key.split(".").reduce((acc, part) => {
        if (!acc || typeof acc !== "object") return null;
        return acc[part];
    }, data);
}

// 根据 data-i18n-* 属性批量替换文案
async function applyTranslations(lang) {
    const data = await loadLocaleData(lang);
    if (!data) return;

    document.documentElement.setAttribute("lang", lang);

    document.querySelectorAll("[data-i18n-key]").forEach((el) => {
        const key = el.getAttribute("data-i18n-key");
        const value = resolveTranslation(data, key);
        if (typeof value === "string") {
            el.textContent = value;
        }
    });

    // Support for HTML content translation 
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
        const key = el.getAttribute("data-i18n-html");
        const value = resolveTranslation(data, key);
        if (typeof value === "string") {
            el.innerHTML = value;
        }
    });

    document.querySelectorAll("[data-i18n-placeholder-key]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder-key");
        const value = resolveTranslation(data, key);
        if (typeof value === "string") {
            el.setAttribute("placeholder", value);
        }
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const key = el.getAttribute("data-i18n-title");
        const value = resolveTranslation(data, key);
        if (typeof value === "string") {
            el.setAttribute("title", value);
        }
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
        const key = el.getAttribute("data-i18n-aria-label");
        const value = resolveTranslation(data, key);
        if (typeof value === "string") {
            el.setAttribute("aria-label", value);
        }
    });
}

// 初始化语言选择器，默认向上展开
async function initLanguageSelector() {
    const toggle = document.getElementById("policy-language-toggle");
    const menu = document.getElementById("policy-language-menu");
    const currentLabel = document.getElementById("policy-language-current");
    const wrapper = toggle ? toggle.closest(".policy-language") : null;

    if (!toggle || !menu || !currentLabel || !wrapper) return;

    const storedLang = isFromAppNavigation
        ? localStorage.getItem("selectedLanguage")
        : null;
    const navigatorLang =
        Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages[0]
            : navigator.language;
    let currentLang = normalizeLanguage(storedLang || navigatorLang);

    if (!languageOptions.some((option) => option.code === currentLang)) {
        currentLang = "en";
    }

    const updateCurrentLabel = (lang) => {
        const option = languageOptions.find((item) => item.code === lang);
        currentLabel.textContent = option ? option.label : lang;
    };

    const setOpen = (isOpen) => {
        wrapper.classList.toggle("open", isOpen);
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        menu.setAttribute("aria-hidden", isOpen ? "false" : "true");
    };

    menu.innerHTML = "";
    languageOptions.forEach((option) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "policy-language-option";
        btn.setAttribute("role", "menuitemradio");
        btn.setAttribute("data-lang", option.code);
        btn.textContent = option.label;
        btn.setAttribute(
            "aria-checked",
            option.code === currentLang ? "true" : "false"
        );
        btn.addEventListener("click", async () => {
            currentLang = option.code;
            localStorage.setItem("selectedLanguage", currentLang);
            menu.querySelectorAll(".policy-language-option").forEach((el) => {
                el.setAttribute(
                    "aria-checked",
                    el.getAttribute("data-lang") === currentLang ? "true" : "false"
                );
            });
            updateCurrentLabel(currentLang);
            setOpen(false);
            await applyTranslations(currentLang);
        });
        menu.appendChild(btn);
    });

    updateCurrentLabel(currentLang);
    await applyTranslations(currentLang);

    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setOpen(!wrapper.classList.contains("open"));
    });

    document.addEventListener("click", (event) => {
        if (!wrapper.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setOpen(false);
        }
    });
}

// 拉取各政策文件并注入到对应区域
async function loadPolicyContent() {
    const policies = [
        { id: "privacy", file: "/policy/legal/privacy-policy.html" },
        { id: "terms", file: "/policy/legal/terms-of-service.html" },
        { id: "refund", file: "/policy/legal/refund-policy.html" },
        {
            id: "subscription",
            file: "/policy/legal/subscription-and-auto-renewal.html",
        },
        { id: "pricing", file: "/policy/legal/pricing-plan.html" },
    ];

    for (const policy of policies) {
        try {
            const response = await fetch(policy.file, { cache: "no-store" });
            if (response.ok) {
                const html = await response.text();
                const contentDiv = document.getElementById(`${policy.id}-content`);
                if (contentDiv) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");

                    const policyContent = doc.querySelector(".policy-content");
                    if (policyContent) {
                        contentDiv.innerHTML = policyContent.innerHTML;
                    } else {
                        contentDiv.innerHTML = html;
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to load ${policy.id} policy:`, error);
        }
    }
}

// 处理侧边栏/移动端导航与 hash 跳转
function initNavigation() {
    const sidebarLinks = document.querySelectorAll(".sidebar-link");
    const mobilNavLinks = document.querySelectorAll(".mobile-nav-link");
    const allNavLinks = [...sidebarLinks, ...mobilNavLinks];

    const sections = document.querySelectorAll(".policy-section");

    // 切换当前显示的政策区块
    function showSection(targetId) {
        sections.forEach((section) => {
            section.classList.remove("active");
        });

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.add("active");
        }

        sidebarLinks.forEach((link) => {
            if (link.dataset.target === targetId) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });

        const contentScroller = document.querySelector(".policy-content");
        if (contentScroller) {
            contentScroller.scrollTop = 0;
            contentScroller.scrollLeft = 0;
        }
        window.scrollTo({ top: 0, behavior: "auto" });
    }

    allNavLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetId =
                link.dataset.target || link.getAttribute("href").substring(1);
            showSection(targetId);

            if (link.classList.contains("mobile-nav-link")) {
                closeMobileMenu();
            }

            history.pushState(null, "", `#${targetId}`);
        });
    });

    function handleInitialHash() {
        const hash = window.location.hash.substring(1);
        if (hash && document.getElementById(hash)) {
            showSection(hash);
        }
    }

    window.addEventListener("popstate", () => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            showSection(hash);
        } else {
            showSection("privacy");
        }
    });

    handleInitialHash();
}

// 移动端菜单开关与遮罩关闭
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");
    const mobileMenuClose = document.getElementById("mobile-menu-close");
    const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");

    if (!mobileMenuBtn || !mobileMenu) return;

    mobileMenuBtn.addEventListener("click", () => {
        mobileMenu.classList.add("active");
        document.body.style.overflow = "hidden";
    });

    function closeMobileMenuHandler() {
        mobileMenu.classList.remove("active");
        document.body.style.overflow = "";
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener("click", closeMobileMenuHandler);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener("click", closeMobileMenuHandler);
    }

    window.closeMobileMenu = closeMobileMenuHandler;
}

// 只对正文内锚点启用平滑滚动
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", function (e) {
            const href = this.getAttribute("href");
            if (href !== "#" && href.length > 1) {
                const target = document.querySelector(href);
                if (
                    target &&
                    !this.classList.contains("sidebar-link") &&
                    !this.classList.contains("mobile-nav-link")
                ) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                }
            }
        });
    });
}

function watchThemeChanges() {
    window.addEventListener("storage", (e) => {
        if (e.key === "selectedTheme" && e.newValue) {
            document.documentElement.setAttribute("data-theme", e.newValue);
            updateThemeIndicator(e.newValue);
        }
        if (
            (e.key === "userThemeSettings" || e.key === "guestThemeSettings") &&
            e.newValue &&
            isFromAppNavigation
        ) {
            try {
                const settings = JSON.parse(e.newValue);
                if (settings?.preset) {
                    document.documentElement.setAttribute("data-theme", settings.preset);
                    updateThemeIndicator(settings.preset);
                }
                if (settings?.font && fontMap[settings.font]) {
                    document.documentElement.style.setProperty(
                        "--font-family",
                        fontMap[settings.font]
                    );
                }
            } catch (_) {
                // ignore malformed theme settings
            }
        }
    });
}

function showLoadingState() {
    const sections = document.querySelectorAll(".section-content");
    sections.forEach((section) => {
        section.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 400px; flex-direction: column; gap: 1rem;">
                <div style="width: 48px; height: 48px; border: 4px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: var(--text-secondary); font-size: 0.95rem;" data-i18n-key="policyLoading">Loading content...</p>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    });
}

// 页面总入口：主题、内容、导航、语言
async function initPage() {
    initTheme();

    initThemeToggle();

    const initialLang = resolveInitialLanguage();
    await prefetchLocales(initialLang);

    showLoadingState();

    await loadPolicyContent();

    await initLanguageSelector();

    initNavigation();

    initMobileMenu();

    initSmoothScroll();

    watchThemeChanges();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage);
} else {
    initPage();
}
