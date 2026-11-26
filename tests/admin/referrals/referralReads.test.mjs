import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadReferralUsers, loadReferralPoints } from '../../../src/pages/admin/referrals/api/referralReads.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
function mock(reply = { data: [], error: null }) {
  const calls = []; const q = {};
  for (const method of ['select', 'neq', 'eq', 'order']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (reply instanceof Error) throw reply; return reply; }).then(yes, no);
  return { calls, client: { from: table => { calls.push(['from', table]); return q; } } };
}
test('roster preserves explicit fields and deleted filter; points scope and order are unchanged', async () => {
  const users = mock(); await loadReferralUsers(users); assert.deepEqual(users.calls[0], ['from', 'users']); assert.ok(users.calls[1][1].includes('referred_by')); assert.deepEqual(users.calls[2], ['neq', 'status', 'deleted']);
  const points = mock(); await loadReferralPoints(id, points); assert.deepEqual(points.calls, [['from', 'point_logs'], ['select', 'id, amount, reason, type, created_at'], ['eq', 'user_id', id], ['order', 'created_at', { ascending: false }]]);
});
for (const kind of ['users', 'points']) {
  const run = d => kind === 'users' ? loadReferralUsers(d) : loadReferralPoints(id, d);
  test(kind + ' error/response loss is safe and never retried', async () => {
    for (const reply of [{ data: [], error: { code: '42501', message: 'private token' } }, new Error('private')]) {
      const d = mock(reply); await assert.rejects(run(d), e => !e.message.includes('private') && ['PERMISSION_DENIED', 'REFERRAL_LOAD_FAILED'].includes(e.code)); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
    }
  });
  test(kind + ' malformed list is not normal empty success', async () => {
    for (const data of [null, {}, [null], kind === 'users' ? [{ id, lineage: [1] }] : [{ id, amount: 'invalid' }]]) await assert.rejects(run(mock({ data })), e => e.code === 'REFERRAL_LOAD_FAILED');
  });
}
test('invalid point target cannot query', async () => { const d = mock(); await assert.rejects(loadReferralPoints('bad', d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0); });
const source = readFileSync(new URL('../../../src/pages/admin/referrals/views/ReferralTreeTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ReferralTreeTab.tsx', source, ts.ScriptTarget.Latest, true); const defs = new Map(); const effects = [];
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) defs.set(n.name.getText(ast), n.initializer.getText(ast)); if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effects.push(n.arguments[0].getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + defs.get(name) + '; return handler;', { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(...Object.values(deps)); }
function screen(options = {}) {
  const state = { users: null, selected: id, points: [{ id: 'old' }], owner: null, expanded: {}, errors: [], busy: [], pointBusy: [], rosterReads: 0, pointReads: 0 };
  const profile = { id, role: 'admin', branch_id: 'b' };
  const deps = { AppError, useCallback: fn => fn, profile, selectedUserId: id, canViewSelectedUser: true, supabase: {},
    rosterReadRequest: { current: 0 }, pointReadRequest: { current: 0 }, rosterProfile: { current: profile }, activeReferralView: { current: { profile, selectedUserId: id, canView: true } },
    setUsers: v => { state.users = v; }, setSelectedUserId: v => { state.selected = v; }, setExpandedNodes: v => { state.expanded = v; }, setPointLogs: v => { state.points = v; }, setPointLogOwner: v => { state.owner = v; }, setLoading: v => state.busy.push(v), setLogsLoading: v => state.pointBusy.push(v),
    handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code), loadReferralUsers: async () => { state.rosterReads++; return options.users ? options.users() : [{ id }]; }, loadReferralPoints: async () => { state.pointReads++; return options.points ? options.points() : [{ id: 'new', amount: 1 }]; },
  };
  return { state, deps, roster: () => compile('loadAllUsers', deps)(), points: () => compile('loadPointLogs', deps)() };
}
test('roster refresh clears old point selection and applies only complete current roster', async () => {
  const s = screen(); await s.roster(); assert.deepEqual(s.state.users, [{ id }]); assert.equal(s.state.selected, id); assert.deepEqual(s.state.expanded, { [id]: true }); assert.deepEqual(s.state.points, []); assert.equal(s.deps.rosterProfile.current, s.deps.profile);
});
test('roster failure clears lists/selection and stays unready', async () => {
  const s = screen({ users: () => { throw new Error('private'); } }); await s.roster(); assert.deepEqual(s.state.users, []); assert.equal(s.state.selected, null); assert.equal(s.deps.rosterProfile.current, null); assert.deepEqual(s.state.errors, ['REFERRAL_LOAD_FAILED']);
});
test('old roster result/error cannot affect new account/loading', async () => {
  for (const failure of [false, true]) { let finish, fail; const s = screen({ users: () => new Promise((yes, no) => { finish = yes; fail = no; }) }); const pending = s.roster(); s.deps.activeReferralView.current.profile = { id: other };
    if (failure) fail(new Error('private')); else finish([{ id }]); await pending; assert.deepEqual(s.state.users, []); assert.equal(s.state.selected, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
  }
});
test('unsupported role cannot read full roster', async () => { const s = screen(); s.deps.profile.role = 'user'; await s.roster(); assert.equal(s.state.rosterReads, 0); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']); });
test('point read clears previous log immediately then tags response with owner', async () => {
  let finish; const s = screen({ points: () => new Promise(yes => { finish = yes; }) }); const pending = s.points(); assert.deepEqual(s.state.points, []); finish([{ id: 'new', amount: 2 }]); await pending; assert.equal(s.state.owner.userId, id); assert.equal(s.state.owner.profile, s.deps.profile); assert.deepEqual(s.state.pointBusy, [true, false]);
});
test('selected-user/account switch ignores earlier point success and failure', async () => {
  for (const failure of [false, true]) { let finish, fail; const s = screen({ points: () => new Promise((yes, no) => { finish = yes; fail = no; }) }); const pending = s.points(); s.deps.activeReferralView.current.selectedUserId = other;
    if (failure) fail(new Error('private')); else finish([{ id: 'old', amount: 2 }]); await pending; assert.deepEqual(s.state.points, []); assert.equal(s.state.owner, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.pointBusy, [true]);
  }
});
test('out-of-scope or roster-unready selection cannot query point records', async () => {
  for (const change of ['allowed', 'roster', 'stale']) { const s = screen(); if (change === 'allowed') s.deps.canViewSelectedUser = false; if (change === 'roster') s.deps.rosterProfile.current = null; if (change === 'stale') s.deps.activeReferralView.current.selectedUserId = other; await s.points(); assert.equal(s.state.pointReads, 0); }
});
test('point failure stays empty with safe common guidance', async () => { const s = screen({ points: () => { throw new Error('private'); } }); await s.points(); assert.deepEqual(s.state.points, []); assert.deepEqual(s.state.errors, ['REFERRAL_LOAD_FAILED']); assert.equal(s.state.pointBusy.at(-1), false); });
test('point ownership hides old logs before next effect when selected user/account changes', () => {
  const profile = { id }; const deps = { profile, selectedUserId: id, loadedPointLogs: [{ id: 'log' }], pointLogOwner: { profile, userId: other } }; assert.deepEqual(compile('pointLogs', deps), []);
  deps.pointLogOwner.userId = id; assert.deepEqual(compile('pointLogs', deps), deps.loadedPointLogs); deps.profile = { id: other }; assert.deepEqual(compile('pointLogs', deps), []);
});
test('selection scope is admin-all or own-downline and requires current loaded roster', () => {
  const profile = { id }; const deps = { profile, selectedUserId: other, rosterProfile: { current: profile }, usersById: new Map([[other, { id: other }]]), isAdmin: true, adminViewScope: 'all', myDownlineIds: new Set([id]) };
  assert.equal(compile('canViewSelectedUser', deps), true); deps.adminViewScope = 'my'; assert.equal(compile('canViewSelectedUser', deps), false);
  deps.isAdmin = false; deps.myDownlineIds.add(other); assert.equal(compile('canViewSelectedUser', deps), true); deps.rosterProfile.current = null; assert.equal(compile('canViewSelectedUser', deps), false);
});
test('lineage parent wins over username referral and missing parent is null', () => {
  const get = compile('getParentId', { useCallback: fn => fn, usersByUsername: new Map([['parent', { id }]]) }); assert.equal(get({ lineage: [other], referred_by: 'parent' }), other); assert.equal(get({ lineage: [], referred_by: 'parent' }), id); assert.equal(get({ lineage: [], referred_by: 'missing' }), null);
});
test('BFS handles duplicate/cyclic edges without infinite traversal', () => {
  const ids = compile('myDownlineIds', { useMemo: fn => fn(), profile: { id }, childrenMap: new Map([[id, [{ id: other }]], [other, [{ id }]]]) }); assert.deepEqual([...ids], [id, other]);
  const render = compile('renderTreeNode', {}); assert.equal(render({ id }, 0, new Set([id])), null);
});
test('tree and root memo dependencies use stable parent callback, not hidden username capture', () => {
  assert.match(defs.get('getParentId'), /^useCallback\(/); assert.match(defs.get('childrenMap'), /\[users, getParentId\]/); assert.match(defs.get('rootUsers'), /getParentId\]/); assert.doesNotMatch(defs.get('loadAllUsers') + defs.get('loadPointLogs'), /console\.|\.message|supabase\.from/);
});
test('cleanup invalidates both request types and loaded roster identity', async () => {
  const s = screen(); let finish; s.deps.loadReferralUsers = () => new Promise(yes => { finish = yes; });
  const loader = compile('loadAllUsers', s.deps); const effect = effects.find(text => text.includes('rosterReadRequest.current += 1'));
  const run = new Function(...Object.keys(s.deps), 'loadAllUsers', ts.transpile('const mount = ' + effect + '; return mount;', { target: ts.ScriptTarget.ES2022 }))(...Object.values(s.deps), loader); const cleanup = run(); cleanup(); finish([{ id }]); await new Promise(resolve => setImmediate(resolve)); assert.equal(s.deps.rosterProfile.current, null); assert.equal(s.state.selected, null);
});
test('referral read message matches app catalog', () => {
  const app = readFileSync(new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/REFERRAL_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.REFERRAL_LOAD_FAILED);
});
