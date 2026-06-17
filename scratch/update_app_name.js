const fs = require("fs");
const path = require("path");

const localesDir = path.resolve(__dirname, "../src/lib/i18n/locales");
const files = fs.readdirSync(localesDir);

files.forEach(file => {
  if (file === "index.ts") return;
  const filePath = path.join(localesDir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  
  if (content.includes("appName:")) {
    console.log(`${file} already has appName`);
    return;
  }
  
  if (file === "zh-CN.ts") {
    content = content.replace(/(add:\s*"添加",?)/, `$1\n    appName: "翔宇文淑直播平台",`);
  } else if (file === "en.ts") {
    content = content.replace(/(add:\s*"Add",?)/, `$1\n    appName: "Xiangyu Wenshu Live Platform",`);
  } else {
    const regex = /(common:\s*\{[^}]*?add:\s*(?:"[^"]*"|'[^']*'),?)/s;
    if (regex.test(content)) {
      content = content.replace(regex, `$1\n    appName: "Xiangyu Wenshu Live Platform",`);
    } else {
      console.log(`Could not find common add: in ${file}`);
    }
  }
  
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`Updated ${file}`);
});
