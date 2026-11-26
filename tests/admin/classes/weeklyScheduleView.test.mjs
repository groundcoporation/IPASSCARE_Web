import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { scheduleDays, normalizedScheduleDay, minuteOf, scheduleLocalDate, scheduleHours, filterWeeklySchedules, currentScheduleSelection } from '../../../src/pages/admin/classes/model/scheduleDisplay.ts';
const schedule = { id: 's', branch_id: 'b', target_class: 'Test class', day_of_week: '월요일', start_time: '14:30', end_time: '15:30', max_people: 10, branches: { name: 'Test branch' } };
const reservation = { id: 'r', schedule_id: 's', class_date: '2026-11-23', status: 'confirmed', attendance_status: 'yet', child_id: 'c', user_id: 'u', children: { child_name: 'Test child' }, users: { name: 'Test parent', phone: 'synthetic' } };
const model = { scheduleDays, normalizedScheduleDay, minuteOf, scheduleLocalDate, scheduleHours, filterWeeklySchedules, currentScheduleSelection };
const viewText = readFileSync(new URL('../../../src/pages/admin/classes/views/WeeklySchedule.tsx', import.meta.url), 'utf8');
const dialogText = readFileSync(new URL('../../../src/pages/admin/classes/components/ScheduleReservationDialog.tsx', import.meta.url), 'utf8');
function component(source, name, deps) {
  const code = ts.transpile(source.replace(/^import .*;\r?\n/gm, '').replace('export function', 'function'), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  return new Function('React', ...Object.keys(deps), code + '\nreturn ' + name)(React, ...Object.values(deps));
}
const Dialog = component(dialogText, 'ScheduleReservationDialog', {});
const schedules = [schedule], reservations = [reservation];
const selection = () => ({ schedule, date: '2026-11-23', reservations, sourceSchedules: schedules, sourceReservations: reservations, weekKey: '2026-11-23' });
const props = patch => ({ schedules, reservations, weekStart: new Date(2026, 10, 23), showBranch: false, loading: false, ...patch });
function view(selected = null) {
  const state = { value: selected };
  const View = component(viewText, 'WeeklySchedule', { ...model, ScheduleReservationDialog: Dialog, useState: () => [state.value, value => { state.value = value; }] });
  return { state, View, tree: value => View(value), html: value => renderToStaticMarkup(React.createElement(View, value)) };
}
function collect(node, type, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => collect(child, type, result)); return result; }
  if (node.type === type) result.push(node);
  collect(node.props?.children, type, result); return result;
}
test('weekday aliases and minute calculations preserve existing labels', () => {
  assert.deepEqual(scheduleDays, ['월', '화', '수', '목', '금', '토', '일']);
  assert.equal(normalizedScheduleDay('Monday'), '월'); assert.equal(normalizedScheduleDay('토요일'), '토'); assert.equal(normalizedScheduleDay('수'), '수'); assert.equal(minuteOf('14:30:00'), 870);
});
test('date is browser-local calendar date and week date works over month boundary', () => {
  assert.equal(scheduleLocalDate(new Date(2026, 10, 30 + 6)), '2026-12-06');
});
test('calendar geometry retains hour rounding, minimum height and empty fallback', () => {
  assert.deepEqual(scheduleHours(schedules), { startHour: 14, endHour: 16, hourHeight: 72, calendarHeight: 576 });
  assert.deepEqual(scheduleHours([]), { startHour: 6, endHour: 22, hourHeight: 72, calendarHeight: 1152 });
});
test('search keeps class and branch matching without changing source list', () => {
  assert.deepEqual(filterWeeklySchedules(schedules, ' TEST BRANCH '), schedules); assert.deepEqual(filterWeeklySchedules(schedules, 'none'), []); assert.equal(schedules.length, 1);
});
test('selection only remains visible for identical source objects and week while not loading', () => {
  const selected = selection(); assert.equal(currentScheduleSelection(selected, schedules, reservations, '2026-11-23', false), selected);
  for (const args of [[schedules.slice(), reservations, '2026-11-23', false], [schedules, reservations.slice(), '2026-11-23', false], [schedules, reservations, '2026-11-30', false], [schedules, reservations, '2026-11-23', true]]) assert.equal(currentScheduleSelection(selected, ...args), null);
  assert.equal(currentScheduleSelection(null, schedules, reservations, '2026-11-23', false), null);
});
test('render preserves weekly headings, class time and reservation count', () => {
  const html = view().html(props()); assert.match(html, /주간 수업 시간표/); assert.match(html, /월요일/); assert.match(html, /14:30~15:30/); assert.match(html, /예약 1 \/ 10명/); assert.match(html, /min-w-\[1050px\]/);
});
test('branch display is optional and empty view preserves its message', () => {
  assert.doesNotMatch(view().html(props()), /Test branch/); assert.match(view().html(props({ showBranch: true })), /Test branch/);
  assert.match(view().html(props({ schedules: [] })), /등록된 활성 시간표가 없습니다/);
});
test('button selection captures only selected class/date reservations and source references', () => {
  const v = view(); const booked = [reservation, { ...reservation, id: 'other', class_date: '2026-11-24' }]; const button = collect(v.tree(props({ reservations: booked })), 'button')[0];
  button.props.onClick(); assert.equal(v.state.value.sourceSchedules, schedules); assert.equal(v.state.value.sourceReservations, booked); assert.equal(v.state.value.date, '2026-11-23'); assert.equal(v.state.value.reservations.length, 1);
});
test('loading disables old-data interaction and hides captured personal details', () => {
  const v = view(selection()); assert.match(v.html(props()), /Test child/);
  assert.doesNotMatch(v.html(props({ loading: true })), /Test child/); assert.equal(collect(v.tree(props({ loading: true })), 'button')[0].props.disabled, true);
});
test('new data/week hides previous detail before any effect', () => {
  const v = view(selection()); assert.doesNotMatch(v.html(props({ reservations: [] })), /Test child/); assert.doesNotMatch(v.html(props({ weekStart: new Date(2026, 10, 30) })), /Test child/);
});
test('dialog keeps class/date/parent/status and empty reservation fallback', () => {
  const html = renderToStaticMarkup(React.createElement(Dialog, { selected: selection(), onClose() {} })); assert.match(html, /예약 명단/); assert.match(html, /2026-11-23/); assert.match(html, /Test parent/); assert.match(html, /synthetic/); assert.match(html, /yet/);
  assert.match(renderToStaticMarkup(React.createElement(Dialog, { selected: { ...selection(), reservations: [] }, onClose() {} })), /이 수업에 예약된 자녀가 없습니다/);
});
test('dialog close/backdrop callbacks remain wired and content stops propagation', () => {
  let closes = 0, stops = 0; const tree = Dialog({ selected: selection(), onClose: () => { closes++; } }); tree.props.onClick(); collect(tree, 'button')[0].props.onClick(); tree.props.children.props.onClick({ stopPropagation: () => { stops++; } }); assert.equal(closes, 2); assert.equal(stops, 1);
});
test('closing selected detail clears local state', () => {
  const v = view(selection()); const tree = v.tree(props()); collect(tree, Dialog)[0].props.onClose(); assert.equal(v.state.value, null);
});
test('parent uses stable filtered data and remount key for profile/branch/week/request changes', () => {
  const source = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /function WeeklySchedule\(/); assert.match(source, /useMemo\(\(\) => filterWeeklySchedules\(schedules, search\), \[schedules, search\]\)/);
  assert.match(source, /key=\{JSON.stringify\(\[profile\?\.id, branchFilter, localDate\(weekStart\), scheduleReadRequest.current\]\)\}/);
  assert.doesNotMatch(viewText + dialogText, /supabase|\.phone\s*\)|console\./);
});
