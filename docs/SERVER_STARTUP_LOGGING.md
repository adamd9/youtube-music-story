# Server Startup Logging Guide

This guide explains the enhanced server startup logging for storage backend initialization and database connection diagnostics.

## Overview

The server provides comprehensive logging during startup to help identify:
- Which storage backend is being used (MongoDB or JSON files)
- MongoDB connection status and errors
- Database configuration details
- Migration status (when applicable)

## Log Prefixes

All storage-related logs use consistent prefixes for easy filtering:

- **`[STORAGE]`** - Storage backend initialization and configuration
- **`[MIGRATION]`** - Data migration from JSON to MongoDB
- **`[CFG]`** - Application configuration
- **`[ENV]`** - Environment variable settings

## Startup Scenarios

### Scenario 1: JSON File Storage (Default)

When no MongoDB URI is configured, the server uses JSON file storage:

```
[ENV] MONGODB_URI: (unset)

══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZATION
══════════════════════════════════════════════════════════════════════
[STORAGE] No MongoDB URI configured
[STORAGE] Storage backend: JSON files
[STORAGE] Using file system storage in: ./data/playlists
══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZED: JSON Files
══════════════════════════════════════════════════════════════════════
```

**What this means:**
- No MongoDB connection will be attempted
- Playlists will be stored as JSON files in `./data/playlists`
- No additional setup required

### Scenario 2: Successful MongoDB Connection

When MongoDB URI is configured and connection succeeds:

```
[ENV] MONGODB_URI: (set)

══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZATION
══════════════════════════════════════════════════════════════════════
[STORAGE] MongoDB URI configured
[STORAGE] Attempting MongoDB connection...
[STORAGE] Attempting MongoDB connection...
[STORAGE]   - Connection timeout: 10000ms
[STORAGE]   - Server selection timeout: 5000ms
[STORAGE]   - Database name: youtube-music-story
[STORAGE]   - Collection: playlists
[STORAGE]   - Creating indexes...
[STORAGE]   - Indexes created successfully
[STORAGE] ✓ MongoDB connection established
[STORAGE] Storage backend: MongoDB
[STORAGE] Checking for JSON to MongoDB migration...
[MIGRATION] No JSON playlists found to migrate
══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZED: MongoDB
══════════════════════════════════════════════════════════════════════
```

