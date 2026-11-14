const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const { recordAuditLog } = require('../src/services/auditService');

async function seedAdmin() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || 'admin@familytracker.local').toLowerCase().trim();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const name = process.argv[4] || 'Super Administrator';

  console.log(`Checking admin account for: ${email}`);

  const existing = db.prepare('SELECT id, name, email, role, status FROM users WHERE email = ?').get(email);

  if (existing) {
    db.prepare("UPDATE users SET role = 'super_admin', status = 'active' WHERE id = ?").run(existing.id);
    console.log(`✅ User "${existing.name}" (${email}) promoted to super_admin.`);
    recordAuditLog({
      actorRole: 'cli_bootstrap',
      action: 'ADMIN_PROMOTED_CLI',
      targetId: existing.id,
      targetType: 'user',
      reason: 'Elevated via seed_admin.js CLI script'
    });
    process.exit(0);
  }

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, status, avatar_color)
    VALUES (?, ?, ?, 'super_admin', 'active', '#DC2626')
  `).run(name, email, hashedPassword);

  console.log(`🎉 Super Admin account successfully created!`);
  console.log(`Email: ${email}`);
  console.log(`Role: super_admin`);
  console.log(`User ID: ${result.lastInsertRowid}`);

  recordAuditLog({
    actorRole: 'cli_bootstrap',
    action: 'ADMIN_CREATED_CLI',
    targetId: result.lastInsertRowid,
    targetType: 'user',
    reason: 'Initial super admin provisioned via seed_admin.js'
  });

  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});

