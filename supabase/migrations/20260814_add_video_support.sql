-- Migration: add native video/media fields to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_data JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_warning TEXT;

UPDATE posts
SET video_url = media_url,
    media_type = 'video',
    media_url = NULL
WHERE media_url IS NOT NULL
  AND (
    media_url LIKE '%.mp4'
    OR media_url LIKE '%.webm'
    OR media_url LIKE '%.mov'
    OR media_url LIKE '%.avi'
    OR media_url LIKE '%.mkv'
    OR media_url LIKE '%.mpg'
    OR media_url LIKE '%.mpeg'
  );

UPDATE posts
SET media_type = 'photo'
WHERE media_type = 'text'
  AND media_urls IS NOT NULL
  AND array_length(media_urls, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_posts_media_type ON posts (media_type);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts (visibility);
CREATE INDEX IF NOT EXISTS idx_posts_video_url ON posts (video_url) WHERE video_url IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'valid_media_type'
      AND table_name = 'posts'
  ) THEN
    ALTER TABLE posts DROP CONSTRAINT valid_media_type;
  END IF;
END $$;

ALTER TABLE posts
  ADD CONSTRAINT valid_media_type
  CHECK (media_type IN ('text', 'photo', 'video', 'audio', 'gif', 'carousel', 'poll', 'event', 'reel', 'story', 'live', 'blog', 'marketplace'));
