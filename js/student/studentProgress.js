/**
 * Student Progress & Coin Management Module
 * Handles progress saving/loading (local & cloud) and coin operations
 */

import { $ } from '../main.js';
import { notifications } from '../notifications.js';
import { firebaseAuthService, doc, getDoc, setDoc, serverTimestamp } from '../firebaseService.js';
import { imageDB } from '../db.js';

export class StudentProgress {
    constructor(studentManager) {
        this.sm = studentManager;
    }

    migrateCoinData(data) {
        // If already new format, return as-is
        if (data.coinData) {
            return {
                coinData: data.coinData,
                coinHistory: data.coinHistory || []
            };
        }

        // Migrate from old format
        const oldCoins = data.coins || 0;
        return {
            coinData: {
                balance: oldCoins,
                giftCoins: 0,
                totalEarned: oldCoins, // Estimate - assume all were earned
                totalSpent: 0,
                totalGifted: 0
            },
            coinHistory: []
        };
    }

    loadLocalProgress() {
        try {
            const saved = localStorage.getItem('student_progress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.sm.progressData = parsed;
                    if (this.sm.progressData.studentProfile && this.sm.progressData.studentProfile.name) {
                        this.sm.studentProfile = this.sm.progressData.studentProfile;
                    }
                    
                    // Migrate coin data
                    const migrated = this.migrateCoinData(parsed);
                    this.sm.coinData = migrated.coinData;
                    this.sm.coinHistory = migrated.coinHistory;
                    
                    // Legacy support
                    this.sm.coins = this.sm.coinData.balance;
                    this.sm.updateCoinDisplay();
                }
            }
        } catch (e) {
            console.error('Error loading progress:', e);
            // Reset if corrupt
            this.sm.progressData = { studentProfile: {}, units: {} };
            this.sm.coinData = {
                balance: 0,
                giftCoins: 0,
                totalEarned: 0,
                totalSpent: 0,
                totalGifted: 0
            };
            this.sm.coinHistory = [];
        }
    }

    saveLocalProgress(skipCloud = false) {
        try {
            this.sm.progressData.studentProfile = this.sm.studentProfile;
            // Save both old and new format for compatibility
            this.sm.coins = this.sm.coinData.balance; // Legacy support
            this.sm.progressData.coins = this.sm.coins;
            this.sm.progressData.coinData = this.sm.coinData;
            this.sm.progressData.coinHistory = this.sm.coinHistory;
            localStorage.setItem('student_progress', JSON.stringify(this.sm.progressData));
            if (!skipCloud) {
                this.sm.scheduleCloudSync();
            }
        } catch (e) {
            console.error('Error saving progress:', e);
        }
    }

    async loadCloudProgress() {
        if (!this.sm.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.sm.currentUser.uid);
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                const data = snapshot.data();

                // Migrate coin data from cloud
                const cloudCoinData = this.migrateCoinData(data);
                const cloudGiftCoins = cloudCoinData.coinData.giftCoins || 0;
                const localGiftCoins = this.sm.coinData.giftCoins || 0;

                // Merge coin data - preserve local earned/spent, but use cloud giftCoins
                // For balance: if we have recent local transactions, prefer local (more recent)
                // Otherwise, use max to prevent losing coins
                const localRecentTransactions = this.sm.coinHistory.slice(-10).some(h => 
                    h.type === 'spend' || h.type === 'earn' || h.type === 'accept'
                );
                const mergedBalance = localRecentTransactions 
                    ? this.sm.coinData.balance  // Use local if we have recent activity
                    : Math.max(this.sm.coinData.balance, cloudCoinData.coinData.balance);
                
                this.sm.coinData = {
                    balance: mergedBalance,
                    giftCoins: cloudGiftCoins, // Always use cloud giftCoins (teacher updates)
                    totalEarned: Math.max(this.sm.coinData.totalEarned, cloudCoinData.coinData.totalEarned),
                    totalSpent: Math.max(this.sm.coinData.totalSpent, cloudCoinData.coinData.totalSpent),
                    totalGifted: Math.max(this.sm.coinData.totalGifted, cloudCoinData.coinData.totalGifted)
                };

                // Check for new gifts
                if (cloudGiftCoins > localGiftCoins) {
                    const newGifts = cloudGiftCoins - localGiftCoins;
                    this.sm.showNotificationBadge();
                    // Don't auto-accept, wait for user to click accept
                }

                // Legacy support
                this.sm.coins = this.sm.coinData.balance;

                this.sm.progressData = {
                    studentProfile: data.studentProfile || this.sm.studentProfile,
                    units: data.units || {},
                    coins: this.sm.coins,
                    coinData: this.sm.coinData,
                    coinHistory: data.coinHistory || this.sm.coinHistory || []
                };
                this.sm.coinHistory = this.sm.progressData.coinHistory;
                this.sm.updateCoinDisplay();
                this.sm.studentProfile = this.sm.progressData.studentProfile || this.sm.studentProfile;
                await this.restoreImagesFromProgress();
                this.saveLocalProgress(true);

                // Sync if local balance is higher
                if (this.sm.coinData.balance > cloudCoinData.coinData.balance) {
                    await this.saveProgressToCloud();
                } else {
                    this.sm.setAuthStatus('☁️ Synced');
                }
            } else {
                // New user or no cloud data - Welcome Bonus
                if (this.sm.coinData.balance === 0) {
                    this.sm.coinData.balance = 100;
                    this.sm.coinData.totalEarned = 100;
                    this.sm.addCoinHistory('earn', 100, 'welcome', 'Welcome bonus!');
                    this.sm.coins = 100; // Legacy
                    this.sm.updateCoinDisplay();
                    this.sm.showToast('🎉 Welcome! You received 100 starting coins!');
                    this.saveLocalProgress();
                    await this.saveProgressToCloud();
                }
                this.sm.setAuthStatus('☁️ Ready');
            }
        } catch (error) {
            console.error('Failed to load cloud progress:', error);
            // Check if we're offline
            const isOffline = !navigator.onLine;
            if (isOffline) {
                this.sm.setAuthStatus('🔐 Signed in (Offline)');
                notifications.info('You are offline. Using local data. Changes will sync when online.');
            } else {
                this.sm.setAuthStatus('⚠️ Cloud load failed');
                notifications.warning('Could not load progress from cloud. Using local data.');
            }
            // Re-throw so caller knows we're offline/failed
            throw error;
        }
    }

    async saveProgressToCloud() {
        if (!this.sm.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.sm.currentUser.uid);

            // Get current cloud data first to prevent overwriting newer data
            const snapshot = await getDoc(docRef);
            let cloudCoinData = null;
            if (snapshot.exists()) {
                const data = snapshot.data();
                cloudCoinData = this.migrateCoinData(data);
            }

            // Merge coin data - preserve cloud giftCoins (teacher updates), but use local if we just accepted
            let mergedGiftCoins = cloudCoinData?.coinData.giftCoins || this.sm.coinData.giftCoins;
            if (this.sm.coinData.giftCoins === 0 && cloudCoinData?.coinData.giftCoins > 0) {
                const recentAccept = this.sm.coinHistory.slice(-5).some(h => h.type === 'accept');
                if (recentAccept) {
                    mergedGiftCoins = 0;
                }
            }
            
            // Determine which balance to use
            const recentTransactions = this.sm.coinHistory.slice(-10).some(h => 
                h.type === 'spend' || h.type === 'earn' || h.type === 'accept'
            );
            let mergedBalance;
            if (recentTransactions) {
                mergedBalance = this.sm.coinData.balance;
            } else {
                mergedBalance = Math.max(this.sm.coinData.balance, cloudCoinData?.coinData.balance || 0);
            }
            
            const mergedCoinData = {
                balance: mergedBalance,
                giftCoins: mergedGiftCoins,
                totalEarned: Math.max(this.sm.coinData.totalEarned, cloudCoinData?.coinData.totalEarned || 0),
                totalSpent: Math.max(this.sm.coinData.totalSpent, cloudCoinData?.coinData.totalSpent || 0),
                totalGifted: Math.max(this.sm.coinData.totalGifted, cloudCoinData?.coinData.totalGifted || 0)
            };

            if (cloudCoinData && cloudCoinData.coinData.balance > this.sm.coinData.balance && !recentTransactions) {
                this.sm.coinData.balance = cloudCoinData.coinData.balance;
            }

            // Merge coin history
            const mergedHistory = [...(cloudCoinData?.coinHistory || []), ...this.sm.coinHistory]
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .slice(-100);

            const payload = {
                studentProfile: this.sm.studentProfile,
                units: this.sm.progressData.units || {},
                coins: mergedCoinData.balance, // Legacy support
                coinData: mergedCoinData,
                coinHistory: mergedHistory,
                email: this.sm.currentUser?.email || this.sm.studentProfile.email || '',
                role: this.sm.currentRole || 'student',
                updatedAt: serverTimestamp()
            };
            await setDoc(docRef, payload, { merge: true });

            // Update local
            this.sm.coinData = mergedCoinData;
            this.sm.coinHistory = mergedHistory;
            this.sm.coins = this.sm.coinData.balance; // Legacy
            this.sm.updateCoinDisplay();

            this.sm.setAuthStatus('☁️ Synced');
        } catch (error) {
            console.error('Failed to save progress to cloud:', error);
            this.sm.setAuthStatus('⚠️ Cloud save failed');
        }
    }

    async restoreImagesFromProgress() {
        if (!this.sm.progressData.units) return;
        for (const [unitName, unitData] of Object.entries(this.sm.progressData.units)) {
            if (!unitData.images) continue;
            for (const [word, dataUrl] of Object.entries(unitData.images)) {
                try {
                    const blob = await this.dataURLToBlob(dataUrl);
                    await imageDB.saveDrawing(unitName, word, blob);
                } catch (error) {
                    console.error('Failed to restore image', unitName, word, error);
                }
            }
        }
    }

    dataURLToBlob(dataUrl) {
        return fetch(dataUrl).then(res => res.blob());
    }

    addCoinHistory(type, amount, source, description = '') {
        this.sm.coinHistory.push({
            type,
            amount,
            source,
            description,
            timestamp: new Date().toISOString()
        });
        // Keep only last 100 entries
        if (this.sm.coinHistory.length > 100) {
            this.sm.coinHistory = this.sm.coinHistory.slice(-100);
        }
    }

    addCoins(amount, source = 'activity', description = '') {
        this.sm.coinData.balance += amount;
        this.sm.coinData.totalEarned += amount;
        this.sm.coins = this.sm.coinData.balance; // Legacy support
        this.addCoinHistory('earn', amount, source, description);
        this.sm.updateCoinDisplay();
        this.saveLocalProgress();

        // Visual feedback
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.classList.add('pulse');
            setTimeout(() => coinEl.classList.remove('pulse'), 500);
        }
    }

    async deductCoins(amount) {
        if (this.sm.coinData.balance >= amount) {
            this.sm.coinData.balance -= amount;
            this.sm.coinData.totalSpent += amount;
            this.sm.coins = this.sm.coinData.balance; // Legacy support
            this.addCoinHistory('spend', amount, 'game', 'Spent on game');
            this.sm.updateCoinDisplay();
            this.saveLocalProgress();
            
            // Immediately save to cloud to prevent sync issues
            try {
                await this.saveProgressToCloud();
            } catch (error) {
                console.error('Error saving coin deduction to cloud:', error);
            }
            
            return true;
        }
        return false;
    }

    async acceptGiftCoins() {
        if (this.sm.coinData.giftCoins <= 0) {
            this.sm.hideNotificationBadge();
            return;
        }

        const amount = this.sm.coinData.giftCoins;
        
        // Immediately hide badge to prevent multiple clicks
        this.sm.hideNotificationBadge();
        
        // Update coin data
        this.sm.coinData.balance += amount;
        this.sm.coinData.totalGifted += amount;
        this.addCoinHistory('accept', amount, 'teacher', 'Accepted gift from teacher');
        
        // Reset giftCoins BEFORE saving
        this.sm.coinData.giftCoins = 0;
        this.sm.coins = this.sm.coinData.balance; // Legacy support
        
        // Update display immediately
        this.sm.updateCoinDisplay();
        this.sm.showToast(`🎉 You received ${amount} coins!`);
        
        // Save to cloud immediately with giftCoins = 0
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.sm.currentUser.uid);
            
            const snapshot = await getDoc(docRef);
            let existingCoinData = this.sm.coinData;
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.coinData) {
                    existingCoinData = data.coinData;
                }
            }
            
            await setDoc(docRef, {
                coinData: {
                    balance: this.sm.coinData.balance,
                    giftCoins: 0, // Explicitly set to 0
                    totalEarned: this.sm.coinData.totalEarned,
                    totalSpent: this.sm.coinData.totalSpent,
                    totalGifted: this.sm.coinData.totalGifted
                },
                coinHistory: this.sm.coinHistory.slice(-100),
                coins: this.sm.coinData.balance, // Legacy support
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            this.saveLocalProgress();
        } catch (error) {
            console.error('Error saving after accepting coins:', error);
            // If save fails, restore the gift coins so user can try again
            this.sm.coinData.giftCoins = amount;
            this.sm.coinData.balance -= amount;
            this.sm.coinData.totalGifted -= amount;
            this.sm.coins = this.sm.coinData.balance;
            this.sm.updateCoinDisplay();
            this.sm.showToast('Error saving. Please try again.', 5000);
        }
    }

    updateCoinDisplay() {
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.textContent = `🪙 ${this.sm.coinData.balance} `;
            coinEl.style.display = this.sm.currentUser ? 'flex' : 'none';
        }
        
        // Update notification badge
        if (this.sm.coinData.giftCoins > 0) {
            this.sm.showNotificationBadge();
        } else {
            this.sm.hideNotificationBadge();
        }
    }
}

