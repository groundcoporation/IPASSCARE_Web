import type { StudyLog } from '../api/studyData';

export interface StudyExportStudent { id: string; student_name: string; }
/** Export the loaded journal list, not just the selected student's visible history. */
export function studyExportRows(logs: StudyLog[], students: StudyExportStudent[]) {
  const names = new Map(students.map(item => [item.id, item.student_name]));
  return logs.map(item => ({
    student: item.student_id ? names.get(item.student_id) || '-' : '기존 반 전체',
    date: item.lesson_date, className: item.class_name, teacher: item.teacher_name,
    title: item.title, content: item.content, homework: item.homework || '-',
    note: item.special_note || '-', visible: item.is_parent_visible ? '공개' : '내부용',
  }));
}
