// components/thread/threadMessageTypes.ts

export type PromptType =
  | "prompt_check_in"
  | "prompt_submit_result"
  | "prompt_play_turn"
  | "prompt_accept_rematch";

export function isPromptType(t?: string | null): t is PromptType {
  const x = String(t ?? "").toLowerCase();
  return (
    x === "prompt_check_in" ||
    x === "prompt_submit_result" ||
    x === "prompt_play_turn" ||
    x === "prompt_accept_rematch"
  );
}

export function isEventLike(t?: string | null) {
  const x = String(t ?? "").toLowerCase();
  if (!x) return false;
  if (x === "text") return false;
  // prompt types are not "event-like" (they render as action prompts)
  if (isPromptType(x)) return false;
  return true;
}
