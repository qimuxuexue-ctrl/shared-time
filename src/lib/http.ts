import type { ZodError } from "zod";

export function validationError(error: ZodError) {
  return Response.json(
    {
      error: error.issues[0]?.message ?? "提交内容不正确",
    },
    { status: 400 },
  );
}

export function serverError(message = "服务器暂时无法完成操作") {
  return Response.json({ error: message }, { status: 500 });
}

