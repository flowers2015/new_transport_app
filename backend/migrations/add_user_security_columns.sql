-- Migration: Add security columns to users table
-- This migration adds columns for login attempt tracking and password expiration

-- Add failed login attempts tracking
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    ) THEN
        ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
    END IF;
END $$;

-- Add account lock timestamp
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'account_locked_until'
    ) THEN
        ALTER TABLE users ADD COLUMN account_locked_until TIMESTAMPTZ;
    END IF;
END $$;

-- Add password changed timestamp
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password_changed_at'
    ) THEN
        ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Update existing users to have password_changed_at set to created_at if null
UPDATE users 
SET password_changed_at = created_at 
WHERE password_changed_at IS NULL;

