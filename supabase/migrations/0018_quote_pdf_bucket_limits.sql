-- Clarix — Migration 0018
-- Phase 11: storage-level limits on the quote PDF bucket.
--
-- The app already checks every PDF before it's stored (10 MB, %PDF- magic
-- bytes; src/lib/quote-intake.ts). This makes Storage enforce the same size
-- and type for any upload path, as a second line of defence. Additive.
-- Rollback: update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'quote-pdfs';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf']
where id = 'quote-pdfs';
