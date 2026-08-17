-- Migration: Add push_subscription column to users table for FCM push notifications
-- This enables the app to store Firebase Cloud Messaging tokens for each user
-- allowing push notifications and background call notifications to work properly

-- Add push_subscription column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription TEXT;

-- Add index for faster lookups when sending notifications
CREATE INDEX IF NOT EXISTS idx_users_push_subscription ON users(push_subscription) WHERE push_subscription IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN users.push_subscription IS 'Firebase Cloud Messaging (FCM) push subscription token for push notifications and background calling';

-- Add notification_enabled column for user preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT TRUE;

-- Add push notification settings JSON column for granular control
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"calls": true, "messages": true, "mentions": true, "sounds": true}'::jsonb;

-- Create index on notification settings for queries
CREATE INDEX IF NOT EXISTS idx_users_notification_enabled ON users(notification_enabled) WHERE notification_enabled = TRUE;

-- Grant appropriate permissions
GRANT UPDATE (push_subscription, notification_enabled, notification_settings) ON users TO authenticated;

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added push_subscription and notification settings to users table';
END $$;
