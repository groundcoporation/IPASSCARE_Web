-- Catalogue probes run only inside the caller's guarded rollback transaction.
set local role authenticated;
select pg_temp.tester_probe('catalog_own_read',
  'select id from public.packages where id=(select own_product from tester_manual_context)',1);
select pg_temp.tester_probe('catalog_other_read_denied',
  'select id from public.packages where id=(select other_product from tester_manual_context)',0);
select pg_temp.tester_probe('catalog_other_option_read_denied',
  'select id from public.package_options where id=(select other_option from tester_manual_context)',0);
select pg_temp.tester_probe('catalog_own_direct_edit',
  'update public.packages set name=''synthetic-edited'' where id=(select own_product from tester_manual_context)',1);
select pg_temp.tester_probe('catalog_other_direct_edit_denied',
  'update public.packages set name=''synthetic-edited'' where id=(select other_product from tester_manual_context)',0,true);
select pg_temp.tester_probe('catalog_branch_move_denied',
  'update public.packages set branch_id=(select other_branch from tester_manual_context) where id=(select own_product from tester_manual_context)',0,true);
select pg_temp.tester_probe('catalog_forged_option_link_denied',
  'insert into public.package_options(package_id,branch_id,label,price,total_count) select other_product,own_branch,''synthetic'',100,1 from tester_manual_context',0,true);
select pg_temp.tester_probe('catalog_own_option_edit',
  'update public.package_options set price=200 where id=(select own_option from tester_manual_context)',1);
select pg_temp.tester_probe('catalog_other_option_delete_denied',
  'delete from public.package_options where id=(select other_option from tester_manual_context)',0,true);
select pg_temp.tester_probe('catalog_create_edit_delete_rpc', $probe$
  do $flow$ declare created jsonb; edited jsonb; removed jsonb; product uuid; option_id uuid;
  begin
    created:=public.save_package_catalog(null,null,(select own_branch from tester_manual_context),
      'synthetic-catalog',null,1,false,true,'lesson','[{"label":"synthetic","price":100,"total_count":3}]'::jsonb);
    product:=(created->>'package_id')::uuid;
    option_id:=(created->'option_ids'->>0)::uuid;
    edited:=public.save_package_catalog(product,null,(select own_branch from tester_manual_context),
      'synthetic-catalog-edited',null,2,false,true,'lesson',
      jsonb_build_array(jsonb_build_object('id',option_id,'label','synthetic-edited','price',200,'total_count',4)));
    if not exists(select 1 from public.packages where id=product and name='synthetic-catalog-edited')
      or not exists(select 1 from public.package_options where id=option_id and price=200 and total_count=4)
    then raise exception 'TESTER_CATALOG_SAVE_FAILED'; end if;
    removed:=public.retire_or_delete_package_catalog(product);
    if removed->>'action' is distinct from 'deleted'
      or exists(select 1 from public.packages where id=product)
      or exists(select 1 from public.package_options where id=option_id)
    then raise exception 'TESTER_CATALOG_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('catalog_referenced_retire_rpc', $probe$
  do $flow$ declare result jsonb; begin
    result:=public.retire_or_delete_package_catalog((select own_product from tester_manual_context));
    if result->>'action' is distinct from 'retired'
      or not exists(select 1 from public.packages where id=(select own_product from tester_manual_context) and not is_active)
    then raise exception 'TESTER_CATALOG_RETIRE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('catalog_own_toggle_rpc', $probe$
  do $flow$ begin
    perform public.set_package_catalog_active((select own_product from tester_manual_context),false);
    perform public.set_package_catalog_active((select own_product from tester_manual_context),true);
    if not exists(select 1 from public.packages where id=(select own_product from tester_manual_context) and is_active)
    then raise exception 'TESTER_CATALOG_TOGGLE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('catalog_other_create_rpc_denied',
  'select public.save_package_catalog(null,null,other_branch,''synthetic'',null,1,false,true,''lesson'',''[{"label":"synthetic","price":100,"total_count":3}]''::jsonb) from tester_manual_context',0,true);
select pg_temp.tester_probe('catalog_forged_branch_save_rpc_denied',
  'select public.save_package_catalog(other_product,null,own_branch,''synthetic'',null,1,false,true,''lesson'',''[{"label":"synthetic","price":100,"total_count":3}]''::jsonb) from tester_manual_context',0,true);
select pg_temp.tester_probe('catalog_other_toggle_rpc_denied',
  'select public.set_package_catalog_active(other_product,false) from tester_manual_context',0,true);
select pg_temp.tester_probe('catalog_other_retire_rpc_denied',
  'select public.retire_or_delete_package_catalog(other_product) from tester_manual_context',0,true);
reset role;
create temporary table tester_catalog_requests(label text,statement text);
insert into tester_catalog_requests values
  ('save','select public.save_package_catalog(null,null,own_branch,''synthetic'',null,1,false,true,''lesson'',''[{"label":"synthetic","price":100,"total_count":3}]''::jsonb) from tester_manual_context'),
  ('toggle','select public.set_package_catalog_active(own_product,false) from tester_manual_context'),
  ('retire','select public.retire_or_delete_package_catalog(own_product) from tester_manual_context');
grant select on tester_catalog_requests to authenticated;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('catalog_suspended_'||label,statement,0,true) from tester_catalog_requests;
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
  'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('catalog_revoked_'||label,statement,0,true) from tester_catalog_requests;
select pg_temp.tester_probe('catalog_revoked_read_denied','select id from public.packages',0);
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
  ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
set local role anon;
select pg_temp.tester_probe('catalog_anon_read_denied','select id from public.packages',0,true);
select pg_temp.tester_probe('catalog_anon_toggle_denied',
  'select public.set_package_catalog_active(own_product,false) from tester_manual_context',0,true);
reset role;
