import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AdminStudyTab } from '../../src/components/admin/AdminStudyTab';
import { AdminCounselTab } from '../../src/components/admin/AdminCounselTab';

const props = { activeBranchId: 'branch-a', branches: [{ id: 'branch-a', name: '테스트 지점' }], profile: { name: '테스트 선생님' } };
createRoot(document.getElementById('root')!).render(
  <main className="mx-auto min-w-0 max-w-6xl p-3">
    {new URLSearchParams(location.search).has('counsel') ? <AdminCounselTab {...props} /> : <AdminStudyTab {...props} />}
  </main>,
);
