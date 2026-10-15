ALTER TABLE "user" ADD COLUMN "role" TEXT DEFAULT 'user';
ALTER TABLE "user" ADD COLUMN "banned" INTEGER DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "banReason" TEXT;
ALTER TABLE "user" ADD COLUMN "banExpires" DATE;

ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

UPDATE "user"
SET "role" = 'admin'
WHERE lower("email") = 'chris.kafrouni@gmail.com';
