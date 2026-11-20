// Data-free schema for a NEW disposable stack only, never an existing database.
export function buildTesterLocalSchema(m) {
  if(m.enums.length||m.views.length||m.functions.some(f=>/https?:|net\.http|dblink|cron\.schedule/i.test(f.definition)))
    throw new Error('TESTER_LOCAL_SCHEMA_REVIEW_REQUIRED');
  const q=s=>'"'+s.replaceAll('"','""')+'"',t=s=>'public.'+q(s),role=s=>s==='PUBLIC'?'PUBLIC':q(s);
  const sql=['begin;',"set local check_function_bodies=off;",
    "do $$ begin if exists(select 1 from pg_tables where schemaname='public') or exists(select 1 from auth.users) then raise exception 'TESTER_LOCAL_DB_NOT_EMPTY'; end if; end $$;"];
  const emit=s=>sql.push(s.replace(/;\s*$/,'')+';');
  const serials=new Set(m.tables.flatMap(t=>t.columns.flatMap(c=>c.default?.match(/^nextval\('(?:public\.)?([^']+)'::regclass\)$/)?.slice(1)??[])));
  for(const s of m.sequences.filter(s=>serials.has(s.name)))emit(`create sequence ${t(s.name)} as ${s.data_type} increment by ${s.increment_by} minvalue ${s.min_value} maxvalue ${s.max_value} start with ${s.start_value} ${s.cycle?'cycle':'no cycle'}`);
  for(const table of m.tables) {
    if(table.columns.some(c=>c.generated))throw new Error('TESTER_LOCAL_GENERATED_REVIEW_REQUIRED');
    emit(`create table ${t(table.name)} (${table.columns.map(c=>q(c.name)+' '+c.type+
      (c.identity?` generated ${c.identity==='a'?'always':'by default'} as identity`:c.default?' default '+c.default:'')+(c.not_null?' not null':'')).join(',')})`);
  }
  for(const f of m.functions)emit(f.definition);
  for(const kind of [false,true]) for(const table of m.tables)for(const c of table.constraints.filter(c=>(c.type==='f')===kind))
    emit(`alter table ${t(table.name)} add constraint ${q(c.name)} ${c.definition}`);
  for(const i of m.indexes)emit(i.definition);
  for(const table of m.tables) {
    emit(`alter table ${t(table.name)} ${table.rls?'enable':'disable'} row level security`);
    emit(`revoke all on table ${t(table.name)} from public,anon,authenticated,service_role`);
  }
  for(const p of m.policies)emit(`create policy ${q(p.policyname)} on ${t(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(role).join(',')}${p.qual?' using('+p.qual+')':''}${p.with_check?' with check('+p.with_check+')':''}`);
  for(const g of m.table_grants)emit(`grant ${g.privilege_type} on ${t(g.table_name)} to ${role(g.grantee)}${g.is_grantable==='YES'?' with grant option':''}`);
  for(const s of m.sequences)emit(`revoke all on sequence ${t(s.name)} from public,anon,authenticated,service_role`);
  for(const g of m.sequence_grants)emit(`grant ${g.privilege} on sequence ${t(g.name)} to ${role(g.role)}${g.grantable?' with grant option':''}`);
  for(const f of m.functions) {
    emit(`revoke all on function public.${f.signature} from public,anon,authenticated,service_role`);
    for(const g of f.grants.filter(g=>['PUBLIC','anon','authenticated','service_role'].includes(g.role)))emit(`grant ${g.privilege} on function public.${f.signature} to ${role(g.role)}`);
  }
  for(const trigger of m.triggers) {
    emit(trigger.definition);
    if(trigger.enabled!=='O')throw new Error('TESTER_LOCAL_TRIGGER_REVIEW_REQUIRED');
  }
  emit('commit');return sql.join('\n');
}
