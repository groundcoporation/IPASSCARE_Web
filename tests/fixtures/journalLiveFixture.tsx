import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminStudyTab} from '../../src/components/admin/AdminStudyTab';
import {AdminCounselTab} from '../../src/components/admin/AdminCounselTab';
import {supabase} from '../../src/lib/supabaseClient';
import '../../src/index.css';
declare global { interface Window { liveFixture:{email:string;password:string;branch:string}; } }
const fixture=window.liveFixture;
const {data,error}=await supabase.auth.signInWithPassword({email:fixture.email,password:fixture.password});
if(error||!data.user)throw new Error('LOCAL_FIXTURE_AUTH_FAILED');
const props={activeBranchId:fixture.branch,branches:[{id:fixture.branch,name:'가상 E2E 지점'}],profile:{name:'가상 E2E 원장',role:'director'}};
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('counsel')
  ? <AdminCounselTab {...props}/> : <AdminStudyTab {...props}/>);
