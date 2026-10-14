-- Artifacts are always visible to every member of their organization.
ALTER TABLE artifact DROP COLUMN visibility;
