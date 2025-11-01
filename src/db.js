const DB_NAME = 'LittleAIBoxDB';
const DB_VERSION = 2;
const CHATS_STORE = 'chats';
const SETTINGS_STORE = 'settings';

let dbPromise;

function getDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // 创建chats对象存储
                if (!db.objectStoreNames.contains(CHATS_STORE)) {
                    db.createObjectStore(CHATS_STORE, { keyPath: 'userId' });
                }

                // 创建settings对象存储
                if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                    db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
                }
            };
        });
    }
    return dbPromise;
}

export async function getChatsFromDB(userId) {
    try {
        const db = await getDb();
        const transaction = db.transaction([CHATS_STORE], 'readonly');
        const store = transaction.objectStore(CHATS_STORE);
        const request = store.get(userId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result ? request.result.chatsData : null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        return null;
    }
}

export async function saveChatsToDB(userId, chatsData) {
    try {
        const db = await getDb();
        const transaction = db.transaction([CHATS_STORE], 'readwrite');
        const store = transaction.objectStore(CHATS_STORE);
        const request = store.put({ userId: userId, chatsData: chatsData });

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        throw error;
    }
}

export async function deleteChatsFromDB(userId) {
    try {
        const db = await getDb();
        const transaction = db.transaction([CHATS_STORE], 'readwrite');
        const store = transaction.objectStore(CHATS_STORE);
        const request = store.delete(userId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        throw error;
    }
}

// 设置备份功能
export async function saveSettingsToDB(key, settingsData) {
    try {
        const db = await getDb();

        // 检查对象存储是否存在，如果不存在则重新创建数据库
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            console.warn('Settings store not found, recreating database...');
            // 关闭当前数据库连接
            db.close();
            // 删除数据库并重新创建
            await new Promise((resolve, reject) => {
                const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                deleteRequest.onsuccess = () => resolve();
                deleteRequest.onerror = () => reject(deleteRequest.error);
            });
            // 重新获取数据库
            dbPromise = null;
            const newDb = await getDb();
            const transaction = newDb.transaction([SETTINGS_STORE], 'readwrite');
            const store = transaction.objectStore(SETTINGS_STORE);
            const request = store.put({ key: key, data: settingsData });

            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.put({ key: key, data: settingsData });

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        throw error;
    }
}

export async function getSettingsFromDB(key) {
    try {
        const db = await getDb();

        // 检查对象存储是否存在
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            console.warn('Settings store not found, returning null');
            return null;
        }

        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.get(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result ? request.result.data : null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get settings from IndexedDB:', error);
        return null;
    }
}