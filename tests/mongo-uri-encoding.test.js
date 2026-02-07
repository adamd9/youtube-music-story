const { test } = require('node:test');
const assert = require('node:assert');

// Extract the encodeMongoCredentials function for testing
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

test('encodeMongoCredentials - should encode special characters in password', () => {
  const uri = 'mongodb://user:p@ssw0rd!@localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://user:p%40ssw0rd!@localhost:27017/testdb');
});

test('encodeMongoCredentials - should encode special characters in username', () => {
  const uri = 'mongodb://user@name:password@localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://user%40name:password@localhost:27017/testdb');
});

test('encodeMongoCredentials - should encode both username and password', () => {
  const uri = 'mongodb://user@name:p@ss:w0rd@localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://user%40name:p%40ss%3Aw0rd@localhost:27017/testdb');
});

test('encodeMongoCredentials - should work with mongodb+srv', () => {
  const uri = 'mongodb+srv://user:p@ssword@cluster.mongodb.net/testdb?retryWrites=true';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb+srv://user:p%40ssword@cluster.mongodb.net/testdb?retryWrites=true');
});

test('encodeMongoCredentials - should handle URI without credentials', () => {
  const uri = 'mongodb://localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://localhost:27017/testdb');
});

test('encodeMongoCredentials - should encode percent signs', () => {
  const uri = 'mongodb://user:p%ssword@localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://user:p%25ssword@localhost:27017/testdb');
});

test('encodeMongoCredentials - should encode slashes', () => {
  const uri = 'mongodb://user:p/ssword@localhost:27017/testdb';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://user:p%2Fssword@localhost:27017/testdb');
});

test('encodeMongoCredentials - should handle complex passwords', () => {
  const uri = 'mongodb://admin:P@ss#w0rd!123@cluster.mongodb.net/production';
  const encoded = encodeMongoCredentials(uri);
  assert.strictEqual(encoded, 'mongodb://admin:P%40ss%23w0rd!123@cluster.mongodb.net/production');
});

console.log('All URI encoding tests defined');
