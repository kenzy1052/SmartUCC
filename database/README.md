# CDE Exams: database setup

These SQL files build the whole database for a **new, empty Supabase project**. They contain no demo data.

## Rules (this is what caused errors before)

1. Run the files **one at a time, in numeric order**, each in its own SQL Editor run. Never paste several together.
2. Wait for "Success" before the next file.
3. Files 01 to 14 install the system. 15 and 99 are helpers (see below). 00 is only for recovery.

## How to run a file

Supabase dashboard > **SQL Editor** > **New query** > paste the whole file > **Run**. Repeat for the next file.

## Order

| File | What it sets up |
|---|---|
| 01_extensions_and_types.sql | Extensions, status types, time helper |
| 02_tables_and_triggers.sql | All tables, constraints, institution row |
| 03_security_policies.sql | Row Level Security and permissions |
| 04_exam_engine.sql | Start, answer, submit, grade, results |
| 05_analytics_and_exports.sql | Statistics and CSV export |
| 06_auto_submit_schedule.sql | Auto-submit of expired attempts (pg_cron, if available) |
| 07_question_types_and_grading.sql | Question types and marking rules |
| 08_profiles_and_cohorts.sql | Profile fields, cohorts, auto-enrolment |
| 09_exam_windows_and_retakes.sql | Open/close times, retake cooldowns, overrides |
| 10_live_monitoring.sql | Live exam monitoring |
| 11_ucc_email_and_index_number.sql | `ucc.edu.gh` email rule, index-number sign-in |
| 12_lecturer_role.sql | Adds the lecturer role. **Run alone.** |
| 13_lecturer_permissions.sql | What lecturers can and cannot do, role management |
| 14_marking_and_approval.sql | Marking queue and result approval |

## After file 14

1. Run **99_check_setup.sql**. Every row must say `OK`.
2. In Supabase: **Authentication > Providers > Email**: turn **Confirm email** ON.
3. Start the app and register with your UCC email. Confirm the email.
4. Edit **15_create_first_admin.sql** (your name and email), then run it. You are now the administrator and can promote lecturers in the app (Users & Roles).

## If a file fails

- "already exists" errors mean an earlier attempt left things behind. On the **new, empty project only**, run `00_reset_new_project.sql` (it deletes everything), then start again from file 01.
- Otherwise copy the exact error message and the file number.
