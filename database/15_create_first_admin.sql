-- ============================================================================
-- File 15: Make yourself the first administrator.
--
-- Do this AFTER files 01-14 and AFTER you have registered in the app with your UCC email
-- (and confirmed the email). Replace the two placeholders below, then run.
-- Afterwards you can promote lecturers from the app (Users & Roles page).
-- ============================================================================

SELECT public.bootstrap_initial_admin(u.id, 'YOUR FULL NAME')
FROM auth.users u
WHERE lower(u.email) = lower('YOUR-EMAIL@ucc.edu.gh');

-- Expected result: one row showing your profile with role = admin.
-- If it returns no rows, the email is not registered yet.
