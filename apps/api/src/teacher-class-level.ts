export function resolveTeacherStudentClassLevel(
  studentClassLevel: number | null | undefined,
  classroomClassLevel: number,
): number {
  return studentClassLevel ?? classroomClassLevel;
}
