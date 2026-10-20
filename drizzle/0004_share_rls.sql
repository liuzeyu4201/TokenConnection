-- Share-table policies. Child tables carry owner_id so policies do not subquery
-- back into shares (that recursion makes INSERT fail with 42P17).
-- Applied by enable-rls.ts. Not a drizzle journal entry.

ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shares_owner_all ON shares;
CREATE POLICY shares_owner_all ON shares
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS shares_reader_select ON shares;
CREATE POLICY shares_reader_select ON shares
  FOR SELECT TO tc_app
  USING (
    EXISTS (
      SELECT 1 FROM share_recipients r
      WHERE r.share_id = shares.id
        AND r.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM share_links l
      WHERE l.share_id = shares.id
        AND l.token_hash = current_setting('app.share_token_hash', true)
        AND current_setting('app.share_token_hash', true) <> ''
        AND l.revoked_at IS NULL
        AND l.expires_at > now()
    )
  );

ALTER TABLE share_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_items_owner_all ON share_items;
CREATE POLICY share_items_owner_all ON share_items
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS share_items_reader_select ON share_items;
CREATE POLICY share_items_reader_select ON share_items
  FOR SELECT TO tc_app
  USING (
    EXISTS (
      SELECT 1 FROM share_recipients r
      WHERE r.share_id = share_items.share_id
        AND r.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM share_links l
      WHERE l.share_id = share_items.share_id
        AND l.token_hash = current_setting('app.share_token_hash', true)
        AND current_setting('app.share_token_hash', true) <> ''
        AND l.revoked_at IS NULL
        AND l.expires_at > now()
    )
  );

ALTER TABLE share_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_recipients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_recipients_select ON share_recipients;
CREATE POLICY share_recipients_select ON share_recipients
  FOR SELECT TO tc_app
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
DROP POLICY IF EXISTS share_recipients_insert ON share_recipients;
CREATE POLICY share_recipients_insert ON share_recipients
  FOR INSERT TO tc_app
  WITH CHECK (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
DROP POLICY IF EXISTS share_recipients_update ON share_recipients;
CREATE POLICY share_recipients_update ON share_recipients
  FOR UPDATE TO tc_app
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR owner_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
DROP POLICY IF EXISTS share_recipients_delete ON share_recipients;
CREATE POLICY share_recipients_delete ON share_recipients
  FOR DELETE TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_links_owner_all ON share_links;
CREATE POLICY share_links_owner_all ON share_links
  FOR ALL TO tc_app
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS share_links_visitor_select ON share_links;
CREATE POLICY share_links_visitor_select ON share_links
  FOR SELECT TO tc_app
  USING (
    token_hash = current_setting('app.share_token_hash', true)
    AND current_setting('app.share_token_hash', true) <> ''
  );
DROP POLICY IF EXISTS share_links_visitor_update ON share_links;
CREATE POLICY share_links_visitor_update ON share_links
  FOR UPDATE TO tc_app
  USING (
    token_hash = current_setting('app.share_token_hash', true)
    AND current_setting('app.share_token_hash', true) <> ''
    AND revoked_at IS NULL
  )
  WITH CHECK (
    token_hash = current_setting('app.share_token_hash', true)
    AND current_setting('app.share_token_hash', true) <> ''
  );
