begin;

create table if not exists public.shuttle_destination_notification_logs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.shuttle_routes(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  spot_id uuid references public.pickup_spots(id) on delete set null,
  direction text not null check (direction in ('pickup', 'dropoff')),
  service_date date not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  unique (route_id, reservation_id, spot_id, direction, service_date)
);

alter table public.shuttle_destination_notification_logs enable row level security;

create index if not exists shuttle_destination_notification_logs_lookup_idx
  on public.shuttle_destination_notification_logs(route_id, service_date, direction);

commit;