**What this means:**
- MongoDB connection successful
- Playlists will be stored in MongoDB
- Database name and collection are shown
- Indexes created for performance
- Migration checked (if JSON files exist, they'll be migrated)

### Scenario 3: MongoDB Connection Failure - Invalid Hostname

When the MongoDB hostname cannot be resolved:

```
[ENV] MONGODB_URI: (set)

══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZATION
══════════════════════════════════════════════════════════════════════
[STORAGE] MongoDB URI configured
[STORAGE] Attempting MongoDB connection...
[STORAGE] Attempting MongoDB connection...
[STORAGE]   - Connection timeout: 10000ms
[STORAGE]   - Server selection timeout: 5000ms
[STORAGE] ✗ MongoDB connection failed
[STORAGE]   - Error type: Server selection timeout
[STORAGE]   - Cause: Unable to reach MongoDB server
[STORAGE]   - Details: getaddrinfo ENOTFOUND invalid-host
[STORAGE] MongoDB connection failed - falling back to JSON file storage
[STORAGE] Storage backend: JSON files
══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZED: JSON Files
══════════════════════════════════════════════════════════════════════
```

**What this means:**
- MongoDB hostname is incorrect or cannot be resolved
- Server automatically falls back to JSON file storage
- No data loss - application continues to work

**How to fix:**
- Verify the MongoDB URI hostname is correct
- Check DNS resolution
- Ensure the MongoDB server is accessible

### Scenario 4: MongoDB Connection Failure - Connection Refused

When MongoDB server is not running or port is blocked:

```
[STORAGE] ✗ MongoDB connection failed
[STORAGE]   - Error type: Server selection timeout
[STORAGE]   - Cause: Unable to reach MongoDB server
[STORAGE]   - Details: connect ECONNREFUSED 127.0.0.1:27017
```

**What this means:**
- MongoDB server is not running on the specified host/port
- Port may be blocked by firewall
- Server automatically falls back to JSON file storage

**How to fix:**
- Start MongoDB server (`mongod` or `systemctl start mongod`)
- Check MongoDB is listening on the correct port
- Verify firewall settings allow connections

### Scenario 5: MongoDB Authentication Failure

When credentials are invalid:

```
[STORAGE] ✗ MongoDB connection failed
[STORAGE]   - Error type: Authentication failed
[STORAGE]   - Cause: Invalid credentials
[STORAGE]   - Details: Authentication failed
```

**What this means:**
- MongoDB username or password is incorrect
- User may not have proper permissions

**How to fix:**
- Verify MongoDB credentials in the URI
- Check user has proper database permissions
- Ensure database name in URI is correct

### Scenario 6: MongoDB with Migration

When JSON files exist and MongoDB is available:

```
[STORAGE] ✓ MongoDB connection established
[STORAGE] Storage backend: MongoDB
[STORAGE] Checking for JSON to MongoDB migration...
[MIGRATION] Loading JSON playlists for migration...
[MIGRATION] Migrating 5 playlist(s) to MongoDB...
[MIGRATION] ✓ Successfully migrated 5 playlists from JSON to MongoDB
══════════════════════════════════════════════════════════════════════
STORAGE INITIALIZED: MongoDB
══════════════════════════════════════════════════════════════════════
```

**What this means:**
- Found existing JSON playlists
- Successfully migrated them to MongoDB
- JSON files remain as backup

### Scenario 7: MongoDB Already Has Data (Skip Migration)

When MongoDB already contains playlists:

```
[MIGRATION] Skipping: MongoDB already contains 5 playlist(s)
[MIGRATION] Note: JSON files remain on disk but will not be re-migrated
```

**What this means:**
- Migration previously completed
- MongoDB already has data
- JSON files are safely ignored (kept as backup)

## Error Types Reference

| Error Type | Meaning | Common Causes |
|------------|---------|---------------|
| Server selection timeout | Can't reach MongoDB | Wrong hostname, server down, network issue |
| Authentication failed | Invalid credentials | Wrong username/password, missing permissions |
| Network error | Connection problem | Network outage, firewall blocking connection |
| Connection timeout | Server not responding | Server overloaded, network latency |
| Invalid MongoDB URI | Malformed connection string | Unencoded special characters in credentials |

## MongoDB URI Credentials Encoding

### Special Characters in Passwords

If your MongoDB password contains special characters, they must be URL-encoded according to RFC 3986. The application automatically encodes credentials, but you should be aware of this behavior.

**Characters that need encoding:**
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `?` → `%3F`
- `#` → `%23`
- `%` → `%25`
- `[` → `%5B`
- `]` → `%5D`

**Example:**

If your password is `p@ss:word`, your MongoDB URI should be:
```
# Incorrect (will fail):
mongodb://user:p@ss:word@localhost:27017/mydb

# The application automatically encodes it to:
mongodb://user:p%40ss%3Aword@localhost:27017/mydb
```

**Note:** The application automatically handles this encoding, so you can use the URI with unencoded credentials in your `.env` file. However, if you manually encode credentials, the application will double-encode them, which may cause connection failures.

### Best Practice

Store your MongoDB URI with unencoded credentials in your `.env` file:
```env
# Good - Let the application encode it
MONGODB_URI=mongodb://myuser:p@ssw0rd!@localhost:27017/mydb

# Also works - Already encoded (won't double-encode)
# But harder to read and maintain
MONGODB_URI=mongodb://myuser:p%40ssw0rd!@localhost:27017/mydb
```

## Troubleshooting Tips

### Check Environment Variables

Look for the `[ENV]` section in logs:
```
[ENV] MONGODB_URI: (set)     ← MongoDB will be attempted
[ENV] MONGODB_URI: (unset)   ← JSON storage will be used
```

### Check Final Status

The summary shows which backend is active:
```
STORAGE INITIALIZED: MongoDB    ← Using MongoDB
STORAGE INITIALIZED: JSON Files ← Using JSON files
```

### Filter Logs

Use grep to filter specific log types:
```bash
# Show only storage logs
npm start 2>&1 | grep '\[STORAGE\]'

# Show only migration logs
npm start 2>&1 | grep '\[MIGRATION\]'

# Show initialization summary
npm start 2>&1 | grep 'STORAGE INIT'
```

## Best Practices

1. **Always check the logs on first startup** to verify storage backend
2. **Monitor for connection failures** - application will work but fallback to JSON
3. **Save migration logs** when first connecting MongoDB with existing JSON data
4. **Use environment variables** for MongoDB URI (never hardcode credentials)

## Related Documentation

- [Migration Idempotency](./MIGRATION_IDEMPOTENCY.md) - How migration prevents duplicates
- [README.md](../README.md) - General configuration and setup
