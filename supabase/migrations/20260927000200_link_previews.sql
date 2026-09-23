-- GaGa — Rich link previews for text messages (§41).
--
-- A text message that contains a URL gets a rich preview card (title,
-- description, image, domain). The metadata is fetched ONCE server-side by the
-- `link-preview` Edge Function and cached on the message row so every
-- participant renders the same card without re-scraping the target page.

alter table public.messages
  add column if not exists link_preview jsonb;

comment on column public.messages.link_preview is
  'Cached OpenGraph/Twitter-card metadata for the first URL in a text message.';
