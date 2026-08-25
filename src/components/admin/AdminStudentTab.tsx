import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Search, Upload, Loader2, Link2, Link2Off, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { loadActiveAppSchedulesByChild, type ActiveAppSchedule } from '../../lib/adminScheduleAssignments';

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
    status: string | null;
    class_schedules: {
      target_class: string;
    } | null;
  }>;
  app_schedule_classes?: ActiveAppSchedule[];
}

interface ClassSchedule {
  id: string;
  target_class: string;
  branch_id: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface PackageOption {
  id: string;
  label: string;
  price: number;
  branch_id: string;
  packages: {
    name: string;
    voucher_type: string | null;
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

const nextMonthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString().slice(0, 10);
};

const monthLabel = (offset: number) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
};

const scheduleLabel = (schedule: {
  target_class: string;
  day_of_week?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}) => {
  const time = schedule.start_time?.slice(0, 5) || '';
  const endTime = schedule.end_time?.slice(0, 5) || '';
  const timeRange = time ? `${time}${endTime ? `~${endTime}` : ''}` : '';
  const detail = [schedule.day_of_week ? `${schedule.day_of_week}요일` : '', timeRange]
    .filter(Boolean).join(' ');
  return detail ? `${schedule.target_class} · ${detail}` : schedule.target_class;
};

const voucherTypeLabel = (voucherType?: string | null) => {
  if (voucherType === 'shuttle') return '차량';
  if (voucherType === 'gps') return 'GPS';
  if (voucherType === 'single' || voucherType === 'one_time') return '단품';
  if (voucherType === 'lesson') return '수업';
  return '기타';
};

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const normalizedWeekday = (value?: string | null) => (value || '').replace('요일', '').trim();

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
  const [courseTab, setCourseTab] = useState<'current' | 'next'>('current');
  const [nextMonthClassIds, setNextMonthClassIds] = useState<string[]>([]);
  const [nextMonthClassDay, setNextMonthClassDay] = useState('전체');
  const [nextMonthPackages, setNextMonthPackages] = useState<ClassAssignment[]>([]);
  const [currentPackageLabels, setCurrentPackageLabels] = useState<string[]>([]);

  // Load students, classes, & package options
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load class schedules for assigning
      let classesQuery = supabase.from('class_schedules').select('id, target_class, branch_id, day_of_week, start_time, end_time');
      if (activeBranchId && activeBranchId !== 'all') {
        classesQuery = classesQuery.eq('branch_id', activeBranchId);
      }
      const { data: classesData } = await classesQuery;
      setClasses((classesData || []) as ClassSchedule[]);

