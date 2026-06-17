import dotenv from "dotenv";
import { encrypt, decrypt } from "../src/lib/session";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  console.log("SESSION_SECRET in env:", process.env.SESSION_SECRET);

  const payload = {
    userId: "mock_student_uuid_12345",
    name: "mock_student_username",
    displayName: "Mock Student",
    avatar: "",
    role: "student" as const,
    email: "student@example.com",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const encrypted = await encrypt(payload);
  console.log("Encrypted token:", encrypted);

  const decrypted = await decrypt(encrypted);
  console.log("Decrypted payload:", decrypted);

  if (decrypted) {
    console.log("Success! JWT encrypt and decrypt are matching.");
  } else {
    console.log("Failed! Decryption returned null.");
  }
}

main().catch(console.error);
