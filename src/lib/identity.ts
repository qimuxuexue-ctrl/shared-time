import { z } from "zod";

const allowedIdentityPattern = /^[\p{L}\p{N}_-]+$/u;

export const identityInputSchema = z.object({
  id: z
    .string()
    .transform((value) => value.normalize("NFKC").trim())
    .pipe(
      z
        .string()
        .min(2, "ID 至少需要 2 个字符")
        .max(24, "ID 最多只能有 24 个字符")
        .regex(allowedIdentityPattern, "ID 只能包含中文、英文字母、数字、_ 或 -"),
    ),
});

export function normalizeIdentityKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

