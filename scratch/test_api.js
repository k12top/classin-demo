const { SignJWT } = require("jose");
const path = require("path");
const fs = require("fs");

// Load .env manually
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const matched = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (matched) {
      const key = matched[1].trim();
      let val = matched[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const SESSION_SECRET = process.env.SESSION_SECRET
  ? process.env.SESSION_SECRET.split("#")[0].trim()
  : "NzPh.:-4[D";
const encodedKey = new TextEncoder().encode(SESSION_SECRET);

async function encrypt(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

async function main() {
  // Generate session payload for a mock student
  const studentPayload = {
    userId: "mock_student_uuid_12345",
    name: "mock_student_username",
    displayName: "Mock Student",
    avatar: "",
    role: "student",
    email: "student@example.com",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const token = await encrypt(studentPayload);
  const cookieHeader = `classroom_session=${token}`;
  
  const courseId = "1e18e8de-2e91-4218-947a-83a41662ac3f";

  console.log("1. GET /api/courses/" + courseId);
  let res = await fetch(`http://localhost:3000/api/courses/${courseId}`, {
    headers: {
      "Cookie": cookieHeader,
    }
  });
  console.log("Status:", res.status);
  let json = await res.json();
  console.log("Body:", JSON.stringify(json, null, 2));

  console.log("\n2. POST /api/courses/" + courseId + "/join-by-passcode with correct passcode '287714'");
  res = await fetch(`http://localhost:3000/api/courses/${courseId}/join-by-passcode`, {
    method: "POST",
    headers: {
      "Cookie": cookieHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ passcode: "287714" })
  });
  console.log("Status:", res.status);
  json = await res.json();
  console.log("Body:", JSON.stringify(json, null, 2));

  console.log("\n3. GET /api/courses/" + courseId + " (after joining)");
  res = await fetch(`http://localhost:3000/api/courses/${courseId}`, {
    headers: {
      "Cookie": cookieHeader,
    }
  });
  console.log("Status:", res.status);
  json = await res.json();
  console.log("Body:", JSON.stringify(json, null, 2));

  console.log("\n4. GET /api/courses/" + courseId + "/verify-access");
  res = await fetch(`http://localhost:3000/api/courses/${courseId}/verify-access`, {
    headers: {
      "Cookie": cookieHeader,
    }
  });
  console.log("Status:", res.status);
  json = await res.json();
  console.log("Body:", JSON.stringify(json, null, 2));

  console.log("\n5. GET /api/courses/search-by-passcode?passcode=287714");
  res = await fetch("http://localhost:3000/api/courses/search-by-passcode?passcode=287714", {
    headers: {
      "Cookie": cookieHeader,
    }
  });
  console.log("Status:", res.status);
  json = await res.json();
  console.log("Body:", JSON.stringify(json, null, 2));
}

main().catch(console.error);
