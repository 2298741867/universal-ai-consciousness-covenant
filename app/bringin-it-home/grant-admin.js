"use strict";

const { getConfig } = require("./config");
const { createDatabase } = require("./db");
const { initializeRewardsDatabase } = require("./rewards-db");

function grantAdmin(db, email) {
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Usage: npm run app:admin:grant -- registered-user@example.com");
  }
  initializeRewardsDatabase(db);
  return db.transaction(() => {
    const user = db.prepare("SELECT id, role FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) throw new Error("Register this user before granting an administrator role.");
    if (user.role !== "admin") {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
      db.prepare(`INSERT INTO cash_audit (actor_id, action, resource_id, detail)
        VALUES (NULL, 'admin_granted_by_operator', ?, ?)`).run(String(user.id), JSON.stringify({ method: "server CLI" }));
    }
    return user.id;
  }).immediate();
}

if (require.main === module) {
  const db = createDatabase(getConfig().dbPath);
  try {
    const userId = grantAdmin(db, process.argv[2]);
    console.log(`Administrator role granted to user ${userId}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

module.exports = { grantAdmin };
