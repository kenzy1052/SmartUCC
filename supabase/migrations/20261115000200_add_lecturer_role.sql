-- Migration 0012: add the lecturer role (must be its own migration: a new enum value
-- cannot be used in the transaction that adds it).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'lecturer';
