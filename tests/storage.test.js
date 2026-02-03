const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fsp = require('node:fs/promises');

// Setup test environment
const runtimeDir = path.join(__dirname, '..', 'data', 'test-storage');
process.env.RUNTIME_DATA_DIR = runtimeDir;
process.env.OPENAI_API_KEY = 'test-key';

// Import storage modules
const mongoStorage = require('../src/services/storage/mongoStorage');
const jsonStorage = require('../src/services/storage/jsonStorage');
const { migrateJsonToMongo } = require('../src/services/storage/migration');
const storage = require('../src/services/storage');

describe('JSON Storage', () => {
  after(async () => {
    // Clean up test data
    await fsp.rm(runtimeDir, { recursive: true, force: true });
  });

  test('should save and retrieve playlist', async () => {
    const playlist = {
      ownerId: 'user1',
      title: 'Test Playlist',
      topic: 'Test Topic',
      summary: 'Test Summary',
      timeline: [{ type: 'song', title: 'Song 1' }],
      source: 'youtube',
    };

    const saved = await jsonStorage.savePlaylist(playlist);
    assert.ok(saved.id, 'Playlist should have an ID');
    assert.strictEqual(saved.title, playlist.title);
    assert.ok(saved.createdAt, 'Playlist should have createdAt timestamp');

    const retrieved = await jsonStorage.getPlaylist(saved.id);
    assert.strictEqual(retrieved.id, saved.id);
    assert.strictEqual(retrieved.title, playlist.title);
  });

  test('should list playlists by owner', async () => {
    const playlist1 = await jsonStorage.savePlaylist({
      ownerId: 'user2',
      title: 'Playlist 1',
      topic: 'Topic 1',
      summary: 'Summary 1',
      timeline: [],
    });

    const playlist2 = await jsonStorage.savePlaylist({
      ownerId: 'user2',
      title: 'Playlist 2',
      topic: 'Topic 2',
      summary: 'Summary 2',
      timeline: [],
    });

    const playlists = await jsonStorage.listPlaylistsByOwner('user2');
    assert.ok(playlists.length >= 2, 'Should have at least 2 playlists');
    assert.ok(playlists.some(p => p.id === playlist1.id));
    assert.ok(playlists.some(p => p.id === playlist2.id));
  });

  test('should update playlist', async () => {
    const playlist = await jsonStorage.savePlaylist({
      ownerId: 'user3',
      title: 'Original Title',
      topic: 'Topic',
      summary: 'Summary',
      timeline: [],
    });

    const updated = await jsonStorage.updatePlaylist(playlist.id, {
      title: 'Updated Title',
    });

    assert.strictEqual(updated.title, 'Updated Title');
    assert.ok(updated.updatedAt, 'Should have updatedAt timestamp');
  });

  test('should check if playlists exist', async () => {
    const hasPlaylists = await jsonStorage.hasPlaylists();
    assert.strictEqual(hasPlaylists, true, 'Should detect existing playlists');
  });

  test('should list all playlists', async () => {
    const allPlaylists = await jsonStorage.listAllPlaylists();
    assert.ok(allPlaylists.length > 0, 'Should have playlists');
    assert.ok(allPlaylists[0].id, 'Playlists should have IDs');
  });
});

