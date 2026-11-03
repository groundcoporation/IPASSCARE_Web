import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { servicePlans, coreServiceFeatures } from '../src/data/servicePlans.ts';
import { isCurrentPublicManual } from '../src/data/publicManuals.ts';
import { calculateServiceSimulation, simulationDefaults } from '../src/data/serviceSimulation.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = relative => readFileSync(resolve(root, relative), 'utf8');

// Compile only the pure marketing components in memory. No browser, auth or DB writes.
function loadComponent(relative) {
  const file = resolve(root, relative);
  const source = readFileSync(file, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, `Invalid component syntax: ${relative}`);
  const module = { exports: {} };
  const localRequire = id => id.startsWith('.')
    ? loadComponent(resolve(dirname(file), id.endsWith('.ts') ? id : `${id}.ts`))
    : require(id);
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}

test('published plans match the confirmed monthly prices', () => {
  assert.deepEqual(servicePlans.map(({ name, monthlyPrice }) => [name, monthlyPrice]), [
    ['Lite (베이직)', 39900], ['Lite (라이트)', 69900], ['Pro (프로)', 99000], ['Enterprise (엔터프라이즈)', 119900],
  ]);
  assert.equal(servicePlans[0].description, '전용 단말기(태블릿) 미포함');
  assert.equal(servicePlans[2].description, '전용 단말기(태블릿) 미포함');
  assert.equal(servicePlans[3].description, '전용 단말기(태블릿) 제공');
  assert.deepEqual(servicePlans.map(({ recommendation }) => recommendation), [
    { students: '30명 이하', shuttles: '1대' },
    { students: '50명 이하', shuttles: '1대' },
    { students: '50명 초과', shuttles: '1대 이상' },
    { students: '50명 초과', shuttles: '3대 이상' },
  ]);
  assert.deepEqual(coreServiceFeatures, ['실시간 차량 위치', '승하차 알림', '운행 관리']);
});

test('hero keeps the original introduction without prices or storefronts', () => {
  const hero = read('src/components/HeroSection.tsx');
  assert.match(hero, /학부모 안심 케어 & 학원 관리 통합 스마트 플랫폼/);
  assert.match(hero, /원비 결제·포인트 혜택/);
  assert.match(hero, /실시간 GPS 셔틀 관제, 원터치 출결 알림, 모바일 원비 결제/);
  assert.doesNotMatch(hero, /30명|프라임|월 3만원|월 5만원|월 10만원|쇼핑몰|자사몰/);
});

test('simulation uses current plan fees and transparent editable assumptions', () => {
  const result = calculateServiceSimulation(simulationDefaults);
  assert.equal(result.savedHours, 46.5);
  assert.equal(result.monthlyCost, 99000);
  assert.equal(result.vatAmount, 9900);
  assert.equal(result.monthlyCostIncludingVat, 108900);
  assert.equal(result.timeValue, 558000);
  assert.equal(result.recoveredAmount, 0);
  assert.equal(result.monthlyNetValue, 449100);
  assert.equal(result.annualNetValue, 5389200);
  for (const plan of servicePlans) {
    const actual = calculateServiceSimulation({ ...simulationDefaults, students: 30, planId: plan.id });
    assert.equal(actual.monthlyCost, plan.monthlyPrice);
    assert.equal(actual.vatAmount, Math.round(plan.monthlyPrice * 0.1));
    assert.equal(actual.monthlyNetValue, actual.timeValue - actual.monthlyCostIncludingVat);
  }
});

test('simulation handles all student counts, zero shuttles, negative value and invalid inputs', () => {
  assert.equal(typeof calculateServiceSimulation({ ...simulationDefaults, students: 300 }).monthlyNetValue, 'number');
  const costOnly = calculateServiceSimulation({ ...simulationDefaults, shuttles: 0, minutesPerStudent: 0 });
  assert.equal(costOnly.savedHours, 0);
  assert.equal(costOnly.monthlyNetValue, -108900);
  const optionalRecovery = calculateServiceSimulation({ ...simulationDefaults, recoveryPercent: 5 });
  assert.equal(optionalRecovery.recoveredAmount, 450000);
  for (const invalid of [{ students: 0 }, { shuttles: -1 }, { avgTuition: NaN }, { recoveryPercent: 101 }]) {
    assert.throws(() => calculateServiceSimulation({ ...simulationDefaults, ...invalid }), /SIMULATION_INPUT_INVALID/);
  }
});

test('pricing renders four current plans with VAT and device terms', () => {
  const { PricingSection } = loadComponent('src/components/PricingSection.tsx');
  const html = renderToStaticMarkup(React.createElement(PricingSection, { onOpenInquiry() {} }));
  for (const text of ['Lite (베이직)', 'Lite (라이트)', 'Pro (프로)', 'Enterprise (엔터프라이즈)', '39,900원', '69,900원', '99,000원', '119,900원', 'VAT 별도', 'VAT 포함', '추천 운영 규모', '원생 30명 이하', '원생 50명 이하', '원생 50명 초과', '차량 1대', '차량 1대 이상', '차량 3대 이상', '태블릿) 제공', '자동이체', ...coreServiceFeatures]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<article/g) || []).length, 4);
  assert.doesNotMatch(html, /118,000|프라임|30명까지 무료|약정|자동 회수|커스텀 케어|태블릿\) 1대 제공/);
  const app = read('src/App.tsx');
  assert.match(app, /<PricingSection /);
  assert.doesNotMatch(app, /RoiCalculator/);
});

test('phone home matches the app journal menu and has no storefront', () => {
  const { AppHomeMockup } = loadComponent('src/components/AppHomeMockup.tsx');
  const html = renderToStaticMarkup(React.createElement(AppHomeMockup));
  assert.match(html, /학습·상담일지 화면 보기/);
  assert.doesNotMatch(html, /쇼핑몰|ShoppingBag|VOG SPORTS/);
  const mockup = read('src/components/AppHomeMockup.tsx');
  for (const label of ['학습일지', '상담일지', '아이의 학원 생활 기록', '학습 내용과 상담 기록을 한눈에 확인하세요.']) assert.ok(mockup.includes(label), label);
  assert.match(mockup, /setScreen\(menu.screen\)/);
  assert.match(mockup, /entry.type === journalFilter/);
});

test('core feature cards focus on movement and learning records', () => {
  const { FeatureGrid } = loadComponent('src/components/FeatureGrid.tsx');
  const html = renderToStaticMarkup(React.createElement(FeatureGrid));
  for (const label of [...coreServiceFeatures, '학습·상담일지']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /쇼핑몰|자사몰|VOG SPORTS|0.1초/);
});

test('previously registered storefront guides cannot reappear publicly', () => {
  const guide = { title: '이용 안내', description: '사용 방법', steps: ['앱 실행'] };
  assert.equal(isCurrentPublicManual(guide), true);
  for (const text of ['쇼핑몰', '자사몰', 'VOG SPORTS', 'vog sports', '영카트']) {
    assert.equal(isCurrentPublicManual({ ...guide, title: text }), false);
    assert.equal(isCurrentPublicManual({ ...guide, description: text }), false);
    assert.equal(isCurrentPublicManual({ ...guide, steps: [text] }), false);
  }
  assert.equal(isCurrentPublicManual({ ...guide, title: '학습·상담일지' }), true);
});
