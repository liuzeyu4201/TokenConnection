-- Second release of phase A. Applied by src/db/enable-rls.ts after /setup
-- claims existing rows. Not in the drizzle journal, so `pnpm db:migrate` can
-- add the nullable columns first.

ALTER TABLE people ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE tags ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE events ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE people_embeddings ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE inbox ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS people_owner_all ON people;
CREATE POLICY people_owner_all ON people
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_owner_all ON tags;
CREATE POLICY tags_owner_all ON tags
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_owner_all ON events;
CREATE POLICY events_owner_all ON events
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE people_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_embeddings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS people_embeddings_owner_all ON people_embeddings;
CREATE POLICY people_embeddings_owner_all ON people_embeddings
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_owner_all ON inbox;
CREATE POLICY inbox_owner_all ON inbox
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE people_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS people_tags_owner_all ON people_tags;
CREATE POLICY people_tags_owner_all ON people_tags
  FOR ALL TO tc_app
  USING (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = people_tags.person_id
        AND p.owner_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = people_tags.person_id
        AND p.owner_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );
