const mongoStorage = require('./storage/mongoStorage');
const jsonStorage = require('./storage/jsonStorage');
const { migrateJsonToMongo } = require('./storage/migration');
const { dbg } = require('../utils/logger');

let storageBackend = null;
let isInitialized = false;

/**
 * Initialize storage backend based on configuration
 * This should be called once at application startup
 * @returns {Promise<{backend: string, dbName: string|null, connected: boolean}>}
 */
async function initStorage() {
  if (isInitialized) {
    return {
      backend: storageBackend === mongoStorage ? 'MongoDB' : 'JSON',
      dbName: storageBackend === mongoStorage ? mongoStorage.getDatabaseName() : null,
      connected: storageBackend === mongoStorage ? mongoStorage.isConnected() : true
    };
  }
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('STORAGE INITIALIZATION');
  console.log('═'.repeat(70));
  
  const mongoUri = process.env.MONGODB_URI;
  let result = {
    backend: 'JSON',
    dbName: null,
    connected: false
  };
  
  if (mongoUri) {
    console.log('[STORAGE] MongoDB URI configured');
    console.log('[STORAGE] Attempting MongoDB connection...');
    
    const connected = await mongoStorage.initConnection(mongoUri);
    
    if (connected) {
      const dbName = mongoStorage.getDatabaseName();
      console.log('[STORAGE] ✓ MongoDB connection successful');
      console.log('[STORAGE] Storage backend: MongoDB');
      storageBackend = mongoStorage;
      result = { backend: 'MongoDB', dbName, connected: true };
      
      // Attempt migration from JSON to MongoDB
      console.log('[STORAGE] Checking for JSON to MongoDB migration...');
      const migrationResult = await migrateJsonToMongo();
      if (migrationResult.migratedCount > 0) {
        console.log(`[STORAGE] ✓ Migrated ${migrationResult.migratedCount} playlists from JSON to MongoDB`);
      } else if (migrationResult.success) {
        console.log('[STORAGE] No migration needed (MongoDB already has data or no JSON files)');
      } else {
        console.error('[STORAGE] ✗ Migration check failed:', migrationResult.error);
      }
    } else {
      console.warn('[STORAGE] ✗ MongoDB connection failed - falling back to JSON file storage');
      console.log('[STORAGE] Storage backend: JSON files');
      storageBackend = jsonStorage;
      result = { backend: 'JSON', dbName: null, connected: false };
    }
  } else {
    console.log('[STORAGE] No MongoDB URI configured');
    console.log('[STORAGE] Storage backend: JSON files');
    console.log('[STORAGE] Using file system storage in:', process.env.RUNTIME_DATA_DIR || './data/playlists');
    storageBackend = jsonStorage;
    result = { backend: 'JSON', dbName: null, connected: true };
  }
  
  console.log('═'.repeat(70));
  if (result.backend === 'MongoDB' && result.connected) {
    console.log('STORAGE INITIALIZED: MongoDB (Database:', result.dbName + ')');
  } else if (result.backend === 'MongoDB' && !result.connected) {
    console.log('STORAGE INITIALIZED: JSON Files (MongoDB connection failed)');
  } else {
    console.log('STORAGE INITIALIZED: JSON Files');
  }
  console.log('═'.repeat(70));
  console.log('');
  
  isInitialized = true;
  return result;
}

/**
 * Get the current storage backend
 */
function getStorageBackend() {
  if (!isInitialized) {
    // Fallback to JSON storage if not initialized
    return jsonStorage;
  }
  return storageBackend;
}

/**
 * Save a new playlist
 */
async function savePlaylist(data) {
  const backend = getStorageBackend();
  return await backend.savePlaylist(data);
}

/**
 * Get a playlist by ID
 */
async function getPlaylist(id) {
  const backend = getStorageBackend();
  return await backend.getPlaylist(id);
}

/**
 * List playlists by owner
 */
async function listPlaylistsByOwner(ownerId) {
  const backend = getStorageBackend();
  return await backend.listPlaylistsByOwner(ownerId);
}

/**
 * Update a playlist
 */
async function updatePlaylist(id, partial) {
  const backend = getStorageBackend();
  return await backend.updatePlaylist(id, partial);
}

/**
 * Close storage connections (for graceful shutdown)
 */
async function closeStorage() {
  if (storageBackend === mongoStorage) {
    await mongoStorage.closeConnection();
  }
  isInitialized = false;
  storageBackend = null;
}

module.exports = {
  initStorage,
  savePlaylist,
  getPlaylist,
  listPlaylistsByOwner,
  updatePlaylist,
  closeStorage,
};
