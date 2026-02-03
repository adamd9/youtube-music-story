const mongoStorage = require('./storage/mongoStorage');
const jsonStorage = require('./storage/jsonStorage');
const { migrateJsonToMongo } = require('./storage/migration');
const { dbg } = require('../utils/logger');

let storageBackend = null;
let isInitialized = false;

/**
 * Initialize storage backend based on configuration
 * This should be called once at application startup
 */
async function initStorage() {
  if (isInitialized) {
    return;
  }
  
  const mongoUri = process.env.MONGODB_URI;
  
  if (mongoUri) {
    dbg('storage: attempting to connect to MongoDB');
    const connected = await mongoStorage.initConnection(mongoUri);
    
    if (connected) {
      console.log('storage: using MongoDB backend');
      storageBackend = mongoStorage;
      
      // Attempt migration from JSON to MongoDB
      const migrationResult = await migrateJsonToMongo();
      if (migrationResult.migratedCount > 0) {
        console.log(`storage: migrated ${migrationResult.migratedCount} playlists from JSON to MongoDB`);
      }
    } else {
      console.warn('storage: MongoDB connection failed, falling back to JSON file storage');
      storageBackend = jsonStorage;
    }
  } else {
    dbg('storage: no MongoDB URI configured, using JSON file storage');
    storageBackend = jsonStorage;
  }
  
  isInitialized = true;
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
