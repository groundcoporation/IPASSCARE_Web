import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Search, Upload, Loader2, Link2, Link2Off } from 'lucide-react';
import ExcelJS from 'exceljs';

interface Student {
  id: string;
  parent_user_id: string | null;
  child_id: string | null;
  branch_id: string;
  student_name: string;
  attendance_code: string;
  mother_phone: string | null;
  father_phone: string | null;
  student_phone: string | null;
  birth_date: string | null;
  school_name: string | null;
  grade_level: string | null;
  address: string | null;
  admission_date: string | null;
  memo: string | null;
  is_sms_enabled: boolean;
  created_at: string;
  // App linking join fields
  parent_user?: {
    name: string;
    email: string;
  } | null;
  // Joined classes
  academy_student_classes?: Array<{
    class_schedule_id: string;
    package_option_id: string | null;
    billing_cycle: string | null;
    payment_day: string | null;
    class_schedules: {
      target_class: string;
    } | null;
  }>;
}

interface ClassSchedule {
  id: string;
  target_class: string;
  branch_id: string | null;
}

interface PackageOption {
  id: string;
  label: string;
  price: number;
  branch_id: string;
  packages: {
    name: string;
  } | null;
}

interface AdminStudentTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

export const AdminStudentTab: React.FC<AdminStudentTabProps> = ({ activeBranchId, branches }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [packageOptions, setPackageOptions] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [attendanceCode, setAttendanceCode] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [address, setAddress] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [memo, setMemo] = useState('');
  const [isSmsEnabled, setIsSmsEnabled] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState(''); // Target Class selection
  const [packageOptionId, setPackageOptionId] = useState(''); // Target Package Option selection
  const [billingCycle, setBillingCycle] = useState('월 기간제');
  const [paymentDay, setPaymentDay] = useState('매월 1일');
  const [saveLoading, setSaveLoading] = useState(false);

  // Load students, classes, & package options
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load class schedules for assigning
      let classesQuery = supabase.from('class_schedules').select('id, target_class, branch_id');
      if (activeBranchId) {
        classesQuery = classesQuery.eq('branch_id', activeBranchId);
      }
      const { data: classesData } = await classesQuery;
      setClasses((classesData || []) as ClassSchedule[]);

      // 2. Load package options for pricing
      let packagesQuery = supabase.from('package_options').select('id, label, price, branch_id, packages(name)');
      if (activeBranchId) {
        packagesQuery = packagesQuery.eq('branch_id', activeBranchId);
      }
      const { data: packageData } = await packagesQuery;
      setPackageOptions((packageData || []) as any[]);

      // 3. Load students
      let studentsQuery = supabase.from('academy_students').select(`
        *,
        parent_user:users(name, email),
        academy_student_classes(
          class_schedule_id,
          package_option_id,
          billing_cycle,
          payment_day,
          class_schedules(target_class)
        )
      `);
      if (activeBranchId) {
        studentsQuery = studentsQuery.eq('branch_id', activeBranchId);
      }
      const { data: studentsData, error } = await studentsQuery;
      if (!error && studentsData) {
        setStudents(studentsData as any[]);
      }
    } catch (err) {
      console.error('Error loading students page data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeBranchId]);

  // Open modal for registration/edit
  const openModal = (student?: Student) => {
    if (student) {
      setEditingId(student.id);
      setSelectedBranchId(student.branch_id);
      setStudentName(student.student_name);
      setAttendanceCode(student.attendance_code);
      setMotherPhone(student.mother_phone || '');
      setFatherPhone(student.father_phone || '');
      setStudentPhone(student.student_phone || '');
      setBirthDate(student.birth_date || '');
      setSchoolName(student.school_name || '');
      setGradeLevel(student.grade_level || '');
      setAddress(student.address || '');
      setAdmissionDate(student.admission_date || '');
      setMemo(student.memo || '');
      setIsSmsEnabled(student.is_sms_enabled);

      // Get first assigned class details if exists
      const firstClass = student.academy_student_classes?.[0];
      setSelectedClassId(firstClass?.class_schedule_id || '');
      setPackageOptionId(firstClass?.package_option_id || '');
      setBillingCycle(firstClass?.billing_cycle || '월 기간제');
      setPaymentDay(firstClass?.payment_day || '매월 1일');
    } else {
      setEditingId(null);
      setSelectedBranchId(activeBranchId || (branches.length > 0 ? branches[0].id : ''));
      setStudentName('');
      setAttendanceCode('');
      setMotherPhone('');
      setFatherPhone('');
      setStudentPhone('');
      setBirthDate('');
      setSchoolName('');
      setGradeLevel('');
      setAddress('');
      setAdmissionDate(new Date().toISOString().slice(0, 10));
      setMemo('');
      setIsSmsEnabled(true);
      setSelectedClassId('');
      setPackageOptionId('');
      setBillingCycle('월 기간제');
      setPaymentDay('매월 1일');
    }
    setIsModalOpen(true);
  };

  // Helper to search and link parent user in real-time
  const linkParentAccount = async (mother: string, father: string): Promise<string | null> => {
    const cleanMother = mother.replace(/[^0-9]/g, '');
    const cleanFather = father.replace(/[^0-9]/g, '');

    if (!cleanMother && !cleanFather) return null;

    // Search users table for a matching phone number
    const phones = [cleanMother, cleanFather].filter(Boolean);
    const { data } = await supabase
      .from('users')
      .select('id, phone')
      .in('phone', phones)
      .limit(1);

    return data && data.length > 0 ? data[0].id : null;
  };

  // Save or Update Student
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return alert('학생 이름을 입력해주세요.');
    if (!attendanceCode.trim()) return alert('출결번호를 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');
    if (selectedClassId && !packageOptionId) return alert('수업반을 배정할 때는 수강료 요금제(패키지)도 반드시 지정해 주셔야 합니다.');

    setSaveLoading(true);
    try {
      // Auto-check and link parent account
      const parentId = await linkParentAccount(motherPhone, fatherPhone);

      const studentPayload = {
        branch_id: selectedBranchId,
        student_name: studentName.trim(),
        attendance_code: attendanceCode.trim(),
        mother_phone: motherPhone.trim() || null,
        father_phone: fatherPhone.trim() || null,
        student_phone: studentPhone.trim() || null,
        birth_date: birthDate || null,
        school_name: schoolName.trim() || null,
        grade_level: gradeLevel.trim() || null,
        address: address.trim() || null,
        admission_date: admissionDate || null,
        memo: memo.trim() || null,
        is_sms_enabled: isSmsEnabled,
        parent_user_id: parentId
      };

      let studentId = editingId;
      if (editingId) {
        // Update Student
        const { error } = await supabase
          .from('academy_students')
          .update(studentPayload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Insert Student
        const { data, error } = await supabase
          .from('academy_students')
          .insert([studentPayload])
          .select('id')
          .single();
        if (error) throw error;
        studentId = data.id;
      }

      // Manage Class Assignment Mapping with specific pricing option!
      if (studentId) {
        // Delete existing mapping if editing
        if (editingId) {
          await supabase
            .from('academy_student_classes')
            .delete()
            .eq('student_id', studentId);
        }

        // Insert new class mapping if a class is selected
        if (selectedClassId) {
          await supabase
            .from('academy_student_classes')
            .insert([{
              student_id: studentId,
              class_schedule_id: selectedClassId,
              package_option_id: packageOptionId || null,
              billing_cycle: billingCycle,
              payment_day: paymentDay,
              status: 'active'
            }]);
        }
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete Student
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`정말 '${name}' 학생 정보를 삭제하시겠습니까?\n이 학생의 출결 기록 및 요금 청구 내역도 연계되어 삭제될 수 있습니다.`)) return;

    try {
      const { error } = await supabase
        .from('academy_students')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  };

  // Excel File Batch Import Handler
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const currentBranch = activeBranchId || (branches.length > 0 ? branches[0].id : '');
    if (!currentBranch || currentBranch === 'all') {
      alert('지점을 먼저 특정해주세요. (상단 지점 필터에서 특정 지점을 선택해야 엑셀 일괄 등록이 가능합니다.)');
      e.target.value = '';
      return;
    }

    if (!confirm(`선택한 엑셀 파일로 학생 정보를 일괄 업로드하시겠습니까?\n선택된 소속 지점: ${branches.find(b => b.id === currentBranch)?.name}`)) {
      e.target.value = '';
      return;
    }

    setExcelLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];

          const importedStudents: any[] = [];
          const classMappingRequests: Array<{ studentIndex: number; className: string; amountText: string }> = [];

          // Read row by row starting from index 2 (skip header)
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Header row

            const className = row.getCell(1).text?.trim(); // 클래스
            const name = row.getCell(2).text?.trim();      // 이름
            const code = row.getCell(3).text?.trim();      // 출결번호
            
            // Collect SMS check values to parse amount fallback if needed
            const motherPhoneVal = row.getCell(7).text?.trim().replace(/[^0-9]/g, '');
            const fatherPhoneVal = row.getCell(8).text?.trim().replace(/[^0-9]/g, '');
            const studentPhoneVal = row.getCell(9).text?.trim().replace(/[^0-9]/g, '');
            
            const rawBirth = row.getCell(10).text?.trim(); // 생년월일 YYYYMMDD
            let birthStr = null;
            if (rawBirth && rawBirth.length === 8) {
              birthStr = `${rawBirth.slice(0, 4)}-${rawBirth.slice(4, 6)}-${rawBirth.slice(6, 8)}`;
            }

            const school = row.getCell(11).text?.trim(); // 학교
            const grade = row.getCell(12).text?.trim();  // 학년
            const addr = row.getCell(13).text?.trim();   // 주소
            const memoText = row.getCell(14).text?.trim(); // 메모
            
            const rawAdmission = row.getCell(15).text?.trim(); // 입회일 YYYYMMDD
            let admissionStr = new Date().toISOString().slice(0, 10);
            if (rawAdmission && rawAdmission.length === 8) {
              admissionStr = `${rawAdmission.slice(0, 4)}-${rawAdmission.slice(4, 6)}-${rawAdmission.slice(6, 8)}`;
            }

            if (!name || !code) return; // 필수값 유무 체크

            importedStudents.push({
              branch_id: currentBranch,
              student_name: name,
              attendance_code: code,
              mother_phone: motherPhoneVal || null,
              father_phone: fatherPhoneVal || null,
              student_phone: studentPhoneVal || null,
              birth_date: birthStr,
              school_name: school || null,
              grade_level: grade || null,
              address: addr || null,
              admission_date: admissionStr,
              memo: memoText || null,
              is_sms_enabled: true
            });

            // Read the class name cell.
            if (className) {
              classMappingRequests.push({
                studentIndex: importedStudents.length - 1,
                className,
                // We fallback mapping based on weekly limits or default pricing options in package options.
                amountText: ''
              });
            }
          });

          if (importedStudents.length === 0) {
            alert('엑셀 시트에서 등록 가능한 학생 데이터를 발견하지 못했습니다.');
            setExcelLoading(false);
            return;
          }

          // Fetch matching app accounts and insert
          let insertedCount = 0;
          for (let i = 0; i < importedStudents.length; i++) {
            const student = importedStudents[i];
            
            // Real-time link parent
            const parentId = await linkParentAccount(student.mother_phone || '', student.father_phone || '');
            student.parent_user_id = parentId;

            // Insert Student record
            const { data: sData, error: sErr } = await supabase
              .from('academy_students')
              .insert([student])
              .select('id')
              .single();

            if (!sErr && sData) {
              insertedCount++;

              // Assign to Class & Map default pricing option!
              const mappingReq = classMappingRequests.find(r => r.studentIndex === i);
              if (mappingReq) {
                // Find class by name in this branch
                const matchedClass = classes.find(c => c.target_class.trim() === mappingReq.className);
                if (matchedClass) {
                  // Find a default/first package option for this branch as fallback
                  const defaultOpt = packageOptions.find(p => p.branch_id === currentBranch) || null;
                  
                  await supabase
                    .from('academy_student_classes')
                    .insert([{
                      student_id: sData.id,
                      class_schedule_id: matchedClass.id,
                      package_option_id: defaultOpt?.id || null,
                      billing_cycle: '월 기간제',
                      payment_day: '매월 1일',
                      status: 'active'
                    }]);
                }
              }
            }
          }

          alert(`성공적으로 ${insertedCount}명의 학생 정보를 일괄 등록 완료했습니다!`);
          loadData();
        } catch (err: any) {
          alert(`엑셀 파일 처리 중 에러가 발생했습니다: ${err.message}`);
        } finally {
          setExcelLoading(false);
          e.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      alert(`파일 업로드 실패: ${err.message}`);
      setExcelLoading(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const assignedClass = student.academy_student_classes?.[0]?.class_schedules?.target_class || '';
    
    return (
      student.student_name.toLowerCase().includes(query) ||
      (student.mother_phone && student.mother_phone.includes(query)) ||
      (student.father_phone && student.father_phone.includes(query)) ||
      (student.student_phone && student.student_phone.includes(query)) ||
      assignedClass.toLowerCase().includes(query) ||
      (student.school_name && student.school_name.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            👥 학생 원생 명부 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            원생 정보를 추가하거나, 기존 프로그램의 엑셀 백업 파일을 업로드하여 일괄 등록 및 관리합니다.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          {/* Excel Upload Input */}
          <label className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs cursor-pointer">
            <Upload size={16} />
            {excelLoading ? '업로드 처리 중...' : '엑셀 일괄 등록'}
            <input 
              type="file" 
              accept=".xlsx"
              onChange={handleExcelUpload}
              disabled={excelLoading}
              className="hidden"
            />
          </label>

          <button 
            onClick={() => openModal()}
            className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm"
          >
            <Plus size={16} />
            학생 직접 등록
          </button>
        </div>
      </div>

      {/* Toolbar Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text"
          placeholder="학생 이름, 연락처, 소속반, 학교명으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-2xl bg-slate-100 py-3.5 pl-11 pr-4 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Student List View */}
      {loading ? (
        <div className="py-24 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={24} />
          <span>원생 명부 불러오는 중...</span>
        </div>
      ) : filteredStudents.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4">이름 (출결번호)</th>
                  <th scope="col" className="px-6 py-4">수강 수업반</th>
                  <th scope="col" className="px-6 py-4">부모 연락망</th>
                  <th scope="col" className="px-6 py-4">학교 / 학년</th>
                  <th scope="col" className="px-6 py-4">입회일</th>
                  <th scope="col" className="px-6 py-4">어플 연동 여부</th>
                  <th scope="col" className="px-6 py-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {filteredStudents.map((student) => {
                  const hasAppLinked = student.parent_user_id !== null;
                  const assignedClassName = student.academy_student_classes?.[0]?.class_schedules?.target_class || '배정 안 됨';
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 text-sm">{student.student_name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">코드: {student.attendance_code}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-bold ${
                          student.academy_student_classes?.length ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {assignedClassName}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-700">
                        <div className="flex flex-col gap-0.5">
                          {student.mother_phone && <span>👩 <b>어머니:</b> {student.mother_phone}</span>}
                          {student.father_phone && <span>👨 <b>아버지:</b> {student.father_phone}</span>}
                          {student.student_phone && <span>📱 <b>학생:</b> {student.student_phone}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="flex flex-col font-bold">
                          <span>{student.school_name || '-'}</span>
                          <span className="text-slate-400 mt-0.5">{student.grade_level || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {student.admission_date ? new Date(student.admission_date).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {hasAppLinked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                            <Link2 size={12} />
                            연동 완료 (@{student.parent_user?.name})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-400 font-bold px-2.5 py-1 rounded-full border border-slate-200/50">
                            <Link2Off size={12} />
                            앱 미가입
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openModal(student)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(student.id, student.student_name)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 text-slate-400 font-bold text-sm bg-white rounded-2xl border border-dashed border-slate-200">
          일치하는 학생 정보가 없습니다. 첫 원생을 등록해 보세요!
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setIsModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {editingId ? 'STUDENT EDIT' : 'STUDENT REGISTER'}
                </span>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  {editingId ? `${studentName} 원생 정보 수정` : '새 원생 개별 등록'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">닫기</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Branch */}
              {activeBranchId === null && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">지점 소속 선택 *</label>
                  <select 
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">지점을 선택해주세요</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 이름 *</label>
                  <input 
                    type="text" 
                    placeholder="예: 홍길동"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">출결 등원 번호 *</label>
                  <input 
                    type="text" 
                    placeholder="예: 1234"
                    value={attendanceCode}
                    onChange={(e) => setAttendanceCode(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Class & Package Assignment Split */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수강 반 배정</label>
                  <select 
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">수업반 배정 안함 (미지정)</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.target_class}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수강료 요금제(패키지) *</label>
                  <select 
                    value={packageOptionId}
                    onChange={(e) => setPackageOptionId(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required={!!selectedClassId}
                  >
                    <option value="">수강 요금제 선택</option>
                    {packageOptions.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.packages?.name || '패키지'}] {p.label} ({p.price.toLocaleString()}원)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Billing Cycle Details */}
              {selectedClassId && (
                <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">납부 주기 방식</label>
                    <select 
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value)}
                      className="w-full rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="월 기간제">월 기간제</option>
                      <option value="분기제">분기제</option>
                      <option value="횟수 쿠폰제">횟수 쿠폰제</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">매월 수납 기준일</label>
                    <select 
                      value={paymentDay}
                      onChange={(e) => setPaymentDay(e.target.value)}
                      className="w-full rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="매월 1일">매월 1일</option>
                      <option value="매월 5일">매월 5일</option>
                      <option value="매월 10일">매월 10일</option>
                      <option value="매월 15일">매월 15일</option>
                      <option value="매월 25일">매월 25일</option>
                      <option value="등록일 기준">등록일 기준</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">어머니 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={motherPhone}
                    onChange={(e) => setMotherPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">아버지 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={fatherPhone}
                    onChange={(e) => setFatherPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 본인 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">생년월일 (선택)</label>
                  <input 
                    type="date" 
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학교명 (선택)</label>
                  <input 
                    type="text" 
                    placeholder="예: 가온초"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학년 (선택)</label>
                  <input 
                    type="text" 
                    placeholder="예: 초등 3학년"
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">입회 등록일 *</label>
                  <input 
                    type="date" 
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex items-center h-full pt-6 pl-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={isSmsEnabled}
                      onChange={(e) => setIsSmsEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-700">등하원 문자 자동 수신 활성화</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 거주지 주소</label>
                <input 
                  type="text" 
                  placeholder="예: 서울특별시 서초구 반포동 123"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">비공개 학생 메모</label>
                <textarea 
                  placeholder="원장 작성용 비공개 학생 특이사항 메모"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-sm mt-6"
              >
                {saveLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? '학생 정보 수정 완료하기' : '학생 정보 등록하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
