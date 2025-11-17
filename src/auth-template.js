// ==================== Authentication UI Template ====================
import { getCurrentLanguage, translatePage } from './i18n.js';

/**
 * 认证表单类型枚举
 */
export const AuthFormType = {
    LOGIN: 'login',
    REGISTER: 'register',
    VERIFY: 'verify',
    FORGOT_PASSWORD: 'forgot-password',
    RESET_PASSWORD: 'reset-password'
};

/**
 * 生成表单字段配置
 */
const FormFieldConfig = {
    email: {
        type: 'email',
        name: 'email',
        labelKey: 'emailLabel',
        placeholderKey: 'emailPlaceholder',
        autocomplete: 'username',
        required: true
    },
    username: {
        type: 'text',
        name: 'username',
        labelKey: 'usernameLabel',
        placeholderKey: 'usernamePlaceholder',
        autocomplete: 'username',
        required: false
    },
    password: {
        type: 'password',
        name: 'password',
        labelKey: 'passwordLabel',
        placeholderKey: 'passwordPlaceholder',
        autocomplete: 'current-password',
        required: true
    },
    newPassword: {
        type: 'password',
        name: 'newPassword',
        labelKey: 'newPasswordLabel',
        placeholderKey: 'newPasswordPlaceholder',
        autocomplete: 'new-password',
        required: true,
        minlength: 6
    },
    confirmPassword: {
        type: 'password',
        name: 'confirmPassword',
        labelKey: 'confirmPasswordLabel',
        placeholderKey: 'confirmPasswordPlaceholder',
        autocomplete: 'new-password',
        required: true
    },
    verificationCode: {
        type: 'text',
        name: 'verificationCode',
        labelKey: 'verificationCodeSent',
        placeholderKey: 'verificationCodePlaceholder',
        autocomplete: 'one-time-code',
        required: true,
        maxlength: 6
    }
};

/**
 * 创建表单字段HTML
 * @param {string} fieldId - 字段ID
 * @param {object} config - 字段配置
 * @returns {string} HTML字符串
 */
function createFormField(fieldId, config) {
    const attributes = [
        `type="${config.type}"`,
        `id="${fieldId}"`,
        `name="${config.name}"`,
        `data-i18n-placeholder-key="${config.placeholderKey}"`,
        `autocomplete="${config.autocomplete}"`,
        config.required ? 'required' : '',
        config.minlength ? `minlength="${config.minlength}"` : '',
        config.maxlength ? `maxlength="${config.maxlength}"` : ''
    ].filter(Boolean).join(' ');

    return `
        <div class="form-group">
            <label for="${fieldId}" data-i18n-key="${config.labelKey}">
                ${config.labelKey}
            </label>
            <input ${attributes}>
        </div>
    `;
}

/**
 * 创建按钮HTML
 * @param {string} id - 按钮ID
 * @param {string} i18nKey - 国际化键
 * @param {string} className - CSS类名
 * @param {string} type - 按钮类型
 * @returns {string} HTML字符串
 */
function createButton(id, i18nKey, className = 'auth-submit', type = 'submit') {
    return `
        <button 
            type="${type}" 
            id="${id}" 
            class="${className}" 
            data-i18n-key="${i18nKey}">
            ${i18nKey}
        </button>
    `;
}

/**
 * 登录表单模板
 */
const loginFormTemplate = `
    <form id="login-form" class="auth-form active">
        ${createFormField('login-email', FormFieldConfig.email)}
        <div class="form-group">
            <label for="login-password" data-i18n-key="passwordLabel">密码</label>
            <input 
                type="password" 
                id="login-password" 
                name="password" 
                data-i18n-placeholder-key="passwordPlaceholder" 
                autocomplete="current-password" 
                required>
            <div class="auth-form-link-wrapper">
                <button 
                    type="button" 
                    id="forgot-password-btn" 
                    class="auth-link-button"
                    data-i18n-key="forgotPassword">
                    忘记密码？
                </button>
            </div>
        </div>
        
        ${createButton('login-submit', 'loginButton')}
        
        <!-- 社交登录分隔符 -->
        <div class="social-login-divider">
            <span data-i18n-key="ui.orSignInWith">或使用以下方式登录</span>
        </div>
        
        <!-- 社交登录按钮 -->
        <div class="social-login-icons">
            <button type="button" class="social-icon-btn google-icon" id="google-login-btn" aria-label="Sign in with Google">
                <i class="fa-brands fa-google"></i>
            </button>
            <button type="button" class="social-icon-btn github-icon" id="github-login-btn" aria-label="Sign in with GitHub">
                <i class="fa-brands fa-github"></i>
            </button>
        </div>
    </form>
`;

