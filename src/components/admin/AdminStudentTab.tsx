import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Search, Upload, Loader2, Link2, Link2Off, Download } from 'lucide-react';
import ExcelJS from 'exceljs';

interface Student {
  id: string;
  parent_user_id: string | null;
  child_id: string | null;
  branch_id: string;
  student_name: string;
  parent_name: string | null;
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
    status: string;
  } | null;
  child?: {
    deleted_at: string | null;
  } | null;
  // Joined classes
  academy_student_classes?: Array<{
    class_schedule_id: string | null;
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

interface ClassAssignment {
  class_schedule_id: string;
  package_option_id: string;
  billing_cycle: string;
  payment_day: string;
}

const emptyAssignment = (): ClassAssignment => ({
  class_schedule_id: '',
  package_option_id: '',
  billing_cycle: '월 기간제',
  payment_day: '매월 1일',
});

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
  const [parentName, setParentName] = useState('');
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
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([emptyAssignment()]);
  const [saveLoading, setSaveLoading] = useState(false);

  // Load students, classes, & package options
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load class schedules for assigning
      let classesQuery = supabase.from('class_schedules').select('id, target_class, branch_id');
      if (activeBranchId && activeBranchId !== 'all') {
        classesQuery = classesQuery.eq('branch_id', activeBranchId);
      }
      const { data: classesData } = await classesQuery;
      setClasses((classesData || []) as ClassSchedule[]);

      // 2. Load package options for pricing
      let packagesQuery = supabase.from('package_options').select('id, label, price, branch_id, packages(name)');
      if (activeBranchId && activeBranchId !== 'all') {
        packagesQuery = packagesQuery.eq('branch_id', activeBranchId);
      }
      const { data: packageData } = await packagesQuery;
      setPackageOptions((packageData || []) as any[]);

      // 3. Load students
      let studentsQuery = supabase.from('academy_students').select(`
        *,
        parent_user:users(name, email, status),
        child:children(deleted_at),
        academy_student_classes(
          class_schedule_id,
          package_option_id,
          billing_cycle,
          payment_day,
          class_schedules(target_class)
        )
      `);
      if (activeBranchId && activeBranchId !== 'all') {
        studentsQuery = studentsQuery.eq('branch_id', activeBranchId);
      }
      const { data: studentsData, error } = await studentsQuery;
      if (error) throw error;

      const activeStudents = (studentsData || []).filter((student: any) => (
        (!student.child_id || student.child?.deleted_at == null)
        && (!student.parent_user_id || student.parent_user?.status !== 'deleted')
      ));
      setStudents(activeStudents as Student[]);
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
      setParentName(student.parent_name || student.parent_user?.name || '');
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
      const assignments = student.academy_student_classes || [];
      setClassAssignments(assignments.length > 0
        ? assignments.map((assignment) => ({
            class_schedule_id: assignment.class_schedule_id || '',
            package_option_id: assignment.package_option_id || '',
            billing_cycle: assignment.billing_cycle || '월 기간제',
            payment_day: assignment.payment_day || '매월 1일',
          }))
        : [emptyAssignment()]);
    } else {
      setEditingId(null);
      setSelectedBranchId(activeBranchId && activeBranchId !== 'all' ? activeBranchId : (branches.length > 0 ? branches[0].id : ''));
      setStudentName('');
      setParentName('');
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
      setClassAssignments([emptyAssignment()]);
    }
    setIsModalOpen(true);
  };

  // Helper to search and link parent user in real-time
  const linkParentAccount = async (mother: string, father: string): Promise<string | null> => {
    const cleanMother = mother.replace(/[^0-9]/g, '');
    const cleanFather = father.replace(/[^0-9]/g, '');

    if (!cleanMother && !cleanFather) return null;

    const phones = [cleanMother, cleanFather].filter(Boolean);
    const { data } = await supabase
      .from('users')
      .select('id, phone')
      .in('phone', phones)
      .neq('status', 'deleted')
      .limit(1);

    return data && data.length > 0 ? data[0].id : null;
  };

  // Save or Update Student
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return alert('학생 이름을 입력해주세요.');
    if (!attendanceCode.trim()) return alert('출결번호를 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');
    if (classAssignments.length === 0) return alert('수업 또는 이용권을 한 개 이상 추가해 주세요.');
    if (classAssignments.some((assignment) => !assignment.package_option_id)) return alert('모든 수강 항목에 이용권 요금제를 지정해 주세요.');
    const assignmentKeys = classAssignments.map((assignment) => `${assignment.class_schedule_id || 'package-only'}:${assignment.package_option_id}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) return alert('동일한 수업반과 이용권 조합이 중복되어 있습니다.');

    setSaveLoading(true);
    try {
      const parentId = await linkParentAccount(motherPhone, fatherPhone);

      const studentPayload = {
        branch_id: selectedBranchId,
        student_name: studentName.trim(),
        parent_name: parentName.trim() || null,
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
        parent_user_id: parentId || (editingId ? students.find((student) => student.id === editingId)?.parent_user_id : null)
      };

      let studentId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from('academy_students')
          .update(studentPayload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('academy_students')
          .insert([studentPayload])
          .select('id')
          .single();
        if (error) throw error;
        studentId = data.id;
      }

      // Manage Class Assignment Mapping
      if (studentId) {
        if (editingId) {
          const { error: deleteError } = await supabase
            .from('academy_student_classes')
            .delete()
            .eq('student_id', studentId);
          if (deleteError) throw deleteError;
        }

        const { error: assignmentError } = await supabase
          .from('academy_student_classes')
          .insert(classAssignments.map((assignment) => ({
            student_id: studentId,
            class_schedule_id: assignment.class_schedule_id || null,
            package_option_id: assignment.package_option_id,
            billing_cycle: assignment.billing_cycle,
            payment_day: assignment.payment_day,
            status: 'active'
          })));
        if (assignmentError) throw assignmentError;
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

  // Download Excel Registration template
  const downloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('원생 등록 양식');

      worksheet.getRow(1).values = [
        '클래스명 (선택 - 예: 초등축구반)',
        '이름 (필수)',
        '보호자 이름 (선택)',
        '출결번호 (필수)',
        '어머니 연락처',
        '아버지 연락처',
        '학생 연락처',
        '생년월일 (예: 2016-05-12)',
        '학교명',
        '학년',
        '입회일 (예: 2026-08-01)',
        '수강 요금제명 (필수 - 예: 주 2회 패키지)',
        '납부 주기 (선택 - 월 기간제/분기제 등)',
        '매월 수납일 (선택 - 매월 1일/매월 5일 등)',
        '비공개 메모'
      ];

      worksheet.columns.forEach(column => {
        column.width = 25;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '아이패스케어_원생일괄등록_양식.xlsx';
      link.click();
    } catch (err) {
      alert('템플릿 생성 중 에러가 발생했습니다.');
    }
  };

  // Excel File Batch Import Handler
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const currentBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : (branches.length > 0 ? branches[0].id : '');
    if (!currentBranch) {
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
          const mappingRequests: Array<{
            studentIndex: number;
            className: string;
            packageName: string;
            cycle: string;
            day: string;
          }> = [];

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const className = row.getCell(1).text?.trim();
            const name = row.getCell(2).text?.trim();
            const parentNameText = row.getCell(3).text?.trim();
            const code = row.getCell(4).text?.trim();
            const motherPhoneVal = row.getCell(5).text?.trim().replace(/[^0-9]/g, '');
            const fatherPhoneVal = row.getCell(6).text?.trim().replace(/[^0-9]/g, '');
            const studentPhoneVal = row.getCell(7).text?.trim().replace(/[^0-9]/g, '');
            const rawBirth = row.getCell(8).text?.trim();
            const school = row.getCell(9).text?.trim();
            const grade = row.getCell(10).text?.trim();
            const rawAdmission = row.getCell(11).text?.trim();
            const packageNameText = row.getCell(12).text?.trim(); // 요금제명
            const cycleText = row.getCell(13).text?.trim();       // 납부 주기
            const dayText = row.getCell(14).text?.trim();         // 수납일
            const memoText = row.getCell(15).text?.trim();

            if (!name || !code) return;

            let birthStr = null;
            if (rawBirth) {
              const cleanBirth = rawBirth.replace(/[^0-9]/g, '');
              if (cleanBirth.length === 8) {
                birthStr = `${cleanBirth.slice(0, 4)}-${cleanBirth.slice(4, 6)}-${cleanBirth.slice(6, 8)}`;
              } else if (rawBirth.includes('-')) {
                birthStr = rawBirth;
              }
            }

            let admissionStr = new Date().toISOString().slice(0, 10);
            if (rawAdmission) {
              const cleanAdm = rawAdmission.replace(/[^0-9]/g, '');
              if (cleanAdm.length === 8) {
                admissionStr = `${cleanAdm.slice(0, 4)}-${cleanAdm.slice(4, 6)}-${cleanAdm.slice(6, 8)}`;
              } else if (rawAdmission.includes('-')) {
                admissionStr = rawAdmission;
              }
            }

            importedStudents.push({
              branch_id: currentBranch,
              student_name: name,
              parent_name: parentNameText || null,
              attendance_code: code,
              mother_phone: motherPhoneVal || null,
              father_phone: fatherPhoneVal || null,
              student_phone: studentPhoneVal || null,
              birth_date: birthStr,
              school_name: school || null,
              grade_level: grade || null,
              address: null,
              admission_date: admissionStr,
              memo: memoText || null,
              is_sms_enabled: true
            });

            mappingRequests.push({
              studentIndex: importedStudents.length - 1,
              className: className || '',
              packageName: packageNameText || '',
              cycle: cycleText || '월 기간제',
              day: dayText || '매월 1일'
            });
          });

          if (importedStudents.length === 0) {
            alert('엑셀 시트에서 등록 가능한 학생 데이터를 발견하지 못했습니다.');
            setExcelLoading(false);
            return;
          }

          let insertedCount = 0;
          for (let i = 0; i < importedStudents.length; i++) {
            const student = importedStudents[i];
            const parentId = await linkParentAccount(student.mother_phone || '', student.father_phone || '');
            student.parent_user_id = parentId;

            const { data: sData, error: sErr } = await supabase
              .from('academy_students')
              .insert([student])
              .select('id')
              .single();

            if (!sErr && sData) {
              insertedCount++;

              const req = mappingRequests[i];
              const matchedClass = req.className 
                ? classes.find(c => c.target_class.trim() === req.className) 
                : null;
              
              let matchedOpt = req.packageName 
                ? packageOptions.find(p => p.label.trim() === req.packageName) 
                : null;
              
              if (!matchedOpt) {
                matchedOpt = packageOptions.find(p => p.branch_id === currentBranch) || null;
              }

              if (matchedOpt) {
                await supabase
                  .from('academy_student_classes')
                  .insert([{
                    student_id: sData.id,
                    class_schedule_id: matchedClass ? matchedClass.id : null,
                    package_option_id: matchedOpt.id,
                    billing_cycle: req.cycle,
                    payment_day: req.day,
                    status: 'active'
                  }]);
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
    
    const assignedClasses = (student.academy_student_classes || [])
      .map((assignment) => assignment.class_schedules?.target_class || '이용권 단독')
      .join(' ');
    const displayParentName = student.parent_name || student.parent_user?.name || '';
    
    return (
      student.student_name.toLowerCase().includes(query) ||
      displayParentName.toLowerCase().includes(query) ||
      (student.mother_phone && student.mother_phone.includes(query)) ||
      (student.father_phone && student.father_phone.includes(query)) ||
      (student.student_phone && student.student_phone.includes(query)) ||
      assignedClasses.toLowerCase().includes(query) ||
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
          {/* Template Download Button */}
          <button 
            onClick={downloadTemplate}
            className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs"
          >
            <Download size={16} />
            엑셀 양식 다운로드
          </button>

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
          placeholder="학생·보호자 이름, 연락처, 소속반, 학교명으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-2xl bg-slate-100 py-3.5 pl-11 pr-4 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Student List View */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-500">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4">이름 (출결번호)</th>
                <th scope="col" className="px-6 py-4">보호자 성함</th>
                <th scope="col" className="px-6 py-4">수강 수업반</th>
                <th scope="col" className="px-6 py-4">부모 연락망</th>
                <th scope="col" className="px-6 py-4">학교 / 학년</th>
                <th scope="col" className="px-6 py-4">입회일</th>
                <th scope="col" className="px-6 py-4">어플 연동 여부</th>
                <th scope="col" className="px-6 py-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                    <span className="text-xs font-bold text-slate-400 block mt-2">원생 명부 불러오는 중...</span>
                  </td>
                </tr>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const hasAppLinked = student.parent_user_id !== null;
                  const assignments = student.academy_student_classes || [];
                  const displayParentName = student.parent_name || student.parent_user?.name || '미기입';
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 text-sm">{student.student_name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">코드: {student.attendance_code}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-extrabold text-slate-900">
                        {displayParentName}
                        {student.parent_user?.name && <span className="ml-1 text-[10px] font-bold text-blue-500">(App)</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-xs flex-wrap gap-1.5">
                          {assignments.length > 0 ? assignments.map((assignment, index) => (
                            <span key={`${assignment.class_schedule_id || 'package'}-${assignment.package_option_id || index}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${assignment.class_schedule_id ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                              {assignment.class_schedules?.target_class || '🎫 이용권 단독 수강'}
                            </span>
                          )) : <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-400">미배정</span>}
                        </div>
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
                })
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-slate-400 font-bold text-sm bg-slate-50/10">
                    일치하는 학생 정보가 없습니다. 첫 원생을 등록해 보세요!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">보호자(학부모) 성함</label>
                  <input
                    type="text"
                    placeholder="예: 홍길동 (수기 입력용)"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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

              <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-black text-slate-800">수강 수업반 및 요금제</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">학생이 수강하는 수업을 여러 개 등록할 수 있습니다.</div></div>
                  <button type="button" onClick={() => setClassAssignments((current) => [...current, emptyAssignment()])} className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-700"><Plus size={14} /> 수업 추가</button>
                </div>
                {classAssignments.map((assignment, index) => {
                  const updateAssignment = (values: Partial<ClassAssignment>) => setClassAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
                  return (
                    <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
                      <div className="flex items-center justify-between"><span className="text-[11px] font-black text-blue-700">수강 항목 {index + 1}</span>{classAssignments.length > 1 && <button type="button" onClick={() => setClassAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex items-center gap-1 text-[10px] font-bold text-rose-500"><Trash2 size={13} /> 삭제</button>}</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">수강 반 배정 (선택)</label><select value={assignment.class_schedule_id} onChange={(e) => updateAssignment({ class_schedule_id: e.target.value })} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="">수업반 없음 / 이용권 단독 수강</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.target_class}</option>)}</select></div>
                        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">수강료 요금제 지정 *</label><select value={assignment.package_option_id} onChange={(e) => updateAssignment({ package_option_id: e.target.value })} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" required><option value="">수강 요금제 선택</option>{packageOptions.map((option) => <option key={option.id} value={option.id}>[{option.packages?.name || '패키지'}] {option.label} ({option.price.toLocaleString()}원)</option>)}</select></div>
                        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">납부 주기 방식</label><select value={assignment.billing_cycle} onChange={(e) => updateAssignment({ billing_cycle: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="월 기간제">월 기간제</option><option value="분기제">분기제</option><option value="횟수 쿠폰제">횟수 쿠폰제</option></select></div>
                        <div><label className="mb-1.5 block text-xs font-bold text-slate-500">매월 수납 기준일</label><select value={assignment.payment_day} onChange={(e) => updateAssignment({ payment_day: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">{['매월 1일', '매월 5일', '매월 10일', '매월 15일', '매월 25일', '등록일 기준'].map((day) => <option key={day} value={day}>{day}</option>)}</select></div>
                      </div>
                    </div>
                  );
                })}
              </div>

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
