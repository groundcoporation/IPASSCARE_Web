begin;

alter table public.shuttle_notification_logs
  add column if not exists route_id uuid references public.shuttle_routes(id) on delete set null,
  add column if not exists spot_id uuid references public.pickup_spots(id) on delete set null;

alter table public.shuttle_notification_logs
  drop constraint if exists shuttle_notification_logs_event_type_check;
alter table public.shuttle_notification_logs
  add constraint shuttle_notification_logs_event_type_check
  check (event_type in ('departure', 'five_minute', 'arrival'));

create index if not exists shuttle_notification_logs_route_spot_idx
  on public.shuttle_notification_logs(route_id, spot_id, service_date);

drop table if exists public.shuttle_destination_notification_logs;

commit;
