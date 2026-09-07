begin;

alter table public.payment_requests
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminded_at timestamptz;

create index if not exists payment_requests_pending_reminder_idx
  on public.payment_requests(branch_id, last_reminded_at)
  where status = 'pending';

commit;
