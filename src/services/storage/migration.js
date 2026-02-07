const jsonStorage = require('./jsonStorage');
const mongoStorage = require('./mongoStorage');
const { dbg } = require('../../utils/logger');

/**
 * Migrate playlists from JSON files to MongoDB
 * 
 * This function is idempotent - it can be called multiple times safely.
 * It will only migrate playlists once, even if JSON files remain on disk.
 * 
 * Migration occurs when ALL conditions are met:
 * 1. MongoDB is connected
 * 2. JSON playlist files exist
 * 3. MongoDB collection is empty (no playlists)
 * 
 * On subsequent startups, condition #3 fails, preventing re-migration.
 * 
 * @returns {Promise<{success: boolean, migratedCount: number, error?: string}>}
 */
async function migrateJsonToMongo() {
  try {
    // Check if MongoDB is connected
    if (!mongoStorage.isConnected()) {
      console.log('[MIGRATION] Skipping: MongoDB not connected');
      return { success: false, migratedCount: 0, error: 'MongoDB not connected' };
    }
    
    // Check if there are any JSON playlists to migrate
    const hasJsonPlaylists = await jsonStorage.hasPlaylists();
    if (!hasJsonPlaylists) {
      console.log('[MIGRATION] No JSON playlists found to migrate');
      dbg('migration: no JSON playlists found, skipping migration');
      return { success: true, migratedCount: 0 };
    }
    
    // Check if MongoDB already has playlists (idempotency check - prevents re-migration)
    const existingCount = await mongoStorage.countPlaylists();
    if (existingCount > 0) {
      console.log(`[MIGRATION] Skipping: MongoDB already contains ${existingCount} playlist(s)`);
      console.log('[MIGRATION] Note: JSON files remain on disk but will not be re-migrated');
      dbg('migration: JSON files remain on disk but will not be re-migrated');
      return { success: true, migratedCount: 0 };
    }
    
    // Load all JSON playlists
    console.log('[MIGRATION] Loading JSON playlists for migration...');
    dbg('migration: loading JSON playlists for migration');
    const playlists = await jsonStorage.listAllPlaylists();
    
    if (playlists.length === 0) {
      console.log('[MIGRATION] No playlists to migrate');
      dbg('migration: no playlists to migrate');
      return { success: true, migratedCount: 0 };
    }
    
    console.log(`[MIGRATION] Migrating ${playlists.length} playlist(s) to MongoDB...`);
    dbg('migration: migrating playlists to MongoDB', { count: playlists.length });
    
    // Bulk insert into MongoDB
    const migratedCount = await mongoStorage.bulkInsertPlaylists(playlists);
    
    console.log(`[MIGRATION] ✓ Successfully migrated ${migratedCount} playlists from JSON to MongoDB`);
    
    return { success: true, migratedCount };
  } catch (e) {
    console.error('[MIGRATION] ✗ Failed to migrate playlists');
    console.error('[MIGRATION]   - Error:', e.message);
    console.error('migration: failed to migrate playlists', e);
    return { success: false, migratedCount: 0, error: e.message };
  }
}

module.exports = {
  migrateJsonToMongo,
};
