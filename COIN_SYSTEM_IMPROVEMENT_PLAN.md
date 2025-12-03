# Coin System Improvement Plan

## Current System Analysis
- Coins stored as single `coins` field in `studentProgress` collection
- Teacher directly modifies total coins
- Student syncs and sees toast notification
- Race condition handling (takes max of local vs cloud)
- No distinction between earned, gifted, or spent coins

## Proposed Improvements

### 1. Coin Data Structure

#### Firestore Schema (`studentProgress` collection):
```javascript
{
  coins: {
    balance: 0,              // Current spendable balance
    giftCoins: 0,           // Pending coins from teacher (requires acceptance)
    totalEarned: 0,          // Lifetime coins earned from activities
    totalSpent: 0,           // Lifetime coins spent
    totalGifted: 0           // Lifetime coins received from teacher
  },
  coinHistory: [            // Optional: Transaction log
    {
      type: 'gift' | 'earn' | 'spend' | 'accept',
      amount: 100,
      timestamp: serverTimestamp(),
      source: 'teacher' | 'activity' | 'game' | 'welcome',
      description: 'Bonus for good work'
    }
  ]
}
```

### 2. Notification System

#### Features:
- **Notification Badge**: Show count of pending `giftCoins` on a bell/notification icon
- **Notification Panel**: Click to see pending gifts with details
- **Accept Button**: One-click to accept all or individual gifts
- **Toast Notifications**: Show when coins are received/claimed
- **Visual Indicator**: Highlight coin balance when gifts are pending

#### UI Components:
```
[🪙 50] [🔔 2]  ← Notification badge shows pending gifts
     ↓ Click
┌─────────────────────────┐
│  💰 Pending Coins (2)   │
├─────────────────────────┤
│ +100 Coins from Teacher │
│   "Great work!"         │
│   [Accept]              │
├─────────────────────────┤
│ +50 Coins from Teacher  │
│   "Keep it up!"         │
│   [Accept]              │
└─────────────────────────┘
```

### 3. Teacher Side Improvements

#### Gift Coins Feature:
- **Add Gift Coins**: Instead of directly adding, add to `giftCoins`
- **Add Message**: Optional message with gift (e.g., "Great work on the quiz!")
- **Bulk Gift**: Gift coins to multiple students at once
- **Gift History**: Track all gifts given to students
- **Pending Gifts View**: See which students have unclaimed gifts

#### UI Flow:
```
Teacher Dashboard → Student Details → "Gift Coins"
  ↓
[Amount: 100] [Message: "Great work!"] [Send Gift]
  ↓
Student's giftCoins += 100
Notification appears when student logs in
```

### 4. Student Side Improvements

#### Sync & Acceptance Flow:
1. **On Login/Sync**:
   - Check if `giftCoins > 0`
   - Show notification badge
   - Display notification panel option

2. **Accept Coins**:
   - Click notification or "Accept" button
   - `balance += giftCoins`
   - `totalGifted += giftCoins`
   - `giftCoins = 0`
   - Show success toast
   - Update coin display

3. **Earning Coins**:
   - Activities/games add to `balance` and `totalEarned`
   - Show immediate feedback

4. **Spending Coins**:
   - Deduct from `balance`
   - Add to `totalSpent`
   - Show confirmation

### 5. Coin Display Enhancements

#### Current Balance Display:
```
🪙 150 Coins
```

#### Enhanced Display (with breakdown):
```
🪙 150 Coins
  └─ Available: 150
  └─ Pending: 100 🔔
  └─ Earned: 200 | Spent: 50
```

#### Or Collapsible View:
```
🪙 150 Coins [🔔 100 pending] [Details ▼]
  ↓ Click Details
  Available: 150
  Pending Gifts: 100
  Total Earned: 200
  Total Spent: 50
```

### 6. Implementation Steps

#### Phase 1: Data Structure Migration
1. Update Firestore schema to support new structure
2. Migration script for existing data:
   - `balance = coins` (current value)
   - `giftCoins = 0`
   - `totalEarned = coins` (estimate)
   - `totalSpent = 0`
   - `totalGifted = 0`

#### Phase 2: Teacher Side
1. Update `adjustStudentCoins()` to add to `giftCoins` instead
2. Add message field for gifts
3. Add bulk gift functionality
4. Add pending gifts view

#### Phase 3: Student Side
1. Add notification badge component
2. Add notification panel UI
3. Update sync logic to check `giftCoins`
4. Add accept coins functionality
5. Update coin display with breakdown

#### Phase 4: Tracking & History
1. Add `coinHistory` array (optional)
2. Log all transactions
3. Add transaction history view (optional)

### 7. Benefits

✅ **Clear Separation**: Gift coins vs earned coins
✅ **Better UX**: Students actively accept gifts (engagement)
✅ **No Race Conditions**: Gifts are separate from balance
✅ **Tracking**: See where coins come from and go
✅ **Notifications**: Students know when they receive gifts
✅ **Teacher Control**: Can add messages with gifts
✅ **Analytics**: Track earning vs spending patterns

### 8. Alternative: Simpler Version

If the full system is too complex, we can start with:
- `giftCoins` field (pending)
- `balance` field (spendable)
- Simple notification badge
- Accept all button
- Skip transaction history initially

### 9. Migration Strategy

1. **Backward Compatible**: Support both old and new structure during transition
2. **Gradual Rollout**: Update teacher side first, then student side
3. **Data Migration**: Run migration script for all existing students
4. **Fallback**: If new fields don't exist, use old `coins` field

### 10. Code Structure

```
js/student.js:
  - checkPendingGifts()      // Check for giftCoins on sync
  - acceptGiftCoins()        // Accept pending gifts
  - updateCoinDisplay()      // Show balance + pending badge
  - showNotificationPanel()  // Display pending gifts UI

js/teacher.js:
  - giftCoinsToStudent()     // Add to giftCoins instead of balance
  - bulkGiftCoins()          // Gift to multiple students
  - viewPendingGifts()       // See who has unclaimed gifts
```

## Questions to Consider

1. **Transaction History**: Do we need full history or just totals?
2. **Gift Expiration**: Should gifts expire after X days?
3. **Multiple Gifts**: Can students have multiple pending gifts with messages?
4. **Notification Style**: Badge, popup, or both?
5. **Auto-Accept**: Should small gifts auto-accept or always require click?

