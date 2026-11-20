import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminTeacherTab} from '../../src/components/admin/AdminTeacherTab';
import '../../src/index.css';
import {supabase} from '../../src/lib/supabaseClient';
declare global { interface Window { liveFixture:{email:string;password:string;branch:string}; } }
const fixture=window.liveFixture;
const {data,error}=await supabase.auth.signInWithPassword({email:fixture.email,password:fixture.password});
if(error||!data.user)throw new Error('LOCAL_FIXTURE_AUTH_FAILED');
createRoot(document.getElementById('root')!).render(<AdminTeacherTab activeBranchId={fixture.branch}
  branches={[{id:fixture.branch,name:'가상 E2E 지점'}]} profile={{role:'director'}} />);
