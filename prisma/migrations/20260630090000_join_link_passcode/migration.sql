-- Optional per-link passcode for course share and live join links.
ALTER TABLE "CourseJoinLink"
ADD COLUMN "passcode" TEXT;
