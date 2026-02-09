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
    console.log('[STORAGE] Attempting MongoDB connection...');
    console.log('[STORAGE]   - Connection timeout: 10000ms');
    console.log('[STORAGE]   - Server selection timeout: 5000ms');
    
    // Encode credentials in URI to comply with RFC 3986
    const encodedUri = encodeMongoCredentials(uri);
    
    client = new MongoClient(encodedUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    
    // Parse database name from env var, URI, or use default
    const dbName = process.env.MONGODB_DB_NAME || extractDbName(uri) || 'youtube-music-story';
    db = client.db(dbName);
    collection = db.collection('playlists');
    
    console.log('[STORAGE]   - Database name:', dbName);
    console.log('[STORAGE]   - Collection: playlists');
    
    // Create indexes
    console.log('[STORAGE]   - Creating indexes...');
    await collection.createIndex({ ownerId: 1 });
    await collection.createIndex({ createdAt: -1 });
    await collection.createIndex({ updatedAt: -1 });
    console.log('[STORAGE]   - Indexes created successfully');
    
    console.log('[STORAGE] ✓ MongoDB connection established');
    dbg('mongoStorage: connected successfully', { dbName });
    return true;
  } catch (e) {
    console.error('[STORAGE] ✗ MongoDB connection failed');
    
    // Provide detailed error information
    if (e.name === 'MongoServerSelectionError') {
      console.error('[STORAGE]   - Error type: Server selection timeout');
      console.error('[STORAGE]   - Cause: Unable to reach MongoDB server');
      console.error('[STORAGE]   - Details:', e.message);
    } else if (e.name === 'MongoAuthenticationError') {
      console.error('[STORAGE]   - Error type: Authentication failed');
      console.error('[STORAGE]   - Cause: Invalid credentials');
      console.error('[STORAGE]   - Details:', e.message);
    } else if (e.name === 'MongoNetworkError') {
      console.error('[STORAGE]   - Error type: Network error');
      console.error('[STORAGE]   - Cause: Network connection issue');
      console.error('[STORAGE]   - Details:', e.message);
    } else if (e.name === 'MongoTimeoutError') {
      console.error('[STORAGE]   - Error type: Connection timeout');
      console.error('[STORAGE]   - Cause: Server took too long to respond');
      console.error('[STORAGE]   - Details:', e.message);
    } else if (e.name === 'MongoInvalidURIError' || e.message.includes('InvalidURI')) {
      console.error('[STORAGE]   - Error type: Invalid MongoDB URI');
      console.error('[STORAGE]   - Cause: Malformed connection string or unencoded credentials');
      console.error('[STORAGE]   - Details:', e.message);
      console.error('[STORAGE]   - Hint: Special characters in username/password should be URL-encoded');
    } else {
      console.error('[STORAGE]   - Error type:', e.name || 'Unknown');
      console.error('[STORAGE]   - Details:', e.message);
    }
    
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
 * Encode MongoDB URI credentials according to RFC 3986
 * @param {string} uri - MongoDB connection string
 * @returns {string} - URI with encoded credentials
 */
function encodeMongoCredentials(uri) {
  try {
    // Pattern to match MongoDB URI with credentials
    // mongodb://username:password@host or mongodb+srv://username:password@host
    // Match everything after :// and before the last @ (which is before the host)
    const credentialPattern = /^(mongodb(?:\+srv)?:\/\/)(.+)@([^@]+)$/;
    const match = uri.match(credentialPattern);
    
    if (match) {
      const [, protocol, credentialsPart, hostPart] = match;
      
      // Split credentials by the first colon
      const colonIndex = credentialsPart.indexOf(':');
      if (colonIndex === -1) {
        // No password, just username
        const encodedUsername = encodeURIComponent(credentialsPart);
        return `${protocol}${encodedUsername}@${hostPart}`;
      }
      
      const username = credentialsPart.substring(0, colonIndex);
      const password = credentialsPart.substring(colonIndex + 1);
      
      // Encode username and password according to RFC 3986
      const encodedUsername = encodeURIComponent(username);
      const encodedPassword = encodeURIComponent(password);
      return `${protocol}${encodedUsername}:${encodedPassword}@${hostPart}`;
    }
    
    // No credentials in URI, return as-is
    return uri;
  } catch (e) {
    console.warn('[STORAGE] Failed to encode MongoDB credentials, using URI as-is:', e.message);
    return uri;
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
