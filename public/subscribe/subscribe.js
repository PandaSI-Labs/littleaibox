import { applyLanguage, getCurrentLanguage, t } from "/shared/i18n.js";

let currentLang = "en";

const fontMap = {
    system:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    monospace: "'Fira Code', 'Source Code Pro', 'Courier New', monospace",
    cursive_kai: "'Kaiti SC', 'KaiTi', 'STKaiti', 'BiauKai', 'DFKai-SB', serif",
};

function initTheme() {
    const rawSettings =
        localStorage.getItem("userThemeSettings") ||
        localStorage.getItem("guestThemeSettings");
    let preset = localStorage.getItem("selectedTheme") || "light";
    let fontKey = null;

    if (rawSettings) {
        try {
            const parsed = JSON.parse(rawSettings);
            preset = parsed?.preset || preset;
            fontKey = parsed?.font || null;
        } catch (_) { }
    }

    document.documentElement.setAttribute("data-theme", preset);
    if (fontKey && fontMap[fontKey]) {
        document.documentElement.style.setProperty("--app-font-family", fontMap[fontKey]);
    }
}

// Open-source placeholder: pricing, subscription and checkout interactions are removed.

async function initPage() {
    // Open-source frontend mode: pricing page should be viewable without auth.
    initTheme();
    currentLang = getCurrentLanguage();
    await applyLanguage(currentLang);
    document.documentElement.setAttribute("lang", currentLang);
    const pageTitle = t(currentLang, "pricingPage.title");
    if (pageTitle && pageTitle !== "pricingPage.title") {
        document.title = pageTitle;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage);
} else {
    initPage();
}
