import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveAppSchedule } from '../../../../lib/adminScheduleAssignments';
import { normalizeError } from '../../../../errors/appError.ts';
import type { Student, UnregisteredMember, ClassSchedule, PackageOption } from '../types';

interface Dependencies {
  client: Pick<SupabaseClient, 'from'>;
  loadSchedules: (childIds: string[]) => Promise<Map<string, ActiveAppSchedule[]>>;
}

/** Read-only roster snapshot. No state is published unless every lookup succeeds. */
export async function loadStudentData(activeBranchId: string | null, billMonth: string, { client, loadSchedules }: Dependencies) {
  try {
    // 1. Load class schedules for assigning
    let classesQuery = client.from('class_schedules').select('id, target_class, branch_id, day_of_week, start_time, end_time');
    if (activeBranchId && activeBranchId !== 'all') {
      classesQuery = classesQuery.eq('branch_id', activeBranchId);
    }
    const { data: classesData, error: classesError } = await classesQuery;
    if (classesError) throw classesError;

    // 2. Load every package category with its options
    let packagesQuery = client.from('packages').select(`
      id,
      name,
      voucher_type,
      branch_id,
      package_options(id, label, price, branch_id)
    `);
    packagesQuery = packagesQuery.eq('is_active', true);
    if (activeBranchId && activeBranchId !== 'all') {
      packagesQuery = packagesQuery.eq('branch_id', activeBranchId);
    }
    const { data: packageData, error: packagesError } = await packagesQuery;
    if (packagesError) throw packagesError;
    const flattenedOptions = ((packageData || []) as any[]).flatMap((pkg) =>
      (pkg.package_options || []).map((option: any) => ({
        ...option,
        package_id: pkg.id,
        branch_id: option.branch_id || pkg.branch_id,
        packages: {
          name: pkg.name,
          voucher_type: pkg.voucher_type || 'lesson',
        },
      })),
    );


    // 3. Load actual students from academy_students and children.
    // Registered users without a child belong in member management, not the student roster.
    let studentsQuery = client.from('academy_students').select(`
      *,
      parent_user:users(name, email, status, phone, branch_id),
      child:children(deleted_at, back_number, branch_id, parent_id)
    `).is('archived_at', null);
    if (activeBranchId && activeBranchId !== 'all') {
      studentsQuery = studentsQuery.eq('branch_id', activeBranchId);
    }

    let childrenQuery = client.from('children').select(`
      id, child_name, back_number, parent_id, branch_id, deleted_at, created_at,
      parent:users(id, name, phone, email, status, branch_id)
    `).is('deleted_at', null);
    if (activeBranchId && activeBranchId !== 'all') {
      childrenQuery = childrenQuery.eq('branch_id', activeBranchId);
    }

    let usersQuery = client
      .from('users')
      .select('id, name, username, email, phone, status, role, branch_id, created_at')
      .neq('status', 'deleted');
    if (activeBranchId && activeBranchId !== 'all') {
      usersQuery = usersQuery.eq('branch_id', activeBranchId);
    }

    const [studentsResult, childrenResult, usersResult] = await Promise.all([
      studentsQuery,
      childrenQuery,
      usersQuery,
    ]);

    if (studentsResult.error) throw studentsResult.error;
    if (childrenResult.error) throw childrenResult.error;
    if (usersResult.error) throw usersResult.error;

    const rawAcademyStudents = (studentsResult.data || []) as any[];
    const rawChildren = (childrenResult.data || []) as any[];
    const rawUsers = (usersResult.data || []) as any[];

    // Keep the base academy_students query independent from class joins.
    // A broken/ambiguous nested relationship must not make the entire student list disappear.
    const academyStudentIds = rawAcademyStudents.map((student) => student.id).filter(Boolean);
    const studentClassesByStudent = new Map<string, Student['academy_student_classes']>();
    const currentPlanClassesByStudent = new Map<string, ActiveAppSchedule[]>();
    if (academyStudentIds.length > 0) {
      const [{ data: studentClassesData, error: studentClassesError }, { data: currentPlanClasses, error: currentPlanError }] = await Promise.all([
        client
          .from('academy_student_classes')
          .select('student_id, class_schedule_id, package_option_id, billing_cycle, payment_day, status')
          .in('student_id', academyStudentIds),
        client
          .from('academy_student_monthly_plans')
          .select('student_id, class_schedule_id')
          .in('student_id', academyStudentIds)
          .eq('effective_month', `${billMonth}-01`)
          .eq('item_type', 'class')
          .in('status', ['planned', 'applied']),
      ]);

      if (studentClassesError) throw studentClassesError;
      if (currentPlanError) throw currentPlanError;

      const classesById = new Map((classesData || []).map((schedule: any) => [schedule.id, schedule]));
      ((studentClassesData || []) as any[]).forEach((assignment) => {
        const current = studentClassesByStudent.get(assignment.student_id) || [];
        const schedule = assignment.class_schedule_id
          ? classesById.get(assignment.class_schedule_id) || null
          : null;
        current.push({
          class_schedule_id: assignment.class_schedule_id,
          package_option_id: assignment.package_option_id,
          billing_cycle: assignment.billing_cycle,
          payment_day: assignment.payment_day,
          status: assignment.status,
          class_schedules: schedule
            ? { target_class: (schedule as ClassSchedule).target_class }
            : null,
        });
        studentClassesByStudent.set(assignment.student_id, current);
      });
      ((currentPlanClasses || []) as any[]).forEach((plan) => {
        const schedule = classesById.get(plan.class_schedule_id) as ClassSchedule | undefined;
        if (!schedule) return;
        const current = currentPlanClassesByStudent.get(plan.student_id) || [];
        current.push(schedule as ActiveAppSchedule);
        currentPlanClassesByStudent.set(plan.student_id, current);
      });
    }

    // Clean attendance code helper (clean 4 digits or back number, NO APP-UUID!)
    const formatCleanAttendanceCode = (code: string | null | undefined, phone: string | null | undefined, backNum: string | null | undefined) => {
      if (code && !code.startsWith('APP-') && !code.startsWith('app-') && code.length <= 8) return code;
      if (backNum && backNum.trim()) return backNum.trim();
      const digits = (phone || '').replace(/[^0-9]/g, '');
      if (digits.length >= 4) return digits.slice(-4);
      return code && code.startsWith('APP-') ? code.slice(4, 8) : '-';
    };

    const existingChildIds = new Set<string>();

    // 1. Existing academy_students
    const activeStudents: any[] = rawAcademyStudents
      .filter((student: any) => (
        (student.child_id ? student.child?.deleted_at == null : true)
        && (!student.parent_user_id || student.parent_user?.status !== 'deleted')
      ))
      .map((student: any) => {
        if (student.child_id) existingChildIds.add(student.child_id);
        const cleanPhone = student.mother_phone || student.father_phone || student.student_phone || student.parent_user?.phone;
        return {
          ...student,
          parent_user_id: student.child?.parent_id || student.parent_user_id,
          attendance_code: formatCleanAttendanceCode(student.attendance_code, cleanPhone, student.child?.back_number),
          academy_student_classes: studentClassesByStudent.get(student.id) || [],
        };
      });

    // 2. Add all children registered from mobile app
    rawChildren.forEach((child: any) => {
      if (child.deleted_at != null) return;
      if (existingChildIds.has(child.id)) return;
      if (child.parent && child.parent.status === 'deleted') return;
      existingChildIds.add(child.id);

      const parentPhone = child.parent?.phone || '';
      activeStudents.push({
        id: `child-${child.id}`,
        student_name: child.child_name || '원생',
        attendance_code: formatCleanAttendanceCode(child.back_number, parentPhone, child.back_number),
        mother_phone: parentPhone || '',
        father_phone: '',
        student_phone: '',
        school_name: '',
        grade_level: '',
        admission_date: child.created_at?.slice(0, 10) || '',
        notes: '',
        parent_name: child.parent?.name || '',
        parent_user_id: child.parent_id || null,
        child_id: child.id,
        branch_id: child.branch_id || child.parent?.branch_id || activeBranchId || 'branch_1',
        created_at: child.created_at || new Date().toISOString(),
        parent_user: child.parent ? { name: child.parent.name, email: child.parent.email, status: child.parent.status } : null,
        child: { deleted_at: null },
        academy_student_classes: [],
      });
    });

    const usersWithStudents = new Set<string>();
    rawAcademyStudents.forEach((student: any) => {
      if (student.parent_user_id) usersWithStudents.add(student.parent_user_id);
    });
    rawChildren.forEach((child: any) => {
      if (child.parent_id) usersWithStudents.add(child.parent_id);
    });
    const unregisteredMembers = rawUsers
      .filter((user: any) => user.role === 'user' && user.status !== 'deleted' && !usersWithStudents.has(user.id))
      .map((user: any) => ({
        id: user.id,
        name: user.name || '이름 미등록',
        username: user.username || null,
        email: user.email || null,
        phone: user.phone || null,
        branch_id: user.branch_id || null,
        created_at: user.created_at,
      }))
      .sort((left: UnregisteredMember, right: UnregisteredMember) => left.name.localeCompare(right.name, 'ko-KR'));

    const childIds = activeStudents.map((student: any) => student.child_id).filter(Boolean);
    
    const [schedulesByChild, pkgsResult] = await Promise.all([
      loadSchedules(childIds),
      childIds.length > 0 
        ? client.from('user_packages').select('child_id, package_name, total_count, remaining_count, price, valid_until, expiry_date, status').in('child_id', childIds).eq('status', 'active').order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (pkgsResult.error) throw pkgsResult.error;
    const pkgsMap = new Map<string, any>();
    const today = new Date().toISOString().slice(0, 10);
    ((pkgsResult.data || []) as any[]).forEach((pkg: any) => {
      const expiresOn = pkg.valid_until || pkg.expiry_date || null;
      if (expiresOn && expiresOn < today) return;
      if (!pkgsMap.has(pkg.child_id)) {
        pkgsMap.set(pkg.child_id, pkg);
      }
    });

    const students = activeStudents.map((student: any) => ({
      ...student,
      app_schedule_classes: student.child_id
        ? currentPlanClassesByStudent.get(student.id) || schedulesByChild.get(student.child_id) || []
        : undefined,
      active_package: student.child_id ? pkgsMap.get(student.child_id) || null : null,
    })) as Student[];
    return { students, unregisteredMembers, classes: (classesData || []) as ClassSchedule[], packageOptions: flattenedOptions as PackageOption[] };
  } catch (error: unknown) {
    throw normalizeError(error, 'STUDENT_LOAD_FAILED');
  }
}
