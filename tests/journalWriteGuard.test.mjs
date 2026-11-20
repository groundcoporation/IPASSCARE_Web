import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const name of ['AdminStudyTab','AdminCounselTab']) {
  test(name+' serializes save/publish/delete synchronously and releases in finally',()=>{
    const source=readFileSync(new URL('../src/components/admin/'+name+'.tsx',import.meta.url),'utf8');
    assert.match(source,/mutationBusy = useRef\(false\)/);
    assert.equal((source.match(/mutationBusy.current = true/g)??[]).length,3);
    assert.equal((source.match(/mutationBusy.current = false/g)??[]).length,3);
    assert.equal((source.match(/if \(mutationBusy.current \|\|/g)??[]).length,3);
    assert.match(source,/catch \(error: unknown\)/);
    assert.doesNotMatch(source,/catch \(\w+: any\)|console\.error/);
    // A zero-row publish/delete must not be displayed as a completed operation.
    assert.match(source,/\.delete\(\)\.eq\('id', (?:id|logId)\)\.select\('id'\)\.maybeSingle\(\)/);
    assert.match(source,/if \(!data\) throw new AppError\('CONFLICT_ERROR'\)/);
  });
}