describe('MongoDB Storage (with mock)', () => {
  // Note: These tests require a MongoDB instance. They will be skipped if no connection is available.
  // To run with a real MongoDB: Set MONGODB_URI_TEST environment variable
  const testMongoUri = process.env.MONGODB_URI_TEST;

  if (!testMongoUri) {
    test('MongoDB tests skipped (no MONGODB_URI_TEST env var)', () => {
      console.log('Set MONGODB_URI_TEST to run MongoDB integration tests');
      assert.ok(true);
    });
    return;
  }

  before(async () => {
    const connected = await mongoStorage.initConnection(testMongoUri);
    assert.strictEqual(connected, true, 'Should connect to MongoDB');
  });

  after(async () => {
    await mongoStorage.closeConnection();
  });

  test('should save and retrieve playlist', async () => {
    const playlist = {
      ownerId: 'mongo-user1',
      title: 'MongoDB Test Playlist',
      topic: 'Test Topic',
      summary: 'Test Summary',
      timeline: [{ type: 'song', title: 'Song 1' }],
    };

    const saved = await mongoStorage.savePlaylist(playlist);
    assert.ok(saved.id, 'Playlist should have an ID');
    assert.strictEqual(saved.title, playlist.title);

    const retrieved = await mongoStorage.getPlaylist(saved.id);
    assert.strictEqual(retrieved.id, saved.id);
    assert.strictEqual(retrieved.title, playlist.title);
    assert.strictEqual(retrieved._id, undefined, 'Should not return MongoDB _id');
  });

  test('should list playlists by owner', async () => {
    const playlist1 = await mongoStorage.savePlaylist({
      ownerId: 'mongo-user2',
      title: 'Playlist 1',
      topic: 'Topic 1',
      summary: 'Summary 1',
      timeline: [],
    });

    const playlist2 = await mongoStorage.savePlaylist({
      ownerId: 'mongo-user2',
      title: 'Playlist 2',
      topic: 'Topic 2',
      summary: 'Summary 2',
      timeline: [],
    });

    const playlists = await mongoStorage.listPlaylistsByOwner('mongo-user2');
    assert.ok(playlists.length >= 2);
    assert.ok(playlists.some(p => p.id === playlist1.id));
    assert.ok(playlists.some(p => p.id === playlist2.id));
    assert.strictEqual(playlists[0]._id, undefined, 'Should not return MongoDB _id');
  });

  test('should update playlist', async () => {
    const playlist = await mongoStorage.savePlaylist({
      ownerId: 'mongo-user3',
      title: 'Original Title',
      topic: 'Topic',
      summary: 'Summary',
      timeline: [],
    });

    const updated = await mongoStorage.updatePlaylist(playlist.id, {
      title: 'Updated Title',
    });

    assert.strictEqual(updated.title, 'Updated Title');
    assert.ok(updated.updatedAt, 'Should have updatedAt timestamp');
    assert.strictEqual(updated._id, undefined, 'Should not return MongoDB _id');
  });
});

describe('Storage Integration', () => {
  after(async () => {
    await storage.closeStorage();
    await fsp.rm(runtimeDir, { recursive: true, force: true });
  });

  test('should initialize with JSON storage when no MongoDB URI', async () => {
    delete process.env.MONGODB_URI;
    await storage.initStorage();

    const playlist = await storage.savePlaylist({
      ownerId: 'integration-user1',
      title: 'Integration Test',
      topic: 'Topic',
      summary: 'Summary',
      timeline: [],
    });

    assert.ok(playlist.id);
    const retrieved = await storage.getPlaylist(playlist.id);
    assert.strictEqual(retrieved.id, playlist.id);
  });
});

describe('Migration', () => {
  const migrationTestDir = path.join(__dirname, '..', 'data', 'test-migration');
  const testMongoUri = process.env.MONGODB_URI_TEST;

  if (!testMongoUri) {
    test('Migration tests skipped (no MONGODB_URI_TEST env var)', () => {
      console.log('Set MONGODB_URI_TEST to run migration integration tests');
      assert.ok(true);
    });
    return;
  }

  before(async () => {
    process.env.RUNTIME_DATA_DIR = migrationTestDir;
    
    // Create some JSON playlists
    const jsonTestStorage = require('../src/services/storage/jsonStorage');
    await jsonTestStorage.savePlaylist({
      ownerId: 'migration-user1',
      title: 'Migration Playlist 1',
      topic: 'Topic 1',
      summary: 'Summary 1',
      timeline: [],
    });
    await jsonTestStorage.savePlaylist({
      ownerId: 'migration-user1',
      title: 'Migration Playlist 2',
      topic: 'Topic 2',
      summary: 'Summary 2',
      timeline: [],
    });
  });

  after(async () => {
    await mongoStorage.closeConnection();
    await fsp.rm(migrationTestDir, { recursive: true, force: true });
    process.env.RUNTIME_DATA_DIR = runtimeDir;
  });

  test('should migrate JSON playlists to MongoDB', async () => {
    // Connect to MongoDB
    const connected = await mongoStorage.initConnection(testMongoUri);
    assert.strictEqual(connected, true);

    // Run migration
    const result = await migrateJsonToMongo();
    assert.strictEqual(result.success, true);
    assert.ok(result.migratedCount >= 2, `Should migrate at least 2 playlists, got ${result.migratedCount}`);

    // Verify playlists are in MongoDB
    const playlists = await mongoStorage.listPlaylistsByOwner('migration-user1');
    assert.ok(playlists.length >= 2);
  });
});
