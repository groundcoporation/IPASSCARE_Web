// Develop rollback candidate only. Preserve ordinary non-synthetic behaviour.
import {createHash} from 'node:crypto';
const denied="raise exception using errcode='42501',message='[PERMISSION_DENIED]';";
const payerScope=`if not exists(select 1 from public.users u where u.id=new.user_id and u.branch_id=new.branch_id)
  then ${denied} end if;`;
export const pointTriggerReviews=new Map([
  ['distribute_matrix_points()',{
    hash:'e0d4348cdeee9c4fa33a5ec41797e329ecc978ae2d2d48e128f1c7d3f86a7daf',
    guard:`if lower(coalesce(new.status,''))='paid' then
      ${payerScope}
      if exists(select 1 from public.users payer
        cross join lateral unnest(coalesce(payer.lineage,array[]::text[])) ancestor(id)
        left join public.users recipient on recipient.id::text=ancestor.id
        where payer.id=new.user_id and (recipient.id is null or recipient.branch_id is distinct from new.branch_id))
      then ${denied} end if;
    end if;`,
  }],
  ['reverse_payment_points_on_cancel()',{
    hash:'40cbf969cea7df3d96945996fd8fc8ec0ed1aeefc874b25bd5ec4745e98bc7f8',
    guard:`if lower(coalesce(new.status,'')) in ('cancelled','canceled')
      and lower(coalesce(old.status,'')) not in ('cancelled','canceled') then
      ${payerScope}
      if exists(select 1 from public.point_logs pl left join public.users recipient on recipient.id=pl.user_id
        where pl.related_user_id=new.user_id and pl.created_at=new.created_at and pl.amount>0
          and coalesce(pl.type,'earn')='earn'
          and (recipient.id is null or recipient.branch_id is distinct from new.branch_id
            or pl.payment_id is distinct from new.id))
      then ${denied} end if;
    end if;`,
  }],
]);
export function buildTesterPointTriggerGuards(metadata) {
  if(!Array.isArray(metadata?.functions))throw new Error('TESTER_POINT_TRIGGER_METADATA_INVALID');
  return [...pointTriggerReviews].map(([signature,review])=>{
    const matches=metadata.functions.filter(f=>f.signature===signature);
    const definition=matches[0]?.definition?.replaceAll('\r\n','\n');
    if(matches.length!==1||typeof definition!=='string'
      ||createHash('sha256').update(definition).digest('hex')!==review.hash
      ||!/RETURNS trigger/i.test(definition)||!/SECURITY DEFINER/i.test(definition)
      ||!definition.includes('\nbegin\n'))throw new Error('TESTER_POINT_TRIGGER_REVIEW_REQUIRED');
    return definition.replace('\nbegin\n',()=>`\nbegin
      if ipasscare_preview_access.is_tester_actor()
        or coalesce(new.branch_id ~ '^devsmoke-[a-f0-9]{10}-[12]$',false) then
        if ipasscare_preview_access.is_tester_actor()
          and ipasscare_preview_access.core_scope() is distinct from new.branch_id then ${denied} end if;
        ${review.guard}
      end if;
    `)+';';
  }).join('\n');
}
