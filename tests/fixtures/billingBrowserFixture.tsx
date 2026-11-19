import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AdminBillingTab } from '../../src/components/admin/AdminBillingTab';

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto w-full max-w-[52rem] p-3">
    <AdminBillingTab activeBranchId="all" branches={[{ id: 'branch', name: '테스트 지점' }]} />
  </main>,
);
