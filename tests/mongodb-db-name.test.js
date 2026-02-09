const { test } = require('node:test');
const assert = require('node:assert');

// Test the database name resolution logic
test('MONGODB_DB_NAME - should extract database name from URI with database', () => {
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
  
  assert.strictEqual(extractDbName('mongodb://localhost:27017/testdb'), 'testdb');
  assert.strictEqual(extractDbName('mongodb+srv://user:pass@host/mydb?options'), 'mydb');
  assert.strictEqual(extractDbName('mongodb://localhost:27017/'), null);
});

test('MONGODB_DB_NAME - should prioritize env var over URI', () => {
  function extractDbName(uri) {
    try {
      const match = uri.match(/\/([^/?]+)(?:\?|$)/);
      return match && match[1] ? match[1] : null;
    } catch {
      return null;
    }
  }
  
  // Simulate the logic from mongoStorage.js
  const uri = 'mongodb://localhost:27017/uri-db';
  const envDbName = 'env-db';
  
  // Logic: env var takes precedence, then URI, then default
  const dbName = envDbName || extractDbName(uri) || 'youtube-music-story';
  
  assert.strictEqual(dbName, 'env-db', 'Should use env var when provided');
});

test('MONGODB_DB_NAME - should use URI database when env var not set', () => {
  function extractDbName(uri) {
    try {
      const match = uri.match(/\/([^/?]+)(?:\?|$)/);
      return match && match[1] ? match[1] : null;
    } catch {
      return null;
    }
  }
  
  const uri = 'mongodb://localhost:27017/uri-db';
  const envDbName = undefined;
  
  const dbName = envDbName || extractDbName(uri) || 'youtube-music-story';
  
  assert.strictEqual(dbName, 'uri-db', 'Should use URI database when env var not set');
});

test('MONGODB_DB_NAME - should use default when neither env var nor URI have database', () => {
  function extractDbName(uri) {
    try {
      const match = uri.match(/\/([^/?]+)(?:\?|$)/);
      return match && match[1] ? match[1] : null;
    } catch {
      return null;
    }
  }
  
  // URI with trailing slash returns null from extractDbName
  const uri = 'mongodb://localhost:27017/';
  const envDbName = undefined;
  
  const dbName = envDbName || extractDbName(uri) || 'youtube-music-story';
  
  assert.strictEqual(dbName, 'youtube-music-story', 'Should use default when neither set');
});

console.log('All MONGODB_DB_NAME tests defined');
