"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, ClipboardEvent, useState } from "react";
import { BookOpen, Home, Key, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type JoinLinkPasscodeGateProps = {
  token: string;
  purpose: "course" | "live";
  title: string;
  description: string;
  linkLabel: string;
  buttonLabel: string;
  backLabel: string;
  errorFallback: string;
  courseName?: string;
  teacherName?: string;
  embed?: boolean;
  lang?: string;
};

export default function JoinLinkPasscodeGate({
  token,
  purpose,
  title,
  description,
  linkLabel,
  buttonLabel,
  backLabel,
  errorFallback,
  courseName,
  teacherName,
  embed,
  lang,
}: JoinLinkPasscodeGateProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const Icon = purpose === "live" ? Video : BookOpen;

  const handleDigitChange = (index: number, value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const nextDigits = [...digits];
    nextDigits[index] = cleanValue ? cleanValue.slice(-1) : "";
    setDigits(nextDigits);
    setError("");

    if (cleanValue && index < 5) {
      document.getElementById(`join-link-digit-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      setDigits(nextDigits);
      document.getElementById(`join-link-digit-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;

    const nextDigits = Array(6).fill("");
    for (let index = 0; index < pasted.length; index += 1) {
      nextDigits[index] = pasted[index] || "";
    }
    setDigits(nextDigits);
    setError("");
    document
      .getElementById(`join-link-digit-${Math.min(pasted.length, 5)}`)
      ?.focus();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const passcode = digits.join("");
    if (passcode.length !== 6) {
      setError(errorFallback);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/join-links/${encodeURIComponent(token)}/verify-passcode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ purpose, passcode, embed, lang }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : errorFallback);
        return;
      }
      router.replace(typeof data.redirectTo === "string" ? data.redirectTo : "/");
    } catch {
      setError(errorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl flex-col items-center justify-center gap-6">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span>{linkLabel}</span>
        </div>

        <Card className="w-full overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
          <CardHeader className="items-center px-6 pb-4 pt-8 text-center sm:px-8">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Key className="h-8 w-8" />
            </div>
            <CardTitle className="max-w-md text-balance text-2xl font-bold leading-tight tracking-normal sm:text-3xl">
              {title}
            </CardTitle>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {description}
            </p>
            {courseName ? (
              <div className="mt-4 w-full max-w-md rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-left">
                <div className="truncate text-sm font-semibold text-foreground">
                  {courseName}
                </div>
                {teacherName ? (
                  <div className="mt-1 truncate text-xs font-medium text-muted-foreground">
                    {teacherName}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="px-6 pb-8 sm:px-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex justify-center gap-2.5">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    id={`join-link-digit-${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(event) =>
                      handleDigitChange(index, event.target.value)
                    }
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                    aria-label={`Passcode digit ${index + 1}`}
                    className="h-14 w-11 rounded-lg border border-input bg-background text-center font-mono text-2xl font-bold text-foreground shadow-sm transition-all hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-none sm:w-12"
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-center text-xs font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={submitting || digits.some((digit) => !digit)}
                className="h-12 w-full rounded-xl font-semibold active:scale-[0.98]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {buttonLabel}
                  </>
                ) : (
                  buttonLabel
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t border-border/70 bg-muted/20 px-6 py-5 sm:px-8">
            <Button asChild variant="ghost" className="rounded-xl">
              <Link href="/">
                <Home className="h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
