import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DB_NAME = 'rag_local_store';
const STORE_IMAGES = 'images';
const STORE_META = 'image_meta';
const REMOTE_IMAGE_SAVE_ENDPOINT = '/api/docdata/image-save';
const REMOTE_IMAGE_GET_ENDPOINT = '/api/docdata/image-get';

const dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
            db.createObjectStore(STORE_IMAGES);
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'hash' });
        }
    }
});

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = reader.result;
        if (!result || typeof result !== 'string') {
            reject(new Error('Failed to encode image'));
            return;
        }
        resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Failed to encode image'));
    reader.readAsDataURL(blob);
});

const base64ToBlob = (base64, mime) => {
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
};

const mimeToExt = (mime) => {
    const map = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/svg+xml': 'svg'
    };
    return map[mime] || 'bin';
};

const getSessionId = () => {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
    } catch (_) {
        return null;
    }
};

const canUseRemoteStorage = () => {
    const sessionId = getSessionId();
    return typeof sessionId === 'string' && sessionId.length > 0;
};

const uploadImageToRemote = async (hash, blob, mime, chatId) => {
    if (!canUseRemoteStorage() || !hash || !blob || !chatId) return;
    try {
        const formData = new FormData();
        formData.append('hash', hash);
        formData.append('chatId', chatId);
        formData.append('mime', mime || blob.type || 'application/octet-stream');
        formData.append('file', blob, `${hash}.${mimeToExt(mime || blob.type)}`);

        const headers = {};
        const sessionId = getSessionId();
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(REMOTE_IMAGE_SAVE_ENDPOINT, {
            method: 'POST',
            headers,
            body: formData
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.warn('Remote image upload failed:', errorText);
        }
    } catch (error) {
        console.warn('Remote image upload failed:', error);
    }
};

const fetchImageFromRemote = async (hash, chatId) => {
    if (!canUseRemoteStorage() || !hash || !chatId) return null;
    try {
        const headers = {};
        const sessionId = getSessionId();
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(`${REMOTE_IMAGE_GET_ENDPOINT}?hash=${encodeURIComponent(hash)}&chatId=${encodeURIComponent(chatId)}`, {
            method: 'GET',
            headers
        });
        if (!response.ok) return null;
        const mime = response.headers.get('Content-Type') || 'application/octet-stream';
        const blob = await response.blob();
        return { blob, mime };
    } catch (error) {
        console.warn('Remote image fetch failed:', error);
        return null;
    }
};

export const LocalStore = {
    async saveImage(hash, blob, meta = {}) {
        const isNative = typeof Capacitor?.isNativePlatform === 'function'
            ? Capacitor.isNativePlatform()
            : false;
        const mime = blob?.type || meta.mime || 'application/octet-stream';
        const skipRemote = meta?.skipRemote === true;
        const chatId = meta?.chatId || null;

        if (isNative) {
            const base64 = await blobToBase64(blob);
            const ext = mimeToExt(mime);
            const fileName = `${hash}.${ext}`;
            await Filesystem.writeFile({
                path: `rag_images/${fileName}`,
                data: base64,
                directory: Directory.Data,
                recursive: true
            });
        } else {
            const db = await dbPromise;
            await db.put(STORE_IMAGES, blob, hash);
        }

        const db = await dbPromise;
        const existingMeta = await db.get(STORE_META, hash);
        const uploadedChats = Array.isArray(meta.uploadedChats)
            ? meta.uploadedChats
            : (Array.isArray(existingMeta?.uploadedChats) ? existingMeta.uploadedChats : []);
        await db.put(STORE_META, {
            hash,
            mime,
            width: meta.width || 0,
            height: meta.height || 0,
            size: blob.size || 0,
            timestamp: Date.now(),
            uploadedChats
        });
        if (!skipRemote) {
            uploadImageToRemote(hash, blob, mime, chatId);
        }
    },

    async getMeta(hash) {
        const db = await dbPromise;
        return db.get(STORE_META, hash);
    },

    async isUploadedForChat(hash, chatId) {
        if (!hash || !chatId) return false;
        const meta = await this.getMeta(hash);
        if (!meta || !Array.isArray(meta.uploadedChats)) return false;
        return meta.uploadedChats.includes(chatId);
    },

    async markUploadedForChat(hash, chatId) {
        if (!hash || !chatId) return;
        const db = await dbPromise;
        const meta = await db.get(STORE_META, hash);
        if (!meta) return;
        const uploadedChats = Array.isArray(meta.uploadedChats) ? meta.uploadedChats : [];
        if (!uploadedChats.includes(chatId)) {
            uploadedChats.push(chatId);
        }
        await db.put(STORE_META, { ...meta, uploadedChats });
    },

    async getImage(hash, chatId = null) {
        const meta = await this.getMeta(hash);
        if (!meta) {
            const remote = await fetchImageFromRemote(hash, chatId);
            if (!remote) return null;
            await this.saveImage(hash, remote.blob, { mime: remote.mime, skipRemote: true });
            return remote.blob;
        }

        const isNative = typeof Capacitor?.isNativePlatform === 'function'
            ? Capacitor.isNativePlatform()
            : false;

        if (isNative) {
            const ext = mimeToExt(meta.mime);
            const fileName = `${hash}.${ext}`;
            try {
                const result = await Filesystem.readFile({
                    path: `rag_images/${fileName}`,
                    directory: Directory.Data
                });
                return base64ToBlob(result.data, meta.mime);
            } catch (_) {
                const remote = await fetchImageFromRemote(hash, chatId);
                if (!remote) return null;
                await this.saveImage(hash, remote.blob, { mime: remote.mime, skipRemote: true });
                return remote.blob;
            }
        }

        const db = await dbPromise;
        const local = await db.get(STORE_IMAGES, hash);
        if (local) return local;
        const remote = await fetchImageFromRemote(hash, chatId);
        if (!remote) return null;
        await this.saveImage(hash, remote.blob, { mime: remote.mime, skipRemote: true });
        return remote.blob;
    },

    async hasImage(hash) {
        const meta = await this.getMeta(hash);
        return Boolean(meta);
    },

    async blobToBase64(blob) {
        return blobToBase64(blob);
    },

    async deleteImage(hash) {
        if (!hash) return;
        const meta = await this.getMeta(hash);
        const isNative = typeof Capacitor?.isNativePlatform === 'function'
            ? Capacitor.isNativePlatform()
            : false;

        if (isNative && meta?.mime) {
            const ext = mimeToExt(meta.mime);
            const fileName = `${hash}.${ext}`;
            try {
                await Filesystem.deleteFile({
                    path: `rag_images/${fileName}`,
                    directory: Directory.Data
                });
            } catch (_) {
                // Ignore missing files or deletion errors.
            }
        } else if (!isNative) {
            const db = await dbPromise;
            await db.delete(STORE_IMAGES, hash);
        }

        const db = await dbPromise;
        await db.delete(STORE_META, hash);
    },

    async deleteImages(hashes) {
        if (!Array.isArray(hashes) || hashes.length === 0) return;
        for (const hash of hashes) {
            await this.deleteImage(hash);
        }
    }
};
