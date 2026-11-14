const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

let client = null;
let mongoDb = null;
let isConnected = false;
let syncTimer = null;

const TABLES = [
  'families',
  'users',
  'locations',
  'geofences',
  'geofence_events',
  'sos_events',
  'alerts',
  'journeys',
  'audit_logs',
  'emergency_access_grants'
];

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    return false;
  }

  try {
    client = new MongoClient(uri.trim(), {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();
    // Default to 'familytracker_db'
    mongoDb = client.db('familytracker_db');
    isConnected = true;
    console.log('🍃 [MongoDB Atlas] Connected successfully to cluster (database: familytracker_db)');
    return true;
  } catch (err) {
    console.warn(`🍃 [MongoDB Atlas] Warning: Could not connect to cluster: ${err.message}`);
    isConnected = false;
    return false;
  }
}

/**
 * Restore SQLite database from MongoDB Atlas if local SQLite is empty
 */
async function restoreIfEmpty(sqliteDb, dbPath) {
  if (!isConnected || !mongoDb) return false;

  try {
    let localUserCount = 0;
    try {
      const row = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get();
      localUserCount = row ? row.count : 0;
    } catch (_) {
      localUserCount = 0;
    }

    if (localUserCount === 0) {
      console.log('🍃 [MongoDB Atlas] Local database is empty. Checking Atlas for backup...');
      const backupDoc = await mongoDb.collection('sqlite_backups').findOne({ _id: 'latest_db_backup' });

      if (backupDoc) {
        console.log(`🍃 [MongoDB Atlas] Found backup in Atlas. Restoring documents...`);
        for (const table of TABLES) {
          try {
            const docs = await mongoDb.collection(table).find().toArray();
            if (docs && docs.length > 0) {
              const insertOrReplace = (doc) => {
                const keys = Object.keys(doc).filter(k => k !== '_id' && k !== '_syncedAt');
                if (keys.length === 0) return;
                const placeholders = keys.map(() => '?').join(', ');
                const values = keys.map(k => doc[k]);
                const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
                sqliteDb.prepare(sql).run(...values);
              };
              const tx = sqliteDb.transaction((rows) => {
                for (const r of rows) insertOrReplace(r);
              });
              tx(docs);
              console.log(`   ↳ Restored ${docs.length} records into "${table}"`);
            }
          } catch (tblErr) {
            // Table restore note
          }
        }
        console.log('🍃 [MongoDB Atlas] Cloud restoration complete!');
        return true;
      }
    }
  } catch (err) {
    console.warn('🍃 [MongoDB Atlas] Restoration check failed:', err.message);
  }
  return false;
}

/**
 * Synchronize all SQLite tables and binary snapshot to MongoDB Atlas
 */
async function syncToMongo(sqliteDb, dbPath) {
  if (!isConnected || !mongoDb) return;

  try {
    // 1. Mirror tables as individual MongoDB documents
    for (const table of TABLES) {
      try {
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
        if (rows && rows.length > 0) {
          const bulkOps = rows.map(row => ({
            replaceOne: {
              filter: { id: row.id },
              replacement: { ...row, _syncedAt: new Date() },
              upsert: true
            }
          }));
          await mongoDb.collection(table).bulkWrite(bulkOps, { ordered: false });
        }
      } catch (tblErr) {
        // Table might not exist yet or be empty
      }
    }

    // 2. Binary snapshot backup for seamless full restoration
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        sqliteDb.pragma('wal_checkpoint(PASSIVE)');
        const fileBuffer = fs.readFileSync(dbPath);
        await mongoDb.collection('sqlite_backups').updateOne(
          { _id: 'latest_db_backup' },
          {
            $set: {
              buffer: fileBuffer,
              updatedAt: new Date(),
              sizeBytes: fileBuffer.length,
              version: '2.0.0'
            }
          },
          { upsert: true }
        );
      } catch (snapErr) {
        // Snapshot warning
      }
    }
  } catch (err) {
    console.warn('🍃 [MongoDB Atlas] Sync warning:', err.message);
  }
}

/**
 * Start MongoDB Sync Engine
 */
async function startMongoSync(sqliteDb) {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    console.log('ℹ️  [Database] MONGODB_URI not provided. Running in local SQLite mode.');
    return;
  }

  const connected = await connectMongo();
  if (!connected) return;

  const dbPath = sqliteDb.dbPath;

  // Restore on boot if needed
  await restoreIfEmpty(sqliteDb, dbPath);

  // Initial sync of existing data
  await syncToMongo(sqliteDb, dbPath);

  // Periodic background sync every 30 seconds
  syncTimer = setInterval(() => {
    syncToMongo(sqliteDb, dbPath).catch(() => {});
  }, 30000);

  // Sync on application shutdown
  const handleExit = async () => {
    if (syncTimer) clearInterval(syncTimer);
    if (isConnected) {
      console.log('🍃 [MongoDB Atlas] Final sync before shutdown...');
      await syncToMongo(sqliteDb, dbPath).catch(() => {});
      if (client) await client.close();
    }
  };

  process.once('SIGINT', handleExit);
  process.once('SIGTERM', handleExit);
}

function getMongoStatus() {
  return isConnected ? 'connected' : (process.env.MONGODB_URI ? 'connecting_or_failed' : 'not_configured');
}

module.exports = {
  startMongoSync,
  syncToMongo,
  getMongoStatus,
};

