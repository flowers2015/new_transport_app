/**
 * Migration: Add security columns to users table
 * This migration adds columns for login attempt tracking and password expiration
 */

const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 [Migration] Starting add_user_security_columns migration...');
    
    await client.query('BEGIN');

    // Add failed login attempts tracking
    const checkFailedAttempts = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    `);
    
    if (checkFailedAttempts.rows.length === 0) {
      console.log('📝 [Migration] Adding failed_login_attempts column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0
      `);
      console.log('✅ [Migration] failed_login_attempts column added successfully');
    } else {
      console.log('ℹ️  [Migration] failed_login_attempts column already exists, skipping...');
    }

    // Add account lock timestamp
    const checkLockedUntil = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'account_locked_until'
    `);
    
    if (checkLockedUntil.rows.length === 0) {
      console.log('📝 [Migration] Adding account_locked_until column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN account_locked_until TIMESTAMPTZ
      `);
      console.log('✅ [Migration] account_locked_until column added successfully');
    } else {
      console.log('ℹ️  [Migration] account_locked_until column already exists, skipping...');
    }

    // Add password changed timestamp
    const checkPasswordChanged = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_changed_at'
    `);
    
    if (checkPasswordChanged.rows.length === 0) {
      console.log('📝 [Migration] Adding password_changed_at column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ DEFAULT NOW()
      `);
      console.log('✅ [Migration] password_changed_at column added successfully');
    } else {
      console.log('ℹ️  [Migration] password_changed_at column already exists, skipping...');
    }

    // Update existing users to have password_changed_at set to created_at if null
    const updatePasswordChanged = await client.query(`
      UPDATE users 
      SET password_changed_at = created_at 
      WHERE password_changed_at IS NULL
    `);
    
    if (updatePasswordChanged.rowCount > 0) {
      console.log(`✅ [Migration] Updated ${updatePasswordChanged.rowCount} users with password_changed_at`);
    } else {
      console.log('ℹ️  [Migration] No users needed password_changed_at update');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_user_security_columns migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in add_user_security_columns migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };

