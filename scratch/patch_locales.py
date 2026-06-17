import os
import re

locales_dir = "/Users/houshuai/project/ai_project/classroom/src/lib/i18n/locales"
exclude_files = {"index.ts", "zh-CN.ts", "en.ts"}

files = [f for f in os.listdir(locales_dir) if f.endswith(".ts") and f not in exclude_files]

for fname in files:
    path = os.path.join(locales_dir, fname)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add common.roomTypePublic
    if "roomTypePublic" not in content:
        content = re.sub(
            r'(roomTypeBig:\s*".*?",)',
            r'\1\n    roomTypePublic: "Public Class",',
            content
        )

    # 2. Add teacherDashboard keys
    if "roomDescPublic" not in content:
        content = re.sub(
            r'(btnCreateCourse:\s*".*?",)',
            r'roomDescPublic: "Anyone with the 6-digit passcode can join",\n    fieldPasscode: "Passcode",\n    fieldPasscodePlaceholder: "6-digit passcode, leave blank to auto-generate",\n    errPasscodeInvalid: "Passcode must be exactly 6 digits",\n    \1',
            content
        )

    # 3. Add courseDetail keys
    if "passcodeLabel" not in content:
        content = re.sub(
            r'(copyFailed:\s*".*?",)',
            r'\1\n    passcodeLabel: "Passcode",\n    copyPasscodeSuccess: "Passcode copied to clipboard",',
            content
        )

    # 4. Add passcodeGate namespace inside the main dictionary
    if "passcodeGate" not in content:
        # Match the end of settingsPanel and the end of the main dictionary object
        content = re.sub(
            r'\n\s*\}\s*,\s*\n\s*\}\s*;\s*$',
            r'\n  },\n  passcodeGate: {\n    title: "Enter Passcode to Join",\n    desc: "This is a public class. Please enter the 6-digit passcode to join.",\n    inputPlaceholder: "Enter 6-digit passcode",\n    btnJoin: "Verify & Join",\n    errInvalidPasscode: "Incorrect passcode, please try again",\n    successJoin: "Verification successful! Joining classroom...",\n  },\n};',
            content
        )

    # 5. Add studentDashboard keys
    if "joinPublicClassTitle" not in content:
        content = re.sub(
            r'(livePlayback:\s*".*?",)',
            r'\1\n    joinPublicClassTitle: "🔑 Join Public Class",\n    joinPublicClassDesc: "Enter the Course ID shared by the teacher and verify the passcode to join.",\n    joinPublicClassPlaceholder: "Enter 36-digit Course ID (UUID)...",\n    joinPublicClassBtn: "Join",',
            content
        )

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

print("Locales patched successfully.")
