let pendingMfaChallenge = null;
let selectedMfaMethod = 'totp';

const defaultDeps = {
    elements: null,
    codeInputRegistry: null,
    getToastMessage: () => '',
    showToast: () => {},
    makeAuthRequest: async () => ({}),
    applyAuthenticatedSession: async () => {},
    hideAuthOverlay: () => {},
    updateLoginButtonVisibility: () => {},
    resetCodeInputs: () => {},
    setupCodeInputGroup: () => {},
    switchToLoginForm: () => {}
};

const deps = { ...defaultDeps };

export function configureMfaLogin(options = {}) {
    Object.assign(deps, options);
}

export function clearMfaChallengeState() {
    pendingMfaChallenge = null;
    selectedMfaMethod = 'totp';
    deps.resetCodeInputs?.('mfa-verification-code');
    const { mfaCodeInput } = deps.elements || {};
    if (mfaCodeInput) {
        mfaCodeInput.value = '';
    }
}

export function setPendingMfaChallenge(challenge) {
    pendingMfaChallenge = challenge;
}

function updateMfaMethodUI(method = 'totp') {
    const { getToastMessage } = deps;
    selectedMfaMethod = method;
    const placeholderKey = method === 'backup_code'
        ? 'ui.loginMfaInputBackup'
        : 'ui.loginMfaInputTotp';
    const { mfaMethodButtons, mfaCodeInput } = deps.elements || {};
    if (mfaMethodButtons) {
        mfaMethodButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mfaMethod === method);
        });
    }
    const label = document.getElementById('mfa-code-label');
    if (label) {
        label.textContent = getToastMessage(placeholderKey);
    }
    if (mfaCodeInput) {
        mfaCodeInput.placeholder = getToastMessage(placeholderKey);
        mfaCodeInput.value = '';
    }
}

export function showMfaVerificationForm(challenge) {
    const { elements, setupCodeInputGroup, codeInputRegistry, getToastMessage } = deps;
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    if (authFormsContainer) authFormsContainer.style.display = 'none';
    if (authTabs) authTabs.style.display = 'none';
    document.querySelectorAll('.auth-form').forEach((form) => {
        form.classList.toggle('active', form.id === 'mfa-verification-form');
    });

    const availableMethods = Array.isArray(challenge?.methods) && challenge.methods.length
        ? challenge.methods
        : ['totp', 'backup_code'];
    elements?.mfaMethodButtons?.forEach((btn) => {
        const method = btn.dataset.mfaMethod;
        const available = availableMethods.includes(method);
        btn.disabled = !available;
        btn.classList.toggle('unavailable', !available);
    });
    if (!availableMethods.includes(selectedMfaMethod)) {
        selectedMfaMethod = availableMethods[0];
    }
    if (elements?.mfaDescription) {
        elements.mfaDescription.textContent = challenge?.message
            ? challenge.message
            : getToastMessage('ui.loginMfaDesc');
    }
    const codeInputGroup = elements?.mfaForm?.querySelector('[data-code-target="mfa-verification-code"]');
    if (codeInputGroup && codeInputRegistry && !codeInputRegistry.has('mfa-verification-code')) {
        setupCodeInputGroup?.(codeInputGroup);
    }
    updateMfaMethodUI(selectedMfaMethod);
    const firstBox = elements?.mfaForm?.querySelector('#mfa-verification-code-box-1');
    if (firstBox) {
        setTimeout(() => firstBox.focus(), 100);
    }
}

export function setActiveMfaMethod(method) {
    if (!pendingMfaChallenge) return;
    updateMfaMethodUI(method);
}

export function cancelMfaVerificationFlow() {
    clearMfaChallengeState();
    const authFormsContainer = document.getElementById('auth-forms-container');
    const authTabs = document.getElementById('auth-tabs');
    if (authFormsContainer) authFormsContainer.style.display = '';
    if (authTabs) authTabs.style.display = '';
    deps.switchToLoginForm?.({ syncRoute: false });
}

export async function handleMfaVerificationSubmit(event) {
    event?.preventDefault?.();
    if (!pendingMfaChallenge?.token) {
        deps.showToast?.(deps.getToastMessage?.('errors.serverError'), 'error');
        return;
    }
    const registry = deps.codeInputRegistry;
    const codeRecord = registry?.get('mfa-verification-code');
    if (codeRecord) {
        codeRecord.updateValue();
    }
    let codeValue = deps.elements?.mfaCodeInput?.value.trim() || '';
    if (!codeValue && codeRecord) {
        codeValue = codeRecord.inputs.map(input => input.value).join('').trim();
    }
    const cleanCode = codeValue.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
        deps.showToast?.(deps.getToastMessage?.('errors.verificationCodeInvalidOrExpired'), 'error');
        return;
    }
    const submitBtn = document.getElementById('mfa-verify-submit');
    if (submitBtn) submitBtn.disabled = true;
    try {
        const payload = {
            token: pendingMfaChallenge.token,
            method: selectedMfaMethod,
            code: cleanCode
        };
        const result = await deps.makeAuthRequest('mfa/verify-login', payload);
        clearMfaChallengeState();
        deps.hideAuthOverlay?.(false, { routeHandled: true, skipHandleBack: true });
        await deps.applyAuthenticatedSession(result, { successToastKey: 'toast.loginSuccess', toastRoute: null });
    } catch (error) {
        const authFormsContainer = document.getElementById('auth-forms-container');
        const authTabs = document.getElementById('auth-tabs');
        if (authFormsContainer) authFormsContainer.style.display = 'none';
        if (authTabs) authTabs.style.display = 'none';
        document.querySelectorAll('.auth-form').forEach((form) => {
            form.classList.toggle('active', form.id === 'mfa-verification-form');
        });
        deps.resetCodeInputs?.('mfa-verification-code');
        if (deps.elements?.mfaCodeInput) {
            deps.elements.mfaCodeInput.value = '';
        }
        const firstBox = deps.elements?.mfaForm?.querySelector('#mfa-verification-code-box-1');
        if (firstBox) {
            setTimeout(() => firstBox.focus(), 100);
        }
        const message = error.message || deps.getToastMessage?.('errors.verificationCodeInvalidOrExpired');
        deps.showToast?.(message, 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

export function extractMfaChallenge(result) {
    if (!result) return null;
    const requiresMfa = result.mfa_required ?? result.requiresMfa ?? result.requires_mfa ?? result.requireMfa;
    if (!requiresMfa) {
        return null;
    }
    const token = result.mfa_token || result.login_token || result.challengeId || result.pending_token;
    if (!token) {
        return null;
    }
    return {
        token,
        methods: Array.isArray(result.available_methods) ? result.available_methods : result.methods,
        message: result.mfa_message || ''
    };
}
