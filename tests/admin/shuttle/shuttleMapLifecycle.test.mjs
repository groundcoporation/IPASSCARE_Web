import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import ts from 'typescript';
import { spotPosition } from '../../../src/pages/admin/shuttle/model/spotPosition.ts';
const source = readFileSync(new URL('../../../src/pages/admin/shuttle/components/SpotLocationPicker.tsx', import.meta.url), 'utf8');
function fakeBrowser(ready = true) {
  const state = { scripts: [], maps: [], markers: [], listeners: [], removed: [] };
  const sdk = { maps: {
    LatLng: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } lat() { return this.latitude; } lng() { return this.longitude; } },
    Map: class { constructor(container, options) { this.container = container; this.options = options; state.maps.push(this); } setCenter(value) { this.center = value; } },
    Marker: class { constructor(options) { Object.assign(this, options); state.markers.push(this); } setVisible(v) { this.visible = v; } setPosition(v) { this.position = v; } setMap(v) { this.map = v; } },
    Event: { addListener(target, type, callback) { const listener = { target, type, callback }; state.listeners.push(listener); return listener; }, removeListener(listener) { state.removed.push(listener); } },
  } };
  const window = ready ? { naver: sdk } : {};
  const document = { querySelector: () => state.scripts[0] ?? null,
    createElement() { const listeners = new Map(); return { dataset: {}, listeners,
      addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      emit(type) { for (const callback of [...(listeners.get(type) ?? [])]) callback(); },
    }; }, head: { appendChild: node => state.scripts.push(node) } };
  return { state, window, document, sdk };
}
function mount(browser = fakeBrowser()) {
  const slots = []; let index = 0; const pending = []; const errors = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const useRef = value => { const i = index++; return slots[i] ??= { current: value }; };
  const useState = value => { const i = index++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = next; errors.push(next); }]; };
  const useEffect = (fn, deps) => { const i = index++; const old = slots[i]; if (!old || !same(old.deps, deps)) { old?.cleanup?.(); const next = { deps }; slots[i] = next; pending.push(() => { next.cleanup = fn(); }); } };
  const code = ts.transpile(source.replace(/^import .*;\r?\n/gm, '').replace('export const SpotLocationPicker', 'const SpotLocationPicker').replace('import.meta.env.VITE_NAVER_MAP_CLIENT_ID', 'clientIdForTest'), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React });
  const render = (props, client = 'synthetic-public-id') => {
    index = 0;
    const View = new Function('React', 'useRef', 'useState', 'useEffect', 'spotPosition', 'window', 'document', 'clientIdForTest', code + '\nreturn SpotLocationPicker;')(React, useRef, useState, useEffect, spotPosition, browser.window, browser.document, client);
    const tree = View(props); slots[0].current ??= {}; while (pending.length) pending.shift()(); return tree;
  };
  return { browser, errors, render, unmount: () => { slots.forEach(slot => slot?.cleanup?.()); }, slots };
}
const props = patch => ({ lat: '37.5', lng: '127.1', onPick() {}, ...patch });
const coord = (lat = 37.6, lng = 127.2) => ({ coord: { lat: () => lat, lng: () => lng } });
test('coordinates retain zero-as-unset and reject invalid/empty/out-of-range values', () => {
  assert.deepEqual(spotPosition('37.5', '127.1'), { lat: 37.5, lng: 127.1 });
  for (const [lat, lng] of [['', '127'], ['0', '127'], ['NaN', '127'], ['91', '127'], ['37', '181'], ['37', '']]) assert.equal(spotPosition(lat, lng), null);
});
test('coordinate/onPick updates do not rebuild map and events use latest callback', () => {
  const picked = []; const m = mount(); m.render(props({ onPick: () => picked.push('old') })); m.render(props({ lat: '37.7', onPick: (lat, lng) => picked.push([lat, lng]) }));
  assert.equal(m.browser.state.maps.length, 1); assert.equal(m.browser.state.listeners.length, 2); m.browser.state.listeners[0].callback(coord()); assert.deepEqual(picked, [[37.6, 127.2]]);
});
test('late SDK load uses latest form coordinates instead of initial closure', () => {
  const b = fakeBrowser(false); const m = mount(b); m.render(props()); m.render(props({ lat: '38.0', lng: '128.0' }));
  assert.equal(b.state.scripts.length, 1); b.window.naver = b.sdk; b.state.scripts[0].emit('load'); assert.equal(b.state.maps[0].options.center.lat(), 38); assert.equal(b.state.maps[0].options.center.lng(), 128);
});
test('unmount removes click and drag listeners and detaches marker; queued callbacks are inert', () => {
  let picks = 0; const m = mount(); m.render(props({ onPick: () => { picks++; } })); const callbacks = m.browser.state.listeners.map(x => x.callback); m.unmount();
  assert.equal(m.browser.state.removed.length, 2); assert.equal(m.browser.state.markers[0].map, null); callbacks.forEach(fn => fn(coord())); assert.equal(picks, 0); assert.equal(m.slots[1].current, null); assert.equal(m.slots[2].current, null);
});
test('pending script listeners are removed and captured old load/error cannot update after unmount', () => {
  const b = fakeBrowser(false); const m = mount(b); m.render(props()); const script = b.state.scripts[0]; const load = [...script.listeners.get('load')][0], error = [...script.listeners.get('error')][0]; m.unmount();
  assert.equal(script.listeners.get('load').size, 0); assert.equal(script.listeners.get('error').size, 0); b.window.naver = b.sdk; load(); error(); assert.equal(b.state.maps.length, 0); assert.deepEqual(m.errors, []);
});
test('shared script is reused and retained when one instance closes', () => {
  const b = fakeBrowser(false); const first = mount(b), second = mount(b); first.render(props()); second.render(props()); assert.equal(b.state.scripts.length, 1); first.unmount(); assert.equal(b.state.scripts[0].listeners.get('load').size, 1);
  b.window.naver = b.sdk; b.state.scripts[0].emit('load'); assert.equal(b.state.maps.length, 1); assert.equal(b.state.scripts.length, 1);
});
test('invalid form coordinate hides marker and later valid edit resynchronizes without rebuild', () => {
  const m = mount(); m.render(props()); m.render(props({ lat: '' })); assert.equal(m.browser.state.markers[0].visible, false); m.render(props({ lat: '38' })); assert.equal(m.browser.state.markers[0].visible, true); assert.equal(m.browser.state.maps[0].center.lat(), 38); assert.equal(m.browser.state.maps.length, 1);
});
test('invalid event coordinates cannot call form updater', () => {
  let picks = 0; const m = mount(); m.render(props({ onPick: () => { picks++; } })); m.browser.state.listeners[0].callback(coord(100, 200)); assert.equal(picks, 0);
});
test('configuration error starts no script/map and SDK load failure uses existing safe text', () => {
  const m = mount(fakeBrowser(false)); m.render(props(), ''); assert.match(m.errors.at(-1), /Client ID/); assert.equal(m.browser.state.scripts.length, 0);
  const b = fakeBrowser(false); const failure = mount(b); failure.render(props()); b.state.scripts[0].emit('error'); assert.match(failure.errors.at(-1), /로드에 실패/);
});
test('effect reinitialization cleans old listener ownership and ignores old callbacks', () => {
  let picks = 0; const m = mount(); m.render(props({ onPick: () => { picks++; } })); const old = m.browser.state.listeners[0].callback; m.render(props({ onPick: () => { picks++; } }), 'new-public-id'); old(coord()); assert.equal(picks, 0); assert.equal(m.browser.state.removed.length, 2); assert.equal(m.browser.state.maps.length, 2);
});
const parent = readFileSync(new URL('../../../src/pages/admin/shuttle/views/AdminShuttleTab.tsx', import.meta.url), 'utf8');
test('route form updater is stable, functional and editor load uses its dependency', () => {
  assert.match(parent, /const updateForm = useCallback\(.*\[setForm\]\)/); assert.match(parent, /\[branchId, form.id, updateForm\]/);
  assert.match(parent, /if \(!cancelled\) await handleError\(error, 'SHUTTLE_ROUTE_SAVE_FAILED'/);
});
test('picker remains separate, init effect does not depend on coordinate/callback identity', () => {
  assert.doesNotMatch(parent, /const SpotLocationPicker =/); assert.match(source, /\}, \[clientId\]\)/); assert.match(source, /\}, \[lat, lng\]\)/); assert.match(source, /onPickRef.current\(picked.lat, picked.lng\)/);
});
