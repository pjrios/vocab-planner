export class ImageDB {
    constructor() {
        this.dbName = 'VocabAppDB';
        this.storeName = 'drawings';
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveDrawing(vocabName, word, blob) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const id = `${vocabName}_${word}`;
            const record = {
                id: id,
                vocabName: vocabName,
                word: word,
                blob: blob,
                date: new Date().toISOString()
            };

            const request = store.put(record);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getDrawing(vocabName, word) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const id = `${vocabName}_${word}`;
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result ? request.result.blob : null);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllKeys() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getAll() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

export const imageDB = new ImageDB();
