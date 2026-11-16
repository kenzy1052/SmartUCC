import {
  AccountStatus,
  AssignmentStatus,
  AuthenticatedActor,
  CreateExamInput,
  DemoAccountSummary,
  ExamAccessSettingsInput,
  ExportResultRow,
  MembershipStatus,
  Profile,
  ResultReleasePolicy,
  UpsertQuestionInput,
} from '../types/domain.ts';

export interface SignInResult {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  profile: Profile;
}

export interface SignUpInput {
  email: string;
  index_number: string;
  full_name: string;
  password: string;
}

export type SignUpResult =
  | { status: 'signed_in'; session: SignInResult }
  | { status: 'verification_required'; email: string };

export interface BackendGateway {
  // Authentication & Session
  verifyBearerToken(token: string): Promise<AuthenticatedActor>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signInWithPassword(identifier: string, password: string): Promise<SignInResult>;
  requestPasswordReset(email: string, redirectTo?: string): Promise<void>;
  updateOwnFullName(actor: AuthenticatedActor, fullName: string): Promise<Profile>;
  getDemoAccounts?(): Promise<DemoAccountSummary[]>;

  // Admin: Student & Class Management
  adminCreateStudentAccount(
    actor: AuthenticatedActor,
    params: {
      email: string;
      index_number: string;
      password: string;
      full_name: string;
      account_status?: AccountStatus;
    }
  ): Promise<Profile>;
  adminUpdateStudentProfile(
    actor: AuthenticatedActor,
    params: {
      student_id: string;
      full_name: string;
      student_identifier?: string | null;
      account_status: AccountStatus;
    }
  ): Promise<Profile>;
  adminListStudents(actor: AuthenticatedActor): Promise<Profile[]>;
  adminListMarkingQueue(actor: AuthenticatedActor, examId?: string | null): Promise<unknown>;
  adminMarkingSummary(actor: AuthenticatedActor): Promise<unknown>;
  adminMarkWrittenAnswer(
    actor: AuthenticatedActor,
    resultId: string,
    questionId: string,
    marksAwarded: number,
    comment?: string | null
  ): Promise<unknown>;
  adminApproveExamResults(
    actor: AuthenticatedActor,
    examId: string,
    resultId?: string | null
  ): Promise<unknown>;
  adminSetExamMarkingApproval(
    actor: AuthenticatedActor,
    examId: string,
    required: boolean
  ): Promise<unknown>;
  adminListUsers(actor: AuthenticatedActor): Promise<unknown>;
  adminSetUserRole(
    actor: AuthenticatedActor,
    userId: string,
    role: 'student' | 'lecturer'
  ): Promise<unknown>;
  adminListClasses(actor: AuthenticatedActor): Promise<unknown>;
  adminCreateClass(
    actor: AuthenticatedActor,
    name: string,
    description?: string | null
  ): Promise<unknown>;
  adminSetClassMembership(
    actor: AuthenticatedActor,
    classId: string,
    studentId: string,
    status: MembershipStatus
  ): Promise<unknown>;

  // Admin: Examination & Question Management
  adminListExams(actor: AuthenticatedActor): Promise<unknown>;
  adminGetExamQuestions(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminCreateExam(actor: AuthenticatedActor, input: CreateExamInput): Promise<unknown>;
  adminUpsertQuestion(
    actor: AuthenticatedActor,
    examId: string,
    input: UpsertQuestionInput
  ): Promise<unknown>;
  adminPublishExam(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminArchiveExam(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminUpdateReleaseSettings(
    actor: AuthenticatedActor,
    examId: string,
    settings: {
      result_release_policy?: ResultReleasePolicy;
      results_released_manually?: boolean;
      allow_review?: boolean;
    }
  ): Promise<unknown>;
  adminUpdateExamAccess(
    actor: AuthenticatedActor,
    examId: string,
    settings: ExamAccessSettingsInput
  ): Promise<unknown>;
  adminOverrideExamCooldown(
    actor: AuthenticatedActor,
    examId: string,
    options?: { student_id?: string | null; reason?: string | null }
  ): Promise<unknown>;
  adminAssignExam(
    actor: AuthenticatedActor,
    examId: string,
    target: { student_id?: string | null; class_id?: string | null; status?: AssignmentStatus }
  ): Promise<unknown>;
  adminCorrectResult(
    actor: AuthenticatedActor,
    resultId: string,
    correctedMarks: number,
    reason: string
  ): Promise<unknown>;
  adminGradeResultItem(
    actor: AuthenticatedActor,
    resultId: string,
    questionId: string,
    marksAwarded: number,
    reason: string
  ): Promise<unknown>;

  // Student: Examination Workflow
  studentListEligibleExams(actor: AuthenticatedActor): Promise<unknown>;
  studentStartOrResumeAttempt(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  studentGetAttemptQuestions(actor: AuthenticatedActor, attemptId: string): Promise<unknown>;
  studentSaveAnswer(
    actor: AuthenticatedActor,
    attemptId: string,
    questionId: string,
    selectedOptionId: string | null,
    answerValue?: string | null
  ): Promise<unknown>;
  studentSubmitAttempt(actor: AuthenticatedActor, attemptId: string): Promise<unknown>;
  studentGetReleasedResults(actor: AuthenticatedActor): Promise<unknown>;
  studentGetAttemptReview(actor: AuthenticatedActor, attemptId: string): Promise<unknown>;
  studentRecordQuestionPosition(
    actor: AuthenticatedActor,
    attemptId: string,
    questionIndex: number
  ): Promise<unknown>;

  // Admin: Analytics, Monitoring, & Exports
  adminGetExamStatistics(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminListExamAttempts(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminGetAttemptDetail(actor: AuthenticatedActor, attemptId: string): Promise<unknown>;
  adminListLiveMonitoring(actor: AuthenticatedActor, examId?: string | null): Promise<unknown>;
  adminGetAttemptLiveStatus(actor: AuthenticatedActor, attemptId: string): Promise<unknown>;
  adminGetQuestionAnalytics(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminGetClassPerformanceSummary(actor: AuthenticatedActor, examId: string): Promise<unknown>;
  adminExportExamResultsRows(actor: AuthenticatedActor, examId: string): Promise<ExportResultRow[]>;
  adminListAuditLogs(actor: AuthenticatedActor, limit?: number): Promise<unknown>;

  // Scheduled / System Operations
  finalizeExpiredAttemptsSweep(batchLimit?: number): Promise<unknown>;
}
