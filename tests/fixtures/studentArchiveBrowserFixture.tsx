import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AdminStudentTab } from '../../src/components/admin/AdminStudentTab';

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto w-full max-w-5xl p-3">
    <AdminStudentTab activeBranchId="branch-a" branches={[{ id: 'branch-a', name: '테스트 본점' }]} />
  </main>,
);
