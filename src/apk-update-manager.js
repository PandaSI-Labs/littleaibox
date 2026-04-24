export function createApkUpdateManager(deps = {}) {
    const {
        App,
        Browser,
        Capacitor,
        LocalNotifications,
        isNativeApp,
        API_BASE_URL,
        getToastMessage,
        showToast,
        showCustomConfirm,
        clearCacheAndReload
    } = deps;

    let nativeVersionSyncInFlight = null;
    const AUTO_VERSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;
    let autoVersionCheckPromise = null;
    let autoVersionCheckTimer = null;
    let appStateVersionListenerAttached = false;

    function sanitizeApkFileName(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const normalized = raw.split(/[\\/]/).pop() || '';
        return normalized;
    }

    function parseApkVersionParts(version) {
        return String(version || '')
            .split('.')
            .map(part => Number.parseInt(part, 10))
            .map(num => (Number.isFinite(num) ? num : 0));
    }

    function compareApkVersions(a, b) {
        const aParts = parseApkVersionParts(a);
        const bParts = parseApkVersionParts(b);
        const maxLength = Math.max(aParts.length, bParts.length);
        for (let i = 0; i < maxLength; i += 1) {
            const aNum = aParts[i] ?? 0;
            const bNum = bParts[i] ?? 0;
            if (aNum > bNum) return 1;
            if (aNum < bNum) return -1;
        }
        return 0;
    }

    function extractLatestApkInfoFromDownloadsHtml(html) {
        const source = String(html || '');
        const hrefRegex = /href\s*=\s*["']([^"']+\.apk)["']/gi;
        let match = null;
        let latestVersion = '';
        let latestFileName = '';
        while ((match = hrefRegex.exec(source)) !== null) {
            const rawHref = String(match[1] || '');
            const fileName = rawHref.split(/[\\/]/).pop() || '';
            const versionMatch = fileName.match(/LittleAIBox_v(\d+(?:\.\d+)*)\.apk/i);
            const candidateVersion = versionMatch?.[1] || '';
            if (!candidateVersion) continue;
            if (!latestVersion || compareApkVersions(candidateVersion, latestVersion) > 0) {
                latestVersion = candidateVersion;
                latestFileName = fileName;
            }
        }
        if (!latestVersion) {
            return null;
        }
        const fileName = latestFileName || `LittleAIBox_v${latestVersion}.apk`;
        return {
            version: latestVersion,
            fileName,
            path: `/downloads/${fileName}`
        };
    }

    async function fetchLatestApkInfo() {
        const ts = Date.now();
        const candidates = [];
        try {
            const base = API_BASE_URL || 'https://littleaibox.com';
            candidates.push(new URL(`/downloads/?t=${ts}`, base).href);
        } catch (_) { }
        candidates.push(`/downloads/?t=${ts}`);

        for (const url of candidates) {
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) continue;
                const html = await response.text();
                const parsed = extractLatestApkInfoFromDownloadsHtml(html);
                if (parsed?.version) {
                    return parsed;
                }
            } catch (_) { }
        }
        return null;
    }

    async function syncNativeAppVersionDisplay(targetElement = null) {
        if (!isNativeApp || typeof App?.getInfo !== 'function') {
            return null;
        }

        if (!nativeVersionSyncInFlight) {
            nativeVersionSyncInFlight = (async () => {
                try {
                    const info = await App.getInfo();
                    const version = info?.version || info?.build || null;
                    if (version) {
                        localStorage.setItem('apk_version', version);
                    }
                    return version;
                } catch (error) {
                    console.warn('Failed to sync native app version info:', error);
                    return null;
                }
            })();
        }

        const pendingSync = nativeVersionSyncInFlight;
        const resolvedVersion = await pendingSync;

        if (resolvedVersion) {
            const target = targetElement || document.getElementById('current-version');
            if (target) {
                target.textContent = `v${resolvedVersion}`;
            }
        }

        if (nativeVersionSyncInFlight === pendingSync) {
            nativeVersionSyncInFlight = null;
        }

        return resolvedVersion;
    }

    async function updateAboutPageUI() {
        const currentVersionEl = document.getElementById('current-version');
        if (!currentVersionEl) return;
        if (isNativeApp) {
            const syncedVersion = await syncNativeAppVersionDisplay(currentVersionEl);
            if (syncedVersion) {
                return;
            }
            const apkVersion = localStorage.getItem('apk_version');
            if (apkVersion) {
                currentVersionEl.textContent = `v${apkVersion}`;
            } else {
                try {
                    const latestApk = await fetchLatestApkInfo();
                    if (latestApk?.version) {
                        localStorage.setItem('apk_version', latestApk.version);
                        currentVersionEl.textContent = `v${latestApk.version}`;
                    } else {
                        currentVersionEl.textContent = 'v?.?.?';
                    }
                } catch (_) {
                    currentVersionEl.textContent = 'v?.?.?';
                }
            }
            return;
        }

        const savedVersion = localStorage.getItem('app_version');
        if (savedVersion) {
            currentVersionEl.textContent = `v${savedVersion}`;
            return;
        }

        try {
            const response = await fetch('/manifest.json');
            if (!response.ok) {
                currentVersionEl.textContent = 'v?.?.?';
                return;
            }
            const manifest = await response.json();
            if (manifest.version) {
                localStorage.setItem('app_version', manifest.version);
                currentVersionEl.textContent = `v${manifest.version}`;
            } else {
                currentVersionEl.textContent = 'v?.?.?';
            }
        } catch (_) {
            currentVersionEl.textContent = 'v?.?.?';
        }
    }

    function getUpdateElements() {
        const updateNowBtn = document.getElementById('update-now-btn');
        const checkBtn = document.getElementById('check-update-btn');
        const updateNotice = document.getElementById('version-update-notice');
        const updateNoticeText = document.getElementById('version-update-notice-text');

        return { updateNowBtn, checkBtn, updateNotice, updateNoticeText };
    }

    function showVersionUpdateNotification() {
        const aboutBadge = document.getElementById('about-update-badge');
        const settingsText = document.getElementById('settings-text');

        if (aboutBadge) {
            aboutBadge.style.display = 'inline-block';
        }

        if (settingsText) {
            settingsText.style.color = '#ef4444';
        }
    }

    function hideVersionUpdateNotification() {
        const settingsText = document.getElementById('settings-text');
        if (settingsText) {
            settingsText.style.color = '';
        }
    }

    function markVersionUpdateAsSeen() {
        const settingsText = document.getElementById('settings-text');
        if (settingsText) {
            settingsText.style.color = '';
        }
    }

    function showUpdateNowButton(version, apkFileName = '') {
        const { updateNowBtn, checkBtn, updateNotice, updateNoticeText } = getUpdateElements();

        if (updateNowBtn) {
            updateNowBtn.style.display = 'inline-flex';
            updateNowBtn.dataset.version = version;
            if (apkFileName) {
                updateNowBtn.dataset.apkFile = apkFileName;
            } else {
                delete updateNowBtn.dataset.apkFile;
            }
            const span = updateNowBtn.querySelector('span[data-i18n-key="version.updateNow"]');
            if (span) {
                span.textContent = getToastMessage('version.updateNow');
            }
        }

        if (checkBtn) {
            checkBtn.style.display = 'none';
        }

        if (updateNotice && updateNoticeText) {
            updateNoticeText.textContent = getToastMessage('version.newVersionAvailable', { version });
            updateNotice.style.display = 'flex';
        }
    }

    function hideUpdateNowButton() {
        const { updateNowBtn, checkBtn, updateNotice } = getUpdateElements();

        if (updateNowBtn) {
            updateNowBtn.style.display = 'none';
            delete updateNowBtn.dataset.version;
            delete updateNowBtn.dataset.apkFile;
        }

        if (checkBtn) {
            checkBtn.style.display = 'inline-flex';
        }

        if (updateNotice) {
            updateNotice.style.display = 'none';
        }
    }

    async function checkVersionUpdate(showToastIfLatest = false) {
        try {
            let serverVersion;
            let currentVersion;
            let serverApkFileName = '';

            if (isNativeApp) {
                const latestApk = await fetchLatestApkInfo();
                if (latestApk?.version) {
                    serverVersion = latestApk.version;
                    serverApkFileName = latestApk.fileName || '';
                    let localApkVersion = localStorage.getItem('apk_version');
                    if (!localApkVersion) {
                        localApkVersion = await syncNativeAppVersionDisplay(null);
                    }
                    currentVersion = localApkVersion || '';
                }
            } else {
                currentVersion = localStorage.getItem('app_version');

                const manifestResponse = await fetch('/manifest.json?t=' + Date.now(), { cache: 'no-cache' });
                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();
                    if (manifest.version) {
                        serverVersion = manifest.version;

                        if (!currentVersion) {
                            localStorage.setItem('app_version', serverVersion);
                            currentVersion = serverVersion;
                        }
                    }
                }
            }

            if (serverVersion && currentVersion && serverVersion !== currentVersion) {
                showVersionUpdateNotification();
                showUpdateNowButton(serverVersion, serverApkFileName);
                return true;
            }

            hideVersionUpdateNotification();
            hideUpdateNowButton();
            if (showToastIfLatest) {
                showToast(getToastMessage('version.alreadyLatest'), 'success');
            }
            return false;
        } catch (_) {
            hideVersionUpdateNotification();
            hideUpdateNowButton();
            return false;
        }
    }

    async function checkApkUpdate() {
        if (!isNativeApp) return;

        try {
            const latestApk = await fetchLatestApkInfo();
            if (latestApk?.version) {
                const serverApkVersion = latestApk.version;
                const apkFileName = latestApk.fileName || '';
                let localApkVersion = localStorage.getItem('apk_version');
                if (!localApkVersion) {
                    localApkVersion = await syncNativeAppVersionDisplay(null);
                }

                if (localApkVersion && serverApkVersion !== localApkVersion) {
                    showVersionUpdateNotification();
                    showUpdateNowButton(serverApkVersion, apkFileName);

                    let permission = await LocalNotifications.checkPermissions();
                    if (permission?.display !== 'granted' && LocalNotifications?.requestPermissions) {
                        permission = await LocalNotifications.requestPermissions();
                    }
                    if (permission?.display === 'granted') {
                        await LocalNotifications.schedule({
                            notifications: [{
                                title: getToastMessage('apk.updateTitle'),
                                body: getToastMessage('apk.updateMessage', { version: serverApkVersion }),
                                id: Date.now() % 2147483647,
                                schedule: { at: new Date(Date.now() + 1000) },
                                sound: null,
                                attachments: null,
                                actionTypeId: '',
                                extra: { apkVersion: serverApkVersion, apkFileName }
                            }]
                        });
                    }
                } else if (localApkVersion === serverApkVersion) {
                    hideVersionUpdateNotification();
                    hideUpdateNowButton();
                }
            }
        } catch (error) {
            console.error('Check APK update failed:', error);
        }
    }

    async function checkForUpdates() {
        const checkBtn = document.getElementById('check-update-btn');
        if (!checkBtn) return;

        const originalText = checkBtn.innerHTML;
        checkBtn.disabled = true;
        checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="margin-right: 8px; animation: spin 1s linear infinite;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg><span>${getToastMessage('version.checking')}</span>`;

        try {
            let serverVersion;
            let localVersion;
            let serverApkFileName = '';

            if (isNativeApp) {
                const latestApk = await fetchLatestApkInfo();
                if (latestApk?.version) {
                    serverVersion = latestApk.version;
                    serverApkFileName = latestApk.fileName || '';
                    localVersion = localStorage.getItem('apk_version');
                    if (!localVersion) {
                        localVersion = await syncNativeAppVersionDisplay(null);
                    }
                }
            } else {
                localVersion = localStorage.getItem('app_version');

                const manifestResponse = await fetch('/manifest.json?t=' + Date.now(), { cache: 'no-cache' });
                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();
                    if (manifest.version) {
                        serverVersion = manifest.version;

                        if (!localVersion) {
                            localStorage.setItem('app_version', serverVersion);
                            localVersion = serverVersion;
                        }
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            if (serverVersion && serverVersion !== localVersion) {
                checkBtn.innerHTML = originalText;
                checkBtn.disabled = false;

                showVersionUpdateNotification();
                showUpdateNowButton(serverVersion, serverApkFileName);
                showToast(getToastMessage('version.newVersionDetected', { version: serverVersion }), 'info');
            } else {
                checkBtn.disabled = false;
                checkBtn.innerHTML = originalText;
                hideUpdateNowButton();
                hideVersionUpdateNotification();
                showToast(getToastMessage('version.alreadyLatest'), 'success');
            }
        } catch (_) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = originalText;
            hideUpdateNowButton();
            hideVersionUpdateNotification();
            showToast(getToastMessage('version.updateFailed'), 'error');
        }
    }

    async function openApkInBrowser(urlOrPath) {
        if (!urlOrPath) return false;
        const base = API_BASE_URL || 'https://littleaibox.com';
        let absoluteUrl = urlOrPath;
        try {
            absoluteUrl = new URL(urlOrPath, base).href;
        } catch (_) { }

        if (isNativeApp) {
            try {
                const result = await App.openUrl({ url: absoluteUrl });
                if (typeof (result?.completed) === 'boolean') {
                    if (result.completed) return true;
                } else {
                    return true;
                }
            } catch (_) { }
            try {
                await Browser.open({ url: absoluteUrl });
                return true;
            } catch (_) {
                try {
                    window.open(absoluteUrl, '_blank');
                    return true;
                } catch (_) {
                    return false;
                }
            }
        }

        try {
            location.href = absoluteUrl;
            return true;
        } catch (_) {
            return false;
        }
    }

    async function downloadAndInstallApk(version, apkFileName = '') {
        const _version = version; // keep signature stable
        const _apkFileName = apkFileName;
        void _version;
        void _apkFileName;
        const apkDownloadPageUrl = '/download-app';
        showToast(getToastMessage('apk.openInBrowser'), 'info');
        const opened = await openApkInBrowser(apkDownloadPageUrl);
        if (!opened) {
            showToast(getToastMessage('apk.updateFailed'), 'error');
        }
    }

    async function performUpdate() {
        const { updateNowBtn } = getUpdateElements();
        const version = updateNowBtn?.dataset.version || 'latest';
        const apkFileName = updateNowBtn?.dataset.apkFile || '';

        if (isNativeApp) {
            await downloadAndInstallApk(version, apkFileName);
            return;
        }

        const confirmed = await showCustomConfirm(
            getToastMessage('version.updateAvailable'),
            getToastMessage('version.updateConfirmMessage', { version }),
            `<svg viewBox="0 0 24 24" style="width: 48px; height: 48px; fill: var(--primary-color);"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
            {
                manageHistory: false,
                confirmText: getToastMessage('version.updateNow'),
                cancelText: getToastMessage('version.later')
            }
        );

        if (confirmed) {
            await clearCacheAndReload?.();
        }
    }

    async function ensureNotificationPermission() {
        if (!isNativeApp) return;
        try {
            if (LocalNotifications?.checkPermissions) {
                const status = await LocalNotifications.checkPermissions();
                if (status?.display !== 'granted' && LocalNotifications?.requestPermissions) {
                    await LocalNotifications.requestPermissions();
                }
            }
        } catch (error) {
            console.warn('LocalNotifications permission check failed:', error);
        }
        try {
            if ('Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        } catch (_) { }
    }

    function handleLocalNotificationAction(notification) {
        const extra = notification?.notification?.extra || {};
        if (extra.apkVersion || extra.apkFileName) {
            openApkInBrowser('/download-app').catch(() => { });
        }
    }

    function requestAutoVersionCheck() {
        if (!autoVersionCheckPromise) {
            autoVersionCheckPromise = (isNativeApp
                ? checkApkUpdate()
                : checkVersionUpdate(false)
            ).finally(() => {
                autoVersionCheckPromise = null;
            });
        }
        return autoVersionCheckPromise;
    }

    function startAutoVersionCheckInterval() {
        if (!isNativeApp || autoVersionCheckTimer) return;
        autoVersionCheckTimer = setInterval(() => {
            if (document.hidden) return;
            requestAutoVersionCheck();
        }, AUTO_VERSION_CHECK_INTERVAL_MS);
    }

    function stopAutoVersionCheckInterval() {
        if (!autoVersionCheckTimer) return;
        clearInterval(autoVersionCheckTimer);
        autoVersionCheckTimer = null;
    }

    function setupAppStateVersionCheck() {
        if (!isNativeApp || appStateVersionListenerAttached || typeof App?.addListener !== 'function') {
            return;
        }
        appStateVersionListenerAttached = true;
        requestAutoVersionCheck();
        startAutoVersionCheckInterval();
        App.addListener('appStateChange', async (state) => {
            if (state?.isActive) {
                syncNativeAppVersionDisplay().catch(() => { });
                requestAutoVersionCheck();
                startAutoVersionCheckInterval();
            } else {
                stopAutoVersionCheckInterval();
            }
        });
    }

    return {
        sanitizeApkFileName,
        extractLatestApkInfoFromDownloadsHtml,
        fetchLatestApkInfo,
        syncNativeAppVersionDisplay,
        updateAboutPageUI,
        checkVersionUpdate,
        showVersionUpdateNotification,
        hideVersionUpdateNotification,
        markVersionUpdateAsSeen,
        checkApkUpdate,
        checkForUpdates,
        getUpdateElements,
        showUpdateNowButton,
        hideUpdateNowButton,
        performUpdate,
        downloadAndInstallApk,
        openApkInBrowser,
        ensureNotificationPermission,
        handleLocalNotificationAction,
        requestAutoVersionCheck,
        startAutoVersionCheckInterval,
        stopAutoVersionCheckInterval,
        setupAppStateVersionCheck
    };
}
