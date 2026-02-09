const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const fsp = require('node:fs/promises');

// Configure test environment
const runtimeDir = path.join(__dirname, '..', 'data', 'test-integration');
process.env.RUNTIME_DATA_DIR = runtimeDir;
process.env.TTS_OUTPUT_DIR = path.join(runtimeDir, 'tts');
process.env.OPENAI_API_KEY = 'test-key';
process.env.MOCK_OPENAI = '1';
process.env.MOCK_TTS = '1';
delete process.env.MONGODB_URI; // Use JSON storage for integration tests

const app = require('../src/app');
const { initStorage, closeStorage } = require('../src/services/storage');
const jobManager = require('../src/services/jobManager');

let server;

before(async () => {
  // Initialize storage
  await initStorage();
  
  // Start the server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(8889, resolve);
  });
});

after(async () => {
  // Clean up
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      // Force close all connections
      server.closeAllConnections?.();
    });
  }
  jobManager.shutdown();
  await closeStorage();
  await fsp.rm(runtimeDir, { recursive: true, force: true });
});

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8889,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

test('E2E: Create, retrieve, list, and update playlists', async () => {
  // Create a playlist
  const createRes = await makeRequest('POST', '/api/playlists', {
    ownerId: 'integration-user',
    title: 'Integration Test Playlist',
    topic: 'Test Topic',
    summary: 'Test Summary',
    timeline: [
      { type: 'narration', title: 'Intro', text: 'Hello' },
      { type: 'song', title: 'Test Song', artist: 'Test Artist' }
    ],
    source: 'youtube'
  });
  
  assert.strictEqual(createRes.statusCode, 200, 'Create should return 200');
  const created = JSON.parse(createRes.body);
  assert.strictEqual(created.ok, true);
  assert.ok(created.playlist.id, 'Playlist should have an ID');
  
  const playlistId = created.playlist.id;
  
  // Retrieve the playlist
  const getRes = await makeRequest('GET', `/api/playlists/${playlistId}`);
  assert.strictEqual(getRes.statusCode, 200, 'Get should return 200');
  const retrieved = JSON.parse(getRes.body);
  assert.strictEqual(retrieved.ok, true);
  assert.strictEqual(retrieved.playlist.id, playlistId);
  assert.strictEqual(retrieved.playlist.title, 'Integration Test Playlist');
  
  // List playlists by owner
  const listRes = await makeRequest('GET', '/api/users/integration-user/playlists');
  assert.strictEqual(listRes.statusCode, 200, 'List should return 200');
  const listed = JSON.parse(listRes.body);
  assert.strictEqual(listed.ok, true);
  assert.ok(Array.isArray(listed.playlists));
  assert.ok(listed.playlists.length > 0);
  assert.ok(listed.playlists.some(p => p.id === playlistId));
  
  // Update the playlist
  const updateRes = await makeRequest('PATCH', `/api/playlists/${playlistId}`, {
    title: 'Updated Integration Test Playlist'
  });
  assert.strictEqual(updateRes.statusCode, 200, 'Update should return 200');
  const updated = JSON.parse(updateRes.body);
  assert.strictEqual(updated.ok, true);
  assert.strictEqual(updated.playlist.title, 'Updated Integration Test Playlist');
  assert.ok(updated.playlist.updatedAt, 'Should have updatedAt timestamp');
  
  // Verify the update persisted
  const getUpdatedRes = await makeRequest('GET', `/api/playlists/${playlistId}`);
  const updatedRetrieved = JSON.parse(getUpdatedRes.body);
  assert.strictEqual(updatedRetrieved.playlist.title, 'Updated Integration Test Playlist');
});

test('E2E: Handle not found errors', async () => {
  const getRes = await makeRequest('GET', '/api/playlists/nonexistent-id');
  assert.strictEqual(getRes.statusCode, 404, 'Should return 404 for nonexistent playlist');
  
  const updateRes = await makeRequest('PATCH', '/api/playlists/nonexistent-id', {
    title: 'Should Not Update'
  });
  assert.strictEqual(updateRes.statusCode, 404, 'Should return 404 for update of nonexistent playlist');
});

test('E2E: Validate required fields', async () => {
  const createRes = await makeRequest('POST', '/api/playlists', {
    title: 'Missing Owner',
    timeline: []
  });
  assert.strictEqual(createRes.statusCode, 400, 'Should return 400 for missing required fields');
});
