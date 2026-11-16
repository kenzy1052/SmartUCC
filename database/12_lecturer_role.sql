-- RUN THIS FILE ON ITS OWN in the Supabase SQL Editor (File 12 of 14), after the files before it.
-- File 12: add the lecturer role (must be its own migration: a new enum value
-- cannot be used in the transaction that adds it).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'lecturer';
