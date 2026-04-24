import { isBridgeFeatureAvailable } from './config.js';
import { BRIDGE_CONNECTOR_SVG } from './feature.js';

const BRIDGE_SETTINGS_ICON = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.41 1.05.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>';
const BRIDGE_TOGGLE_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6h12v2H8v8H6V6zm4 10h8v2h-8v-2zm0-4h8v2h-8v-2z"/></svg>';
const BRIDGE_CARET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l8 7-8 7z"/></svg>';

export function resolveBridgeRenderState({ currentUser, id, currentChatId, isBridgeEnabled, getBridgeChildIds, isBridgeExpanded, setBridgeExpanded }) {
    const bridgeFeatureEnabled = isBridgeFeatureAvailable(currentUser);
    const bridgeEnabled = bridgeFeatureEnabled ? isBridgeEnabled(id) : false;
    const childIds = bridgeEnabled ? getBridgeChildIds(id) : [];
    let bridgeExpanded = isBridgeExpanded(id);
    if (bridgeEnabled && childIds.includes(currentChatId)) {
        bridgeExpanded = true;
        setBridgeExpanded(id, true);
    }
    return {
        bridgeFeatureEnabled,
        bridgeEnabled,
        childIds,
        bridgeExpanded
    };
}

export function attachBridgeVisualElements(li, { bridgeChild, bridgeEnabled, bridgeExpanded, id, currentUser, getToastMessage }) {
    if (!bridgeChild && isBridgeFeatureAvailable(currentUser)) {
        const bridgeToggle = document.createElement('button');
        bridgeToggle.type = 'button';
        bridgeToggle.className = 'bridge-toggle-btn';
        bridgeToggle.dataset.parentChatId = id;
        bridgeToggle.setAttribute('aria-label', bridgeExpanded ? getToastMessage('ui.collapseBridge') : getToastMessage('ui.expandBridge'));
        bridgeToggle.setAttribute('aria-expanded', String(bridgeExpanded));
        bridgeToggle.innerHTML = BRIDGE_CARET_ICON;
        if (bridgeEnabled && bridgeExpanded) {
            bridgeToggle.classList.add('expanded');
        }
        li.appendChild(bridgeToggle);
    }

    if (bridgeChild) {
        const connector = document.createElement('span');
        connector.className = 'bridge-connector';
        connector.innerHTML = BRIDGE_CONNECTOR_SVG;
        li.appendChild(connector);
    }
}

export function appendBridgeMenuItems(contextMenu, { chatData, id, bridgeChild, currentUser, getToastMessage, createMenuButton, shouldShowBridgeToggle, isBridgeEnabled }) {
    if (chatData?.isBridge && isBridgeFeatureAvailable(currentUser)) {
        const bridgeSettingsBtn = createMenuButton(
            'bridge-settings',
            BRIDGE_SETTINGS_ICON,
            getToastMessage('ui.bridgeSettings')
        );
        contextMenu.appendChild(bridgeSettingsBtn);
    }

    if (shouldShowBridgeToggle(id, chatData, { bridgeChild })) {
        const bridgeLabel = isBridgeEnabled(id)
            ? getToastMessage('ui.disableBridge')
            : getToastMessage('ui.enableBridge');
        const bridgeBtn = createMenuButton('toggle-bridge', BRIDGE_TOGGLE_ICON, bridgeLabel);
        contextMenu.appendChild(bridgeBtn);
    }
}
