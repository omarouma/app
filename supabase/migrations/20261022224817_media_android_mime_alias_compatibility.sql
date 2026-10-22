-- Preserve existing bucket limits and privacy; add Android MIME aliases.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(allowed_mime_types || array[
    'image/jpg','image/pjpeg','image/bmp','image/x-ms-bmp','image/avif',
    'image/heic-sequence','video/x-m4v','video/3gpp2','video/x-matroska',
    'video/mpeg','video/x-msvideo','video/x-flv','audio/mp3','audio/x-m4a',
    'audio/x-wav','audio/opus','audio/amr','audio/flac','audio/x-flac',
    'text/rtf','application/rtf','application/json','application/xml','text/xml',
    'application/vnd.ms-word','application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet','application/epub+zip',
    'application/x-zip-compressed','application/x-rar-compressed',
    'application/vnd.rar','application/x-7z-compressed','application/gzip',
    'application/x-tar','binary/octet-stream'
  ]::text[]) mime order by mime
)
where id = 'chat-media' and allowed_mime_types is not null;

update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(allowed_mime_types || array[
    'audio/mp3','audio/x-m4a','audio/x-wav','audio/opus',
    'audio/amr','audio/flac','audio/x-flac'
  ]::text[]) mime order by mime
)
where id = 'voice-messages' and allowed_mime_types is not null;