/**
 * 注册表单模板
 */
const registerFormTemplate = `
    <form id="register-form" class="auth-form">
        ${createFormField('register-email', FormFieldConfig.email)}
        ${createFormField('register-username', FormFieldConfig.username)}
        ${createFormField('register-password', { ...FormFieldConfig.password, name: 'registerPassword', autocomplete: 'new-password', minlength: 6 })}
        ${createFormField('register-confirm-password', { ...FormFieldConfig.confirmPassword, name: 'registerConfirmPassword' })}
        ${createButton('register-submit', 'registerButton')}
    </form>
`;

/**
 * 验证码表单模板
 */
const verifyFormTemplate = `
    <form id="verify-form" class="auth-form">
        <div class="form-group">
            <label for="verify-code" data-i18n-key="verificationCodeSent">
                验证码已发送至：<span id="verify-email-display"></span>
            </label>
            <input 
                type="text" 
                id="verify-code" 
                name="verificationCode" 
                data-i18n-placeholder-key="verificationCodePlaceholder" 
                autocomplete="one-time-code" 
                required 
                maxlength="6">
            <p class="auth-form-hint" data-i18n-key="verificationCodeHint">
                验证码有效期为10分钟
            </p>
        </div>
        ${createButton('verify-submit', 'verifyAndRegisterButton')}
        ${createButton('resend-code-btn', 'resendCodeButton', 'auth-secondary-button', 'button')}
    </form>
`;

/**
 * 忘记密码表单模板
 */
const forgotPasswordFormTemplate = `
    <form id="forgot-password-form" class="auth-form">
        ${createFormField('forgot-email', { ...FormFieldConfig.email, placeholderKey: 'forgotEmailPlaceholder' })}
        ${createButton('forgot-submit', 'sendResetLinkButton')}
        ${createButton('back-to-login-btn', 'backToLoginButton', 'auth-secondary-button', 'button')}
    </form>
`;

/**
 * 重置密码表单模板
 */
const resetPasswordFormTemplate = `
    <form id="reset-password-form" class="auth-form">
        <input 
            type="text" 
            id="reset-username-autocomplete-fix" 
            name="username" 
            class="auth-autocomplete-fix" 
            autocomplete="username" 
            tabindex="-1">
        ${createFormField('new-password', FormFieldConfig.newPassword)}
        ${createFormField('confirm-new-password', { ...FormFieldConfig.confirmPassword, name: 'confirmNewPassword' })}
        ${createButton('reset-submit', 'resetPasswordButton')}
    </form>
`;

