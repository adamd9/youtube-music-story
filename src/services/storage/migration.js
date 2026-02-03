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
      return { success: false, migratedCount: 0, error: 'MongoDB not connected' };
    }
    
    // Check if there are any JSON playlists to migrate
    const hasJsonPlaylists = await jsonStorage.hasPlaylists();
    if (!hasJsonPlaylists) {
      dbg('migration: no JSON playlists found, skipping migration');
      return { success: true, migratedCount: 0 };
    }
    
    // Check if MongoDB already has playlists (idempotency check - prevents re-migration)
    const existingCount = await mongoStorage.countPlaylists();
    if (existingCount > 0) {
      console.log(`migration: MongoDB already contains ${existingCount} playlist(s), skipping migration`);
      dbg('migration: JSON files remain on disk but will not be re-migrated');
      return { success: true, migratedCount: 0 };
    }
    
    // Load all JSON playlists
    dbg('migration: loading JSON playlists for migration');
    const playlists = await jsonStorage.listAllPlaylists();
    
    if (playlists.length === 0) {
      dbg('migration: no playlists to migrate');
      return { success: true, migratedCount: 0 };
    }
    
    dbg('migration: migrating playlists to MongoDB', { count: playlists.length });
    
    // Bulk insert into MongoDB
    const migratedCount = await mongoStorage.bulkInsertPlaylists(playlists);
    
    console.log(`migration: successfully migrated ${migratedCount} playlists from JSON to MongoDB`);
    
    return { success: true, migratedCount };
  } catch (e) {
    console.error('migration: failed to migrate playlists', e);
    return { success: false, migratedCount: 0, error: e.message };
  }
}

module.exports = {
  migrateJsonToMongo,
};
