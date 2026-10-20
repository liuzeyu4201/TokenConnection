-- Follow-up plans are per-owner content. Applied by enable-rls.ts on every
-- migrate, including after people RLS is already on. Not a drizzle journal entry.

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_ups_owner_all ON follow_ups;
CREATE POLICY follow_ups_owner_all ON follow_ups
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