const mfaVerificationFormTemplate = `
    <form id="mfa-verification-form" class="auth-form">
        <div class="auth-form-header">
            <h3 data-i18n-key="ui.loginMfaTitle">输入动态验证码</h3>
            <p id="mfa-method-description" class="auth-form-hint" data-i18n-key="ui.loginMfaDesc">
                您的账号已启用动态验证码，请选择一种方式完成二次验证。
            </p>
        </div>
        <div class="mfa-methods" id="mfa-method-options">
            <button type="button" class="mfa-method-btn active" data-mfa-method="totp" data-i18n-key="ui.loginMfaMethodAuthenticator">
                动态验证码
            </button>
            <button type="button" class="mfa-method-btn" data-mfa-method="backup_code" data-i18n-key="ui.loginMfaMethodBackup">
                备用验证码
            </button>
        </div>
        <div class="form-group">
            <label for="mfa-verification-code-box-1" id="mfa-code-label" data-i18n-key="ui.loginMfaInputTotp">请输入 6 位验证码</label>
            <div class="security-code-inputs" data-code-target="mfa-verification-code" role="group">
                <input id="mfa-verification-code-box-1" name="mfa-code-digit-1" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 1">
                <input id="mfa-verification-code-box-2" name="mfa-code-digit-2" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 2">
                <input id="mfa-verification-code-box-3" name="mfa-code-digit-3" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 3">
                <input id="mfa-verification-code-box-4" name="mfa-code-digit-4" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 4">
                <input id="mfa-verification-code-box-5" name="mfa-code-digit-5" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 5">
                <input id="mfa-verification-code-box-6" name="mfa-code-digit-6" type="text"
                    inputmode="numeric" maxlength="1" pattern="[0-9]*" data-code-box
                    aria-label="Code digit 6">
            </div>
            <input type="hidden" id="mfa-verification-code" maxlength="6"
                autocomplete="one-time-code" required>
        </div>
        <button type="submit" class="auth-submit" id="mfa-verify-submit" data-i18n-key="ui.loginMfaSubmit">
            验证并登录
        </button>
        <button type="button" id="mfa-back-to-login" class="auth-link-button" data-i18n-key="ui.loginMfaBack">
            返回登录
        </button>
    </form>
`;

/**
 * 完整的认证覆盖层模板
 * 使用组合模式，将各个表单组合成完整的UI
 */
export const authOverlayTemplate = `
    <div id="auth-overlay" class="auth-overlay">
        <div class="auth-container">
            <!-- Logo区域 -->
            <div class="auth-logo">
                <h1 data-i18n-key="ui.appTitle">LittleAIBox</h1>
                <p data-i18n-key="ui.appSubtitle">智能AI对话助手</p>
            </div>

            <!-- Tab切换区域 -->
            <div class="auth-tabs" id="auth-tabs">
                <div class="auth-tab-indicator"></div>
                <button 
                    class="auth-tab active" 
                    data-tab="login" 
                    data-i18n-key="login">
                    登录
                </button>
                <button 
                    class="auth-tab" 
                    data-tab="register" 
                    data-i18n-key="register">
                    注册
                </button>
            </div>

            <!-- 表单容器 -->
            <div class="auth-forms-clipper">
                <div class="auth-forms-container" id="auth-forms-container">
                    ${loginFormTemplate}
                    ${registerFormTemplate}
                </div>

                ${verifyFormTemplate}
                ${forgotPasswordFormTemplate}
                ${resetPasswordFormTemplate}
                ${mfaVerificationFormTemplate}
            </div>

            <!-- 底部区域 -->
            <div class="auth-footer">
                <button 
                    type="button" 
                    id="guest-continue" 
                    class="auth-guest-button"
                    data-i18n-key="continueAsGuest">
                    以访客身份继续体验
                </button>
            </div>
        </div>
    </div>
`;

/**
 * 将认证UI注入到DOM中
 * @param {HTMLElement} targetElement - 目标元素（默认为body）
 */
export function injectAuthUI(targetElement = document.body) {
    // 检查是否已经存在认证UI
    if (document.getElementById('auth-overlay')) {
        console.warn('Auth UI already exists, skipping injection');
        return;
    }

    // 创建临时容器
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = authOverlayTemplate;

    // 提取认证覆盖层元素
    const authOverlay = tempContainer.firstElementChild;

    // 插入到目标元素的第一个子元素之前
    targetElement.insertBefore(authOverlay, targetElement.firstChild);

    const currentLang = getCurrentLanguage?.();
    if (currentLang && typeof translatePage === 'function') {
        try {
            translatePage(currentLang);
        } catch (error) {
            console.warn('Failed to translate auth UI immediately:', error);
        }
    }
}

/**
 * 移除认证UI（用于清理或重新加载）
 */
export function removeAuthUI() {
    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) {
        authOverlay.remove();
    }
}

