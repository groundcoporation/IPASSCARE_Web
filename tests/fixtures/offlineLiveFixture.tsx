import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminOfflinePaymentTab} from '../../src/components/admin/AdminOfflinePaymentTab';
import {supabase} from '../../src/lib/supabaseClient';
import '../../src/index.css';
declare global { interface Window { liveFixture:{email:string;password:string;branch:string}; } }
const fixture=window.liveFixture;
const {data,error}=await supabase.auth.signInWithPassword({email:fixture.email,password:fixture.password});
if(error||!data.user)throw new Error('LOCAL_FIXTURE_AUTH_FAILED');
createRoot(document.getElementById('root')!).render(<AdminOfflinePaymentTab activeBranchId={fixture.branch}/>);
