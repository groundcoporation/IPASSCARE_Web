import React from 'react';
import {createRoot} from 'react-dom/client';
import PreviewAdminEntry from '../../src/tester/PreviewAdminEntry';
import '../../src/index.css';

// Real form/Auth calls against the disposable local stack. This fixture does
// not authenticate for the user, override profile checks or mock API results.
createRoot(document.getElementById('root')!).render(<PreviewAdminEntry/>);
