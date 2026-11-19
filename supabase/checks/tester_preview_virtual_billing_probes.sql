-- The stub writes only a private virtual outbox and fake project bill records.
reset role;
update public.academy_bills set package_option_id=(select own_option from tester_manual_context)
where id=(select own_bill from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('virtual_bill_duplicate_and_reminder', $probe$
  do $flow$
  declare first jsonb; replay jsonb; reminder jsonb; request uuid:=gen_random_uuid(); payment uuid; before_notifications integer;
  begin
    select count(*) into before_notifications from public.notifications;
    first:=public.simulate_tester_billing_notification('send-academy-bills',array[(select own_bill from tester_probe_context)],request);
    replay:=public.simulate_tester_billing_notification('send-academy-bills',array[(select own_bill from tester_probe_context)],request);
    select payment_request_id into payment from public.academy_bills where id=(select own_bill from tester_probe_context);
    reminder:=public.simulate_tester_billing_notification('send-payment-reminders',array[payment],gen_random_uuid());
    if first->>'testMode' is distinct from 'true' or first->>'externalDelivery' is distinct from 'false'
      or (first->>'created')::integer is distinct from 1 or first is distinct from replay
      or payment is null or (reminder->>'sent')::integer is distinct from 1
      or (select count(*) from public.notifications) is distinct from before_notifications
    then raise exception 'TESTER_VIRTUAL_BILL_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('virtual_other_branch_bill_denied',
  'select public.simulate_tester_billing_notification(''send-academy-bills'',array[(select other_bill from tester_probe_context)],gen_random_uuid())',0,true);
select pg_temp.tester_expect_error('virtual_empty_ids_denied',
  'select public.simulate_tester_billing_notification(''send-academy-bills'',array[]::uuid[],gen_random_uuid())','INPUT_INVALID');
select pg_temp.tester_expect_error('virtual_unknown_operation_denied',
  'select public.simulate_tester_billing_notification(''payment-confirm'',array[(select own_bill from tester_probe_context)],gen_random_uuid())','INPUT_INVALID');
select pg_temp.tester_probe('virtual_request_id_payload_conflict', $probe$
  do $flow$ declare request uuid:=gen_random_uuid(); rejected boolean:=false; begin
    perform public.simulate_tester_billing_notification('send-academy-bills',array[(select own_bill from tester_probe_context)],request);
    begin
      perform public.simulate_tester_billing_notification('send-academy-bills',array[(select other_bill from tester_probe_context)],request);
    exception when raise_exception then rejected:=(sqlerrm='[CONFLICT_ERROR]'); end;
    if not rejected then raise exception 'TESTER_VIRTUAL_REQUEST_REUSE'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('virtual_outbox_direct_edit_denied',
  'delete from ipasscare_preview_delivery.outbox',0,true);
reset role;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('virtual_suspended_sender_denied',
  'select public.simulate_tester_billing_notification(''send-academy-bills'',array[(select own_bill from tester_probe_context)],gen_random_uuid())',0,true);
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
set local role anon;
select pg_temp.tester_probe('virtual_anonymous_sender_denied',
  'select public.simulate_tester_billing_notification(''send-academy-bills'',array[(select own_bill from tester_probe_context)],gen_random_uuid())',0,true);
reset role;
