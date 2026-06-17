const fs = require("fs");
const path = require("path");

const localesDir = path.resolve(__dirname, "../src/lib/i18n/locales");
const files = fs.readdirSync(localesDir);

const newKeys = `
    errInvalidCourseId: "Please enter a valid 36-digit Course ID or 6-digit passcode",
    errPasscodeNotFound: "No matching public course found. Please check the passcode or if the course has started",`;

files.forEach(file => {
  if (file === "zh-CN.ts" || file === "en.ts" || file === "index.ts") {
    return;
  }
  const filePath = path.join(localesDir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  
  // Find where joinPublicClassBtn is
  const regex = /(joinPublicClassBtn:\s*(?:"[^"]*"|'[^']*'),?)/;
  if (regex.test(content)) {
    content = content.replace(regex, `$1${newKeys}`);
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`Updated ${file}`);
  } else {
    console.log(`Warning: Could not find joinPublicClassBtn in ${file}`);
  }
});
