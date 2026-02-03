const { MongoClient } = require('mongodb');
const { dbg } = require('../../utils/logger');

let client = null;
let db = null;
let collection = null;

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Initialize MongoDB connection
 * @param {string} uri - MongoDB connection string
 * @returns {Promise<boolean>} - True if connection successful, false otherwise
 */
async function initConnection(uri) {
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    
    // Parse database name from URI or use default
    const dbName = extractDbName(uri) || 'youtube-music-story';
    db = client.db(dbName);
    collection = db.collection('playlists');
    
    // Create indexes
    await collection.createIndex({ ownerId: 1 });
    await collection.createIndex({ createdAt: -1 });
    await collection.createIndex({ updatedAt: -1 });
    
    dbg('mongoStorage: connected successfully', { dbName });
    return true;
  } catch (e) {
    console.error('mongoStorage: connection failed', e.message);
    // Clean up on failure
    if (client) {
      try {
        await client.close();
      } catch {}
      client = null;
      db = null;
      collection = null;
    }
    return false;
  }
}

/**
 * Extract database name from MongoDB URI
 * @param {string} uri - MongoDB connection string
 * @returns {string|null} - Database name or null
 */
function extractDbName(uri) {
  try {
    // Match database name in various MongoDB URI formats
    // mongodb://host:port/dbname
    // mongodb+srv://user:pass@host/dbname?options
    const match = uri.match(/\/([^/?]+)(?:\?|$)/);
    return match && match[1] ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if MongoDB is connected
 * @returns {boolean}
 */
function isConnected() {
  return client !== null && collection !== null;
}

/**
 * Close MongoDB connection
 */
async function closeConnection() {
  if (client) {
    try {
      await client.close();
      dbg('mongoStorage: connection closed');
    } catch (e) {
      console.error('mongoStorage: error closing connection', e);
    }
    client = null;
    db = null;
    collection = null;
  }
}

/**
 * Save a new playlist
 */
async function savePlaylist({ ownerId, title, topic, summary, timeline, source, narrationAlbumArtUrl, _debug }) {
  if (!isConnected()) {
    throw new Error('MongoDB not connected');
  }
  
  const id = genId();
  const createdAt = new Date().toISOString();
  const record = {
    id,
    ownerId,
    title,
    topic,
    summary,
    timeline,
    source: source || null,
    narrationAlbumArtUrl: narrationAlbumArtUrl || null,
    _debug: _debug || undefined,
    createdAt
  };
  
  await collection.insertOne(record);
  dbg('mongoStorage: saved playlist', { id, ownerId });
  return record;
}

/**
 * Get a playlist by ID
 */
async function getPlaylist(id) {
  if (!isConnected()) {
    throw new Error('MongoDB not connected');
  }
  
  const record = await collection.findOne({ id });
  if (!record) {
    throw new Error('Playlist not found');
  }
  
  // Remove MongoDB _id from response
  const { _id, ...playlist } = record;
  return playlist;
}

/**
 * List playlists by owner
 */
async function listPlaylistsByOwner(ownerId) {
  if (!isConnected()) {
    throw new Error('MongoDB not connected');
  }
  
  const results = await collection
    .find({ ownerId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
  
  // Remove MongoDB _id from all results
  return results.map(({ _id, ...playlist }) => playlist);
}

/**
 * Update a playlist
 */
async function updatePlaylist(id, partial) {
  if (!isConnected()) {
    throw new Error('MongoDB not connected');
  }
  
  const updatedAt = new Date().toISOString();
  const result = await collection.findOneAndUpdate(
    { id },
    { $set: { ...partial, updatedAt } },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    return null;
  }
  
  dbg('mongoStorage: updated playlist', { id });
  
  // Remove MongoDB _id from response
  const { _id, ...playlist } = result;
  return playlist;
}

/**
 * Bulk insert playlists (for migration)
 */
async function bulkInsertPlaylists(playlists) {
  if (!isConnected()) {
    throw new Error('MongoDB not connected');
  }
  
  if (!playlists || playlists.length === 0) {
    return 0;
  }
  
  const result = await collection.insertMany(playlists, { ordered: false });
  return result.insertedCount;
}

/**
 * Count playlists in collection
 */
async function countPlaylists() {
  if (!isConnected()) {
    return 0;
  }
  
  return await collection.countDocuments();
}

module.exports = {
  initConnection,
  isConnected,
  closeConnection,
  savePlaylist,
  getPlaylist,
  listPlaylistsByOwner,
  updatePlaylist,
  bulkInsertPlaylists,
  countPlaylists,
};
