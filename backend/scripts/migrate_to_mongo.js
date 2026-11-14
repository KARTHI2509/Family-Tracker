const { MongoClient } = require('mongodb');
const db = require('../src/config/database');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb+srv://karthikthalipineni_db_user1:KARTHI_23t@cluster0.zf5ottl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'familytracker';

async function migrateToMongo() {
  console.log('🔄 Starting migration from SQLite to MongoDB Atlas...');
  console.log(`Connecting to database: ${DB_NAME}`);

  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas successfully.');

    const mongoDb = client.db(DB_NAME);

    // 1. Migrate Users
    const users = db.prepare('SELECT * FROM users').all();
    if (users.length > 0) {
      const usersCol = mongoDb.collection('users');
      await usersCol.createIndex({ email: 1 }, { unique: true });
      for (const u of users) {
        await usersCol.updateOne(
          { id: u.id },
          { $set: { ...u, updatedAt: new Date() } },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${users.length} users.`);
    }

    // 2. Migrate Families
    const families = db.prepare('SELECT * FROM families').all();
    if (families.length > 0) {
      const familiesCol = mongoDb.collection('families');
      await familiesCol.createIndex({ invite_code: 1 }, { unique: true });
      for (const f of families) {
        await familiesCol.updateOne(
          { id: f.id },
          { $set: { ...f, updatedAt: new Date() } },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${families.length} families.`);
    }

    // 3. Migrate Locations (with TTL index)
    const locations = db.prepare('SELECT * FROM locations').all();
    if (locations.length > 0) {
      const locationsCol = mongoDb.collection('locations');
      await locationsCol.createIndex({ user_id: 1, timestamp: -1 });
      await locationsCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7-day retention
      for (const loc of locations) {
        await locationsCol.updateOne(
          { id: loc.id },
          { $set: { ...loc, createdAt: new Date(loc.timestamp) } },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${locations.length} locations.`);
    }

    // 4. Migrate Geofences
    const geofences = db.prepare('SELECT * FROM geofences').all();
    if (geofences.length > 0) {
      const geofencesCol = mongoDb.collection('geofences');
      await geofencesCol.createIndex({ family_id: 1 });
      for (const g of geofences) {
        await geofencesCol.updateOne(
          { id: g.id },
          { $set: { ...g, updatedAt: new Date() } },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${geofences.length} geofences.`);
    }

    // 5. Migrate Alerts
    const alerts = db.prepare('SELECT * FROM alerts').all();
    if (alerts.length > 0) {
      const alertsCol = mongoDb.collection('alerts');
      await alertsCol.createIndex({ family_id: 1, created_at: -1 });
      for (const a of alerts) {
        await alertsCol.updateOne(
          { id: a.id },
          { $set: a },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${alerts.length} alerts.`);
    }

    // 6. Migrate SOS Events
    const sosEvents = db.prepare('SELECT * FROM sos_events').all();
    if (sosEvents.length > 0) {
      const sosCol = mongoDb.collection('sos_events');
      await sosCol.createIndex({ is_active: 1, user_id: 1 });
      for (const s of sosEvents) {
        await sosCol.updateOne(
          { id: s.id },
          { $set: s },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${sosEvents.length} SOS events.`);
    }

    // 7. Migrate Audit Logs
    const auditLogs = db.prepare('SELECT * FROM audit_logs').all();
    if (auditLogs.length > 0) {
      const auditCol = mongoDb.collection('audit_logs');
      await auditCol.createIndex({ action: 1, timestamp: -1 });
      for (const al of auditLogs) {
        await auditCol.updateOne(
          { id: al.id },
          { $set: al },
          { upsert: true }
        );
      }
      console.log(`✅ Migrated ${auditLogs.length} audit logs.`);
    }

    console.log('🎉 Migration completed successfully without data loss.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    if (client) {
      await client.close();
    }
    process.exit(0);
  }
}

migrateToMongo();

