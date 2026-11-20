begin;
set local lock_timeout = '4s';
set local statement_timeout = '25s';

-- Preserve the reviewed function's owner, ACL, security settings and business
-- transaction. Change only the bill status when a cancelled receipt leaves a
-- positive paid balance below the total due. No historical rows are rewritten.
do $fix$
declare
  target regprocedure := to_regprocedure('public.cancel_offline_payment(uuid,text)');
  definition text;
  old_fragment constant text := 'status = case when v_remaining_paid >= coalesce(amount_due, 0) then ''paid'' else ''unpaid'' end';
  new_fragment constant text := 'status = case when v_remaining_paid >= coalesce(amount_due, 0) then ''paid'' when v_remaining_paid > 0 then ''partial'' else ''unpaid'' end';
begin
  if target is null or not exists(select 1 from pg_proc where oid=target and prosecdef
      and pg_get_function_result(oid)='jsonb') then
    raise exception '[SERVER_UPDATE_REQUIRED]';
  end if;
  definition := pg_get_functiondef(target);
  if strpos(definition,old_fragment)=0 then
    if strpos(definition,new_fragment)>0 then return; end if;
    raise exception '[SERVER_UPDATE_REQUIRED]';
  end if;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then
    raise exception '[SERVER_UPDATE_REQUIRED]';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end $fix$;
notify pgrst, 'reload schema';
commit;
