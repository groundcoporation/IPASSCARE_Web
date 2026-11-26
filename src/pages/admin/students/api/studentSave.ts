import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { StudentSaveInput } from '../types';

type SaveClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export async function findParentAccount(client: SaveClient, mother: string, father: string): Promise<string | null> {
  try {
    const phones = [mother, father].map(phone => phone.replace(/[^0-9]/g, '')).filter(Boolean);
    if (!phones.length) return null;
    const { data, error } = await client.from('users').select('id, phone').in('phone', phones).neq('status', 'deleted').limit(1);
    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (error: unknown) {
    throw normalizeError(error, 'STUDENT_SAVE_FAILED');
  }
}

export function requiresStudentSaveReview(error: unknown): boolean {
  return error instanceof AppError && ['STUDENT_SAVE_UNCONFIRMED', 'STUDENT_CLASSES_SAVE_PARTIAL', 'STUDENT_PICKUP_SAVE_PARTIAL', 'STUDENT_PLAN_SAVE_PARTIAL'].includes(error.code);
}

/** Existing multi-stage workflow, without automatic retries or RPC fallbacks.
 * Only the final schedule/billing RPC is atomic; earlier writes are not rolled back with it.
 */
export async function saveStudentData(input: StudentSaveInput, { client }: { client: SaveClient }): Promise<string> {
  const { editingId, editingStudent, selectedBranchId, studentName, parentName, attendanceCode, motherPhone, fatherPhone, studentPhone, birthDate, schoolName, gradeLevel, address, admissionDate, memo, isSmsEnabled, classAssignments, pickupSpots, pickupSpotId, dropoffSpotId, pickupDetailLocation, dropoffDetailLocation, currentMonthClassIds, currentMonthPackages, applyCurrentClassesToNextMonth, nextEffectiveMonth, nextMonthClassIds, nextMonthPackages, currentMonthBillingLocked } = input;
  const isAppLinked = Boolean(editingStudent?.child_id);
  let writeAttempted = false;
  let studentSaved = false;
  let pickupSaved = false;
  try {
    // 앱 자녀는 children.parent_id가 소유권의 기준입니다. 동일 전화번호를
    // 사용하는 다른 계정을 검색해 기존 학부모 연결을 덮어쓰지 않습니다.
    const parentId = isAppLinked
      ? editingStudent?.child?.parent_id || editingStudent?.parent_user_id || null
      : await findParentAccount(client, motherPhone, fatherPhone);

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
      parent_user_id: parentId || editingStudent?.parent_user_id || null
    };

    let studentId = editingId;
    const isVirtualAppStudent = Boolean(
      editingStudent?.child_id && editingId?.startsWith('child-'),
    );
    if (editingId && isVirtualAppStudent) {
      // 앱 children에는 존재하지만 academy_students 행이 아직 없는 학생은
      // 가상 목록 ID를 UPDATE하지 않고 실제 관리 행을 먼저 생성합니다.
      const { data: existingLinkedStudent, error: linkedLookupError } = await client
        .from('academy_students')
        .select('id')
        .eq('child_id', editingStudent!.child_id)
        .maybeSingle();
      if (linkedLookupError) throw linkedLookupError;

      writeAttempted = true;
      if (existingLinkedStudent?.id) {
        const { data: updated, error } = await client
          .from('academy_students')
          .update(studentPayload)
          .eq('id', existingLinkedStudent.id).select('id').single();
        if (error) throw error;
        if (updated?.id !== existingLinkedStudent.id) throw new AppError('STUDENT_SAVE_UNCONFIRMED');
        studentId = updated.id;
      } else {
        const { data, error } = await client
          .from('academy_students')
          .insert([{
            ...studentPayload,
            child_id: editingStudent!.child_id,
          }])
          .select('id')
          .single();
        if (error) throw error;
        studentId = data.id;
      }
    } else if (editingId) {
      writeAttempted = true;
      const { data: updated, error } = await client
        .from('academy_students')
        .update(studentPayload)
        .eq('id', editingId).select('id').single();
      if (error) throw error;
      if (updated?.id !== editingId) throw new AppError('STUDENT_SAVE_UNCONFIRMED');
    } else {
      writeAttempted = true;
      const { data, error } = await client
        .from('academy_students')
        .insert([studentPayload])
        .select('id')
        .single();
      if (error) throw error;
      studentId = data.id;
    }

    if (!studentId) throw new AppError('STUDENT_SAVE_UNCONFIRMED');
    studentSaved = true;

    // Web-only students keep using academy_student_classes. App-linked
    // schedules and billing plans use the existing unified RPC below.
    if (studentId && !isAppLinked) {
      if (editingId) {
        const { error: deleteError } = await client
          .from('academy_student_classes')
          .delete()
          .eq('student_id', studentId);
        if (deleteError) throw deleteError;
      }

      const { error: assignmentError } = await client
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
      const boardingSpotName = pickupSpots.find((spot) => spot.id === pickupSpotId)?.name || '';
      const dropoffSpotName = pickupSpots.find((spot) => spot.id === dropoffSpotId)?.name || '';
      const { error: pickupSettingError } = await client
        .from('pickup_settings')
        .upsert({
          child_id: editingStudent!.child_id,
          branch_id: selectedBranchId,
          area: pickupSpotId ? '픽업' : '',
          apartment: boardingSpotName || dropoffSpotName || '',
          pickup_spot_id: pickupSpotId || null,
          detail_location: pickupDetailLocation.trim(),
          dropoff_spot_id: dropoffSpotId || null,
          dropoff_detail_location: dropoffDetailLocation.trim(),
          is_active: Boolean(pickupSpotId || dropoffSpotId),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'child_id' });
      if (pickupSettingError) throw pickupSettingError;

      pickupSaved = true;

      // Current and next-month app schedules and billing instructions are
      // committed by one RPC. A failure rolls all of them back together.
      const { error: unifiedPlanError } = await client.rpc(
        'save_student_schedule_and_billing_all_months',
        {
          p_student_id: studentId,
          p_current_schedule_ids: currentMonthClassIds,
          p_current_package_option_ids: currentMonthPackages.map((assignment) => assignment.package_option_id),
          p_apply_current_schedule_to_next: applyCurrentClassesToNextMonth,
          p_next_effective_month: nextEffectiveMonth,
          p_next_schedule_ids: nextMonthClassIds,
          p_next_package_option_ids: nextMonthPackages.map((assignment) => assignment.package_option_id),
          p_update_current_billing: !currentMonthBillingLocked,
        },
      );
      if (unifiedPlanError) throw unifiedPlanError;
    }


    return studentId!;
  } catch (error: unknown) {
    const normalized = normalizeError(error, 'STUDENT_SAVE_FAILED');
    if (pickupSaved) throw new AppError('STUDENT_PLAN_SAVE_PARTIAL', normalized);
    if (studentSaved) throw new AppError(isAppLinked ? 'STUDENT_PICKUP_SAVE_PARTIAL' : 'STUDENT_CLASSES_SAVE_PARTIAL', normalized);
    if (writeAttempted && ['STUDENT_SAVE_FAILED', 'NETWORK_ERROR', 'STUDENT_SAVE_UNCONFIRMED'].includes(normalized.code)) {
      throw new AppError('STUDENT_SAVE_UNCONFIRMED', normalized);
    }
    throw normalized;
  }
}
