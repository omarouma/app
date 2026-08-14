-- Add push_subscription column to users table if it doesn't exist
-- Run this in Supabase SQL Editor to fix the 400 error on push notification subscription updates

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription TEXT;

-- Create index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_users_push_subscription ON users (push_subscription) WHERE push_subscription IS NOT NULL;