      // 2. Load every package category with its options. Querying only the
      // option table made non-lesson products easy to omit when relationship
      // metadata differed, so the package itself is now the source of truth.
      let packagesQuery = supabase.from('packages').select(`
        id,
        name,
        voucher_type,
        branch_id,
        package_options(id, label, price, branch_id)
      `);
      if (activeBranchId && activeBranchId !== 'all') {
        packagesQuery = packagesQuery.eq('branch_id', activeBranchId);
      }
      const { data: packageData } = await packagesQuery;
      const flattenedOptions = ((packageData || []) as any[]).flatMap((pkg) =>
        (pkg.package_options || []).map((option: any) => ({
          ...option,
          branch_id: option.branch_id || pkg.branch_id,
          packages: {
            name: pkg.name,
            voucher_type: pkg.voucher_type || 'lesson',
          },
        })),
      );
      setPackageOptions(flattenedOptions);

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
          status,
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
      const schedulesByChild = await loadActiveAppSchedulesByChild(
        activeStudents.map((student: any) => student.child_id).filter(Boolean),
      );
      setStudents(activeStudents.map((student: any) => ({
        ...student,
        app_schedule_classes: student.child_id ? schedulesByChild.get(student.child_id) || [] : undefined,
      })) as Student[]);
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
  const openModal = async (student?: Student) => {
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
      setCourseTab('current');
      setNextMonthClassDay('전체');

      // Get first assigned class details if exists
      const assignments = (student.academy_student_classes || [])
        .filter((assignment) => (assignment.status || 'active') === 'active');
      setClassAssignments(assignments.length > 0
        ? assignments.map((assignment) => ({
            class_schedule_id: assignment.class_schedule_id || '',
            package_option_id: assignment.package_option_id || '',
            billing_cycle: assignment.billing_cycle || '월 기간제',
            payment_day: assignment.payment_day || '매월 1일',
          }))
        : [emptyAssignment()]);

      if (student.child_id) {
        const [{ data: owned }, { data: plans }] = await Promise.all([
          supabase
            .from('user_packages')
            .select('option_id, package_name, status')
            .eq('child_id', student.child_id)
            .in('status', ['active', 'expired', 'exhausted']),
          supabase
            .from('academy_student_monthly_plans')
            .select('item_type, class_schedule_id, package_option_id, billing_cycle, payment_day')
            .eq('student_id', student.id)
            .eq('effective_month', nextMonthStart())
            .eq('status', 'planned'),
        ]);
        const ownedRows = (owned || []) as Array<{ option_id: string | null; package_name: string | null }>;
        setCurrentPackageLabels(Array.from(new Set(ownedRows.map((row) => row.package_name).filter(Boolean) as string[])));
        const firstOptionId = ownedRows.find((row) => row.option_id)?.option_id || '';
        const planRows = (plans || []) as any[];
        setNextMonthClassIds(planRows.length > 0
          ? planRows.filter((plan) => plan.item_type === 'class').map((plan) => plan.class_schedule_id).filter(Boolean)
          : (student.app_schedule_classes || []).map((schedule) => schedule.id));
        setNextMonthPackages(planRows.length > 0
          ? planRows.filter((plan) => plan.item_type === 'package').map((plan: any) => ({
              class_schedule_id: '',
              package_option_id: plan.package_option_id || '',
              billing_cycle: plan.billing_cycle || '월 기간제',
              payment_day: plan.payment_day || '매월 1일',
            }))
          : (firstOptionId ? [{
              ...emptyAssignment(),
              package_option_id: firstOptionId,
            }] : []));
      } else {
        setCurrentPackageLabels([]);
        setNextMonthClassIds([]);
        setNextMonthPackages([]);
      }
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
      setCourseTab('current');
      setNextMonthClassDay('전체');
      setCurrentPackageLabels([]);
      setNextMonthClassIds([]);
      setNextMonthPackages([]);
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
    const editingStudent = editingId ? students.find((student) => student.id === editingId) : null;
    const isAppLinked = Boolean(editingStudent?.child_id);
    const assignmentsToValidate = isAppLinked ? nextMonthPackages : classAssignments;
    if (!isAppLinked && assignmentsToValidate.length === 0) return alert('수업 또는 이용권을 한 개 이상 추가해 주세요.');
    if (assignmentsToValidate.some((assignment) => !assignment.package_option_id)) return alert('모든 수강 항목에 이용권 요금제를 지정해 주세요.');
    const assignmentKeys = assignmentsToValidate.map((assignment) => `${assignment.class_schedule_id || 'package-only'}:${assignment.package_option_id}`);
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

      // Web-only students keep using academy_student_classes. App-linked
      // students save only next month's plan; current app data is read-only.
      if (studentId && !isAppLinked) {
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

      if (studentId && isAppLinked) {
        // Class plans are synchronized through a transactional RPC that also
        // creates the future-dated app assignments and target-month bookings.
        const { error: futureScheduleError } = await supabase.rpc(
          'sync_future_month_student_schedules',
          {
            p_student_id: studentId,
            p_effective_month: nextMonthStart(),
            p_schedule_ids: nextMonthClassIds,
          },
        );
        if (futureScheduleError) throw futureScheduleError;

        // Billable packages are independent from class assignments and can be
        // added/removed without changing the future timetable.
        const { error: deletePlanError } = await supabase
          .from('academy_student_monthly_plans')
          .delete()
          .eq('student_id', studentId)
          .eq('effective_month', nextMonthStart())
          .eq('item_type', 'package');
        if (deletePlanError) throw deletePlanError;

        const nextPlanRows = nextMonthPackages.map((assignment) => ({
            student_id: studentId,
            branch_id: selectedBranchId,
            effective_month: nextMonthStart(),
            item_type: 'package',
            class_schedule_id: null,
            package_option_id: assignment.package_option_id,
            billing_cycle: assignment.billing_cycle,
            payment_day: assignment.payment_day,
            status: 'planned',
          }));
        const { error: planError } = nextPlanRows.length > 0
          ? await supabase.from('academy_student_monthly_plans').insert(nextPlanRows)
          : { error: null };
        if (planError) throw planError;
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
    
    const assignedClasses = (student.child_id
      ? student.app_schedule_classes || []
      : (student.academy_student_classes || []).map((assignment) => assignment.class_schedules))
      .map((schedule) => schedule?.target_class || '이용권 단독')
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
  const modalStudent = editingId ? students.find((student) => student.id === editingId) || null : null;
  const isModalAppLinked = Boolean(modalStudent?.child_id);
  const sortedModalClasses = [...classes].sort((left, right) => {
    const dayDiff = WEEKDAYS.indexOf(normalizedWeekday(left.day_of_week))
      - WEEKDAYS.indexOf(normalizedWeekday(right.day_of_week));
    if (dayDiff !== 0) return dayDiff;
    return `${left.start_time || ''}:${left.target_class}`.localeCompare(`${right.start_time || ''}:${right.target_class}`);
  });
  const availableClassDays = WEEKDAYS.filter((day) => sortedModalClasses.some((item) => normalizedWeekday(item.day_of_week) === day));
  const visibleModalClasses = nextMonthClassDay === '전체'
    ? sortedModalClasses
    : sortedModalClasses.filter((item) => normalizedWeekday(item.day_of_week) === nextMonthClassDay);

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
              <tr className="whitespace-nowrap">
                <th scope="col" className="px-6 py-4">학생이름</th>
                <th scope="col" className="px-6 py-4">보호자 성함</th>
                <th scope="col" className="px-6 py-4">수강 수업반</th>
                <th scope="col" className="px-6 py-4">연락처 (부모/학생)</th>
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
                  const assignments = student.child_id
                    ? (student.app_schedule_classes || []).map((schedule) => ({
                        class_schedule_id: schedule.id,
                        package_option_id: null,
                        class_schedules: schedule,
                      }))
                    : student.academy_student_classes || [];
                  const displayParentName = student.parent_name || student.parent_user?.name || '미기입';
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 text-sm">{student.student_name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">출결번호: {student.attendance_code}</span>
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
                      <td className="px-6 py-4 text-xs text-slate-700 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {student.mother_phone && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">어머니</span>
                              <span className="font-mono text-slate-800 font-bold">{student.mother_phone}</span>
                            </div>
                          )}
                          {student.father_phone && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">아버지</span>
                              <span className="font-mono text-slate-800 font-bold">{student.father_phone}</span>
                            </div>
                          )}
                          {student.student_phone && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200/60">학생</span>
                              <span className="font-mono text-slate-800 font-bold">{student.student_phone}</span>
                            </div>
                          )}
                          {!student.mother_phone && !student.father_phone && !student.student_phone && (
                            <span className="text-slate-400 font-medium text-xs">미등록</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">
                        <div className="flex flex-col font-bold">
                          <span>{student.school_name || '-'}</span>
                          <span className="text-slate-400 mt-0.5">{student.grade_level || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {student.admission_date ? student.admission_date.slice(0, 10).replace(/-/g, '.') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                {isModalAppLinked && (
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setCourseTab('current')} className={`rounded-lg px-3 py-2 text-xs font-black ${courseTab === 'current' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>이번 달<br/><span className="text-[10px]">{monthLabel(0)}</span></button>
                    <button type="button" onClick={() => setCourseTab('next')} className={`rounded-lg px-3 py-2 text-xs font-black ${courseTab === 'next' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>다음 달<br/><span className="text-[10px]">{monthLabel(1)}</span></button>
                  </div>
                )}
                {isModalAppLinked && courseTab === 'current' ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div><div className="text-xs font-black text-slate-800">이번 달 수업·이용권</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">앱의 실제 예약 및 보유 이용권 기준이며 여기서는 수정할 수 없습니다.</div></div>
                    <div><div className="mb-1.5 text-[11px] font-black text-slate-500">수업</div><div className="flex flex-wrap gap-1.5">{(modalStudent?.app_schedule_classes || []).length > 0 ? modalStudent?.app_schedule_classes?.map((schedule) => <span key={schedule.id} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{scheduleLabel(schedule)}</span>) : <span className="text-xs font-bold text-slate-400">배정된 수업 없음</span>}</div></div>
                    <div><div className="mb-1.5 text-[11px] font-black text-slate-500">이용권</div><div className="flex flex-wrap gap-1.5">{currentPackageLabels.length > 0 ? currentPackageLabels.map((label) => <span key={label} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{label}</span>) : <span className="text-xs font-bold text-slate-400">보유 이용권 없음</span>}</div></div>
                  </div>
                ) : (
                <>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-black text-slate-800">{isModalAppLinked ? `${monthLabel(1)} 수업 및 이용권` : '수강 수업반 및 요금제'}</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">{isModalAppLinked ? '다음 달 청구서에는 여기서 저장한 이용권과 수업이 반영됩니다.' : '학생이 수강하는 수업을 여러 개 등록할 수 있습니다.'}</div></div>
                  {!isModalAppLinked && <button type="button" onClick={() => setClassAssignments((current) => [...current, emptyAssignment()])} className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-700"><Plus size={14} /> 항목 추가</button>}
                </div>
                {isModalAppLinked && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black text-blue-700">다음 달 수업 선택</div>
                        <div className="text-[10px] font-medium text-slate-500">선택 {nextMonthClassIds.length}개</div>
                      </div>
                      {nextMonthClassIds.length > 0 && <button type="button" onClick={() => setNextMonthClassIds([])} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">전체 해제</button>}
                    </div>

                    {nextMonthClassIds.length > 0 && (
                      <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-blue-50 p-2">
                        {nextMonthClassIds.map((id) => {
                          const selected = classes.find((item) => item.id === id);
                          return selected ? <button key={id} type="button" onClick={() => setNextMonthClassIds((current) => current.filter((itemId) => itemId !== id))} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 shadow-xs">{normalizedWeekday(selected.day_of_week)} {selected.start_time?.slice(0, 5)} · {selected.target_class} ×</button> : null;
                        })}
                      </div>
                    )}

                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {['전체', ...availableClassDays].map((day) => <button key={day} type="button" onClick={() => setNextMonthClassDay(day)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${nextMonthClassDay === day ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{day}{day !== '전체' ? '요일' : ''}</button>)}
                    </div>

                    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {visibleModalClasses.map((item) => {
                        const checked = nextMonthClassIds.includes(item.id);
                        return <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-blue-300 bg-blue-50' : 'border-transparent bg-slate-50 hover:border-slate-200'}`}>
                          <input type="checkbox" checked={checked} onChange={(e) => setNextMonthClassIds((current) => e.target.checked ? Array.from(new Set([...current, item.id])) : current.filter((id) => id !== item.id))} className="h-4 w-4 shrink-0 rounded text-blue-600"/>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-black text-slate-800">{item.target_class}</span>
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{normalizedWeekday(item.day_of_week)}요일 · {item.start_time?.slice(0, 5) || '--:--'}~{item.end_time?.slice(0, 5) || '--:--'}</span>
                          </span>
                        </label>;
                      })}
                      {visibleModalClasses.length === 0 && <div className="col-span-full rounded-xl bg-slate-50 py-6 text-center text-xs font-bold text-slate-400">해당 요일의 수업이 없습니다.</div>}
                    </div>
                  </div>
                )}
                {isModalAppLinked && <div className="flex items-center justify-between"><div><div className="text-[11px] font-black text-emerald-700">다음 달 청구 이용권</div><div className="text-[10px] text-slate-500">차량·단품을 포함해 여러 개 추가할 수 있습니다.</div></div><button type="button" onClick={() => setNextMonthPackages((current) => [...current, emptyAssignment()])} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white"><Plus size={12}/> 이용권 추가</button></div>}
                {(isModalAppLinked ? nextMonthPackages : classAssignments).map((assignment, index) => {
                  const selectablePackageOptions = isModalAppLinked
                    ? packageOptions
                    : packageOptions.filter((option) => (option.packages?.voucher_type || 'lesson') === 'lesson');
                  const selectedPackageOption = selectablePackageOptions.find((option) => option.id === assignment.package_option_id);
                  const updateAssignment = (values: Partial<ClassAssignment>) => isModalAppLinked
                    ? setNextMonthPackages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item))
                    : setClassAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
                  const itemCount = isModalAppLinked ? nextMonthPackages.length : classAssignments.length;
                  return (
                    <div key={index} className={`space-y-3 rounded-2xl border p-3 ${isModalAppLinked ? 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/60' : 'border-slate-200 bg-white'} shadow-xs`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${isModalAppLinked ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{index + 1}</span>
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-black text-slate-700">{selectedPackageOption?.packages?.name || (isModalAppLinked ? '청구할 이용권을 선택하세요' : `수강 항목 ${index + 1}`)}</div>
                            {selectedPackageOption && <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="rounded-full bg-white px-1.5 py-0.5 text-emerald-700">{voucherTypeLabel(selectedPackageOption.packages?.voucher_type)}</span><span>{selectedPackageOption.label}</span><span>·</span><span>{selectedPackageOption.price.toLocaleString()}원</span></div>}
                          </div>
                        </div>
                        {(isModalAppLinked || itemCount > 1) && <button type="button" aria-label="이용권 삭제" onClick={() => isModalAppLinked ? setNextMonthPackages((current) => current.filter((_, itemIndex) => itemIndex !== index)) : setClassAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>}
                      </div>
                      <div className={`grid grid-cols-1 gap-3 ${isModalAppLinked ? '' : 'sm:grid-cols-2'}`}>
                        {!isModalAppLinked && <div><label className="mb-1.5 block text-xs font-bold text-slate-500">수강 반 배정 (선택)</label><select value={assignment.class_schedule_id} onChange={(e) => updateAssignment({ class_schedule_id: e.target.value })} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="">수업반 없음 / 이용권 단독 수강</option>{classes.map((item) => <option key={item.id} value={item.id}>{scheduleLabel(item)}</option>)}</select></div>}
                        <div><label className="mb-1.5 block text-[11px] font-bold text-slate-500">{isModalAppLinked ? '이용권 변경' : '이용권 요금제 지정 *'}</label><select value={assignment.package_option_id} onChange={(e) => updateAssignment({ package_option_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" required><option value="">이용권을 선택해 주세요</option>{selectablePackageOptions.map((option) => <option key={option.id} value={option.id}>[{voucherTypeLabel(option.packages?.voucher_type)}] {option.packages?.name || '패키지'} · {option.label} ({option.price.toLocaleString()}원)</option>)}</select></div>
                      </div>
                    </div>
                  );
                })}
                </>
                )}
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
