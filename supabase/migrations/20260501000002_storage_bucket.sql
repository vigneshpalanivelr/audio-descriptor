-- Create private audio storage bucket for uploaded recordings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  104857600, -- 100 MB (matches MAX_AUDIO_SIZE_PRO)
  array[
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/m4a',
    'audio/x-m4a'
  ]
)
on conflict (id) do nothing;

-- RLS: users can only access their own files (path prefix = user UUID)
create policy "audio: owner upload"
  on storage.objects for insert
  with check (
    bucket_id = 'audio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "audio: owner read"
  on storage.objects for select
  using (
    bucket_id = 'audio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "audio: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'audio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
