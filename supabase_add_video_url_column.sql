-- Migration: Add video_url column to posts table for video post support
-- Purpose: Store video URLs separately from image URLs for proper media rendering

-- Step 1: Add video_url column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Step 2: Add mediaType column to distinguish text/photo/video posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text';

-- Step 3: Migrate existing posts with video content
-- Posts that previously stored video as media_url should now have video_url set
UPDATE posts 
SET 
  video_url = media_url,
  media_type = 'video',
  media_url = NULL
WHERE 
  media_url LIKE '%.mp4'
  OR media_url LIKE '%.webm'
  OR media_url LIKE '%.mov'
  OR media_url LIKE '%.avi'
  OR media_url LIKE '%.mkv';

-- Step 4: Set mediaType to 'photo' for posts with images
UPDATE posts 
SET media_type = 'photo'
WHERE 
  media_type = 'text'
  AND (media_urls IS NOT NULL AND array_length(media_urls, 1) > 0);

-- Step 5: Add comment metadata field for enhanced post features
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_data JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_warning TEXT;

-- Step 6: Update indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_posts_media_type ON posts (media_type);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts (visibility);
CREATE INDEX IF NOT EXISTS idx_posts_video_url ON posts (video_url) WHERE video_url IS NOT NULL;

-- Step 7: Update RLS policies to support new mediaType-based queries
-- (Existing policies remain valid; all SELECT/INSERT/UPDATE/DELETE rules still apply)

-- Step 8: Add a check constraint to ensure mediaType is valid
ALTER TABLE posts 
ADD CONSTRAINT valid_media_type 
CHECK (media_type IN ('text', 'photo', 'video', 'audio', 'gif', 'carousel', 'poll', 'event', 'reel', 'story', 'live', 'blog', 'marketplace'));
