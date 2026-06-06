import { z } from "zod";

// Password policy: length over complexity (copy.md `signup.password.helper`
// nudges a passphrase). ≥12 chars per AC1.
export const PASSWORD_MIN = 12;

export const emailSchema = z.string().trim().email();
export const passwordSchema = z.string().min(PASSWORD_MIN);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/** Password strength score 0–4 for the meter (text-equivalent provided in UI). */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
} {
  if (password.length < PASSWORD_MIN) return { score: 0, label: "Too short" };
  let score = 1;
  if (password.length >= 16) score++;
  if (/\s/.test(password)) score++; // passphrase bonus (spaces)
  if (/[^A-Za-z0-9]/.test(password) || (/[A-Za-z]/.test(password) && /[0-9]/.test(password)))
    score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const label = (["Too short", "Weak", "Fair", "Good", "Strong"] as const)[clamped];
  return { score: clamped, label };
}
