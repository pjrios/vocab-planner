# Authentication & Offline Behavior Analysis

## Current Behavior

### ✅ What Works Offline:

1. **Firebase Authentication State Check**
   - `onAuthStateChanged` fires immediately with **cached auth state** (works offline)
   - Firebase Auth stores tokens locally in IndexedDB
   - Can determine if user is logged in without internet

### ❌ What Requires Internet:

1. **Role Fetching** (`fetchAndSetRole`)
   - Line 35 in `studentAuth.js`: `await this.fetchAndSetRole(user)`
   - Queries Firestore: `getDoc(doc(db, 'userRoles', user.uid))`
   - **Always requires internet connection**

2. **Cloud Progress Loading** (`loadCloudProgress`)
   - Line 49 in `studentAuth.js`: `await this.sm.loadCloudProgress()`
   - Queries Firestore for student progress
   - **Always requires internet connection**

3. **Cloud Vocabularies Loading**
   - Line 120 in `student.js`: `await this.loadCloudVocabularies()`
   - Queries Firestore for vocabularies
   - **Always requires internet connection**

## Problem

When offline:
- ✅ Firebase Auth can detect user is logged in (cached)
- ❌ But `handleFirebaseSignIn` fails because it tries to:
  - Fetch role from Firestore (fails offline)
  - Load cloud progress (fails offline)
- Result: User appears logged in but can't access features

## Solution: Improve Offline Handling

### Recommended Changes:

1. **Cache Role Locally**
   - Store role in localStorage after first fetch
   - Use cached role if offline

2. **Make Network Calls Optional**
   - Try to fetch role/progress
   - If offline, use cached data
   - Show "Offline Mode" indicator

3. **Add Network Detection**
   - Check `navigator.onLine`
   - Listen for online/offline events
   - Retry sync when back online

4. **Graceful Degradation**
   - Allow app to work with cached data
   - Queue sync operations for when online

