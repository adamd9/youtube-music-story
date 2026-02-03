# Migration Idempotency Explained

## The Question

> "Given original disk JSON remains untouched, how does the app know not to re-migrate on next startup?"

## The Answer

The migration logic includes an **explicit idempotency check** that prevents re-migration by checking if MongoDB already contains playlists.

## Implementation

Located in `src/services/storage/migration.js`:

```javascript
async function migrateJsonToMongo() {
  // 1. Check MongoDB connection
  if (!mongoStorage.isConnected()) {
    return { success: false, migratedCount: 0 };
  }
  
  // 2. Check if JSON files exist
  const hasJsonPlaylists = await jsonStorage.hasPlaylists();
  if (!hasJsonPlaylists) {
    return { success: true, migratedCount: 0 };
  }
  
  // 3. ⚠️ IDEMPOTENCY CHECK - This prevents re-migration!
  const existingCount = await mongoStorage.countPlaylists();
  if (existingCount > 0) {
    console.log(`MongoDB already contains ${existingCount} playlists, skipping migration`);
    return { success: true, migratedCount: 0 };  // EXIT - No migration
  }
  
  // 4. Only reached if MongoDB is empty
  const playlists = await jsonStorage.listAllPlaylists();
  await mongoStorage.bulkInsertPlaylists(playlists);
}
```

## Decision Flow

```
┌─────────────────────────────────────────┐
│  Server Startup with MONGODB_URI set   │
└─────────────┬───────────────────────────┘
              │
              ▼
     ┌────────────────────┐
     │ MongoDB Connected? │
     └────────┬───────────┘
              │ Yes
              ▼
     ┌────────────────────┐
     │ JSON files exist?  │
     └────────┬───────────┘
              │ Yes
              ▼
     ┌──────────────────────────┐
     │ MongoDB count playlists  │
     └────────┬─────────────────┘
              │
         ┌────┴────┐
         │         │
      count=0   count>0
         │         │
         ▼         ▼
    ┌────────┐  ┌─────────────────┐
    │MIGRATE │  │ SKIP MIGRATION  │ ← Idempotency Check
    └────────┘  └─────────────────┘
```

## Timeline Example

### Day 1 - Initial Setup with MongoDB

**Before Migration:**
```
JSON Files:         [playlist1.json, playlist2.json]  ← 2 files
MongoDB Collection: []                                ← Empty
```

**Server Starts:**
```bash
storage: using MongoDB backend
migration: migrating playlists to MongoDB { count: 2 }
migration: successfully migrated 2 playlists from JSON to MongoDB
```

**After Migration:**
```
JSON Files:         [playlist1.json, playlist2.json]  ← Still there (untouched)
MongoDB Collection: [playlist1, playlist2]            ← 2 migrated
```

### Day 2 - Server Restart

**Before Startup:**
```
JSON Files:         [playlist1.json, playlist2.json]  ← Still there
MongoDB Collection: [playlist1, playlist2]            ← Still there
```

**Server Starts:**
```bash
storage: using MongoDB backend
migration: MongoDB already contains 2 playlist(s), skipping migration
```

**Key:** The `countPlaylists()` returns 2, which is > 0, so migration is **skipped**.

### Day 3 - After Creating New Playlist

**Before Startup:**
```
JSON Files:         [playlist1.json, playlist2.json]  ← Old files (untouched)
MongoDB Collection: [playlist1, playlist2, playlist3] ← 2 old + 1 new
```

**Server Starts:**
```bash
storage: using MongoDB backend
migration: MongoDB already contains 3 playlist(s), skipping migration
```

**Key:** MongoDB has 3 playlists (> 0), so migration is **still skipped**.

## Why JSON Files Remain

JSON files are intentionally **left on disk** after migration for several reasons:

1. **Backup**: Provides a file-based backup of the original data
2. **Rollback**: Can revert to JSON storage by removing MONGODB_URI
3. **Safety**: Avoids data loss if deletion fails
4. **Audit**: Preserves original data for verification

## Testing Idempotency

Run the test suite to verify:

```bash
# Unit test for idempotency
npm test tests/storage.test.js

# Look for: "should NOT re-migrate on second call (idempotency check)"
```

The test:
1. Creates JSON files
2. Runs migration (migrates data)
3. Runs migration again (should skip)
4. Verifies count hasn't changed

## Common Misconceptions

### ❌ Misconception 1
"JSON files trigger migration every time"

**Reality:** JSON files are checked, but the MongoDB count check happens **after**, preventing re-migration.

### ❌ Misconception 2
"Need to delete JSON files after migration"

**Reality:** JSON files can safely remain. They're ignored once MongoDB has data.

### ❌ Misconception 3
"Migration runs multiple times if server restarts"

**Reality:** Migration runs **once**. The `countPlaylists() > 0` check prevents re-runs.

## Summary

The idempotency is guaranteed by a simple but effective check:

```javascript
if (existingCount > 0) {
  return; // Skip migration
}
```

This ensures:
- ✅ Migration runs only when MongoDB is **empty**
- ✅ JSON files can remain on disk indefinitely
- ✅ No duplicate data in MongoDB
- ✅ Safe to restart server multiple times
- ✅ No special cleanup required

The presence of JSON files is **irrelevant** once MongoDB has any playlists.
