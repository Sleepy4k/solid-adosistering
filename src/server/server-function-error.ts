import "server-only";
import type { ServerFunctionErrorHandler } from "@solidjs/start/server";

/**
 * Server function errors cross the network boundary, so production responses
 * must never include stack traces, SQL, file paths, or credential fragments.
 * SolidStart already strips stacks in production; this handler also replaces
 * unexpected Error objects with a generic message while preserving thrown
 * Responses (validation, auth, and redirect control flow).
 */
const onServerFunctionError: ServerFunctionErrorHandler = (thrown) => {
  if (thrown instanceof Response) return thrown;

  if (thrown instanceof Error) {
    console.error("[server-function]", thrown.name, thrown.message, thrown.stack);
    if (process.env.NODE_ENV === "production") {
      return new Error("Terjadi kesalahan pada server. Silakan coba lagi.");
    }
    return thrown;
  }

  console.error("[server-function] non-error thrown", thrown);
  return new Error("Terjadi kesalahan pada server. Silakan coba lagi.");
};

export default onServerFunctionError;
