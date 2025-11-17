import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { completeOAuthLogin, isSupportedOAuthProvider, matchOAuthCallbackPath, parseOAuthCallbackParams, requestOAuthRedirect } from './auth-oauth.js';

const OAUTH_PENDING_STATE_KEY = 'littleaibox_pending_oauth_state';
let oauthCallbackInProgress = false;

export function getPendingOAuthState() {
    try {
        const sessionValue = sessionStorage.getItem(OAUTH_PENDING_STATE_KEY);
        if (sessionValue) {
            return sessionValue;
        }
    } catch (_) { }
    try {
        return localStorage.getItem(OAUTH_PENDING_STATE_KEY);
    } catch (_) {
        return null;
    }
}

export function setPendingOAuthState(state) {
    if (!state) return;
    try {
        sessionStorage.setItem(OAUTH_PENDING_STATE_KEY, state);
    } catch (_) { }
    try {
        localStorage.setItem(OAUTH_PENDING_STATE_KEY, state);
    } catch (_) { }
}

export function clearPendingOAuthState() {
    try {
        sessionStorage.removeItem(OAUTH_PENDING_STATE_KEY);
    } catch (_) { }
    try {
        localStorage.removeItem(OAUTH_PENDING_STATE_KEY);
    } catch (_) { }
}

export function setupOAuthButtons(context = {}) {
    const buttons = [
        { id: 'google-login-btn', provider: 'google' },
        { id: 'github-login-btn', provider: 'github' }
    ];

    buttons.forEach(({ id, provider }) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.addEventListener('click', () => handleOAuthButtonClick(provider, button, context));
    });
}

export function setupNativeOAuthDeepLinkHandler(context = {}) {
    if (!context.isNativeApp || typeof App?.addListener !== 'function') {
        return;
    }
    App.addListener('appUrlOpen', (event) => {
        const data = parseOAuthDeepLink(event?.url);
        if (!data) return;
        const provider = matchOAuthCallbackPath(data.pathname);
        if (!provider) {
            return;
        }
        handleOAuthCallbackRoute(provider, data.search, context)
            .catch(error => console.error('Failed to process OAuth deep link:', error));
    });
}

export async function handleOAuthCallbackRoute(provider, searchParams = '', context = {}) {
    const {
        showToast,
        getToastMessage,
        routeManager,
        hideAuthOverlay,
        openAuthOverlay,
        showLoadingScreen,
        hideLoadingScreen,
        applyAuthenticatedSession,
        clearPersistedAuthRoute
    } = context;

    const normalizedProvider = String(provider || '').toLowerCase();
    if (!isSupportedOAuthProvider(normalizedProvider)) {
        showToast?.(getToastMessage?.('errors.serverError'), 'error');
        routeManager?.syncAuthRoute?.('login', { replace: true });
        return;
    }
    if (oauthCallbackInProgress) {
        return;
    }

    oauthCallbackInProgress = true;
    try {
        clearPersistedAuthRoute?.();
        routeManager?.resetAuthMode?.();
        hideAuthOverlay?.(false, { routeHandled: true });
        const params = parseOAuthCallbackParams(searchParams);
        const pendingState = getPendingOAuthState();
        if (!params.state || !pendingState || params.state !== pendingState) {
            clearPendingOAuthState();
            hideLoadingScreen?.();
            routeManager?.navigateToHome?.({ replace: true });
            oauthCallbackInProgress = false;
            return;
        }
        if (params.error || !params.code || !params.state) {
            const errorMessage = params.errorDescription || params.error || getToastMessage?.('errors.serverError');
            showToast?.(errorMessage, 'error');
            routeManager?.syncAuthRoute?.('login', { replace: true });
            openAuthOverlay?.('route', { mode: 'login' }, { syncRoute: false });
            return;
        }

        const loggingInText = getToastMessage?.('toast.loggingIn');
        showLoadingScreen?.();
        showToast?.(loggingInText, 'info');
        const result = await completeOAuthLogin(normalizedProvider, { code: params.code, state: params.state });
        await applyAuthenticatedSession?.(result, { successToastKey: 'toast.loginSuccess' });
        routeManager?.navigateToHome?.({ replace: true });
        clearPendingOAuthState();
    } catch (error) {
        console.error('OAuth callback handling failed:', error);
        hideLoadingScreen?.();
        showToast?.(error.message || getToastMessage?.('errors.serverError'), 'error');
        routeManager?.syncAuthRoute?.('login', { replace: true });
        openAuthOverlay?.('route', { mode: 'login' }, { syncRoute: false });
        clearPersistedAuthRoute?.();
        routeManager?.resetAuthMode?.();
        clearPendingOAuthState();
    } finally {
        oauthCallbackInProgress = false;
    }
}

async function handleOAuthButtonClick(provider, button, context = {}) {
    const { showToast, getToastMessage, isNativeApp } = context;
    if (!isSupportedOAuthProvider(provider)) {
        showToast?.(getToastMessage?.('errors.serverError'), 'error');
        return;
    }
    if (button) {
        button.disabled = true;
        button.classList.add('loading');
    }
    try {
        const response = await requestOAuthRedirect(provider);
        if (!response?.url) {
            throw new Error(getToastMessage?.('errors.serverError'));
        }

        if (response.state) {
            setPendingOAuthState(response.state);
        }

        if (isNativeApp) {
            try {
                await Browser.open({
                    url: response.url,
                    presentationStyle: 'popover'
                });
                return;
            } catch (browserError) {
                console.warn('Failed to open OAuth URL in native browser:', browserError);
            }
        }

        window.location.href = response.url;
    } catch (error) {
        console.error('OAuth redirect request failed:', error);
        showToast?.(error.message || getToastMessage?.('errors.serverError'), 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove('loading');
        }
    }
}

function parseOAuthDeepLink(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return {
            pathname: parsed.pathname || '',
            search: parsed.search || ''
        };
    } catch (_) {
        const match = url.match(/^[^:]+:\/\/[^/]*(\/.*)$/);
        if (!match || !match[1]) {
            return null;
        }
        const pathWithQuery = match[1];
        const questionIndex = pathWithQuery.indexOf('?');
        if (questionIndex === -1) {
            return { pathname: pathWithQuery, search: '' };
        }
        return {
            pathname: pathWithQuery.slice(0, questionIndex),
            search: pathWithQuery.slice(questionIndex)
        };
    }
}
