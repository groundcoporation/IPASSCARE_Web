import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdminPage} from '../../src/components/admin/AdminPage';
import {supabase} from '../../src/lib/supabaseClient';
import '../../src/index.css';
declare global { interface Window { liveFixture:{email:string;password:string;branch:string}; } }
const fixture=window.liveFixture as Window['liveFixture']&{attendanceEmail:string;attendancePassword:string};
const {data,error}=await supabase.auth.signInWithPassword({email:fixture.attendanceEmail,password:fixture.attendancePassword});
if(error||!data.user)throw new Error('LOCAL_FIXTURE_AUTH_FAILED');
// Normal local director flow; do not bypass the production tester/Preview gate.
createRoot(document.getElementById('root')!).render(<AdminPage onBackToSite={()=>{}}/>);
