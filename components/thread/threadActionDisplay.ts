// components/thread/threadActionDisplay.ts

import { isPromptType, PromptType } from "./threadMessageTypes";

export type ThreadPromptConfig = {
  promptType: PromptType;
  title: string;
  subtitle?: string;
  yesText: string;
  noText: string;
};

export function promptConfigFor(type?: string | null, payload?: any): ThreadPromptConfig | null {
  const t = String(type ?? "").toLowerCase();
  if (!isPromptType(t)) return null;

  const yesText = String(payload?.yes_text ?? "Yes");
  const noText = String(payload?.no_text ?? "No");

  if (t === "prompt_check_in") {
    return {
      promptType: "prompt_check_in",
      title: String(payload?.label ?? "Check in now?"),
      subtitle: payload?.subtitle ? String(payload.subtitle) : undefined,
      yesText,
      noText,
    };
  }

  if (t === "prompt_submit_result") {
    return {
      promptType: "prompt_submit_result",
      title: String(payload?.label ?? "Submit your result now?"),
      subtitle: payload?.subtitle ? String(payload.subtitle) : undefined,
      yesText: String(payload?.yes_text ?? "Submit"),
      noText: String(payload?.no_text ?? "Not yet"),
    };
  }

  if (t === "prompt_play_turn") {
    return {
      promptType: "prompt_play_turn",
      title: String(payload?.label ?? "It’s your turn."),
      subtitle: payload?.subtitle ? String(payload.subtitle) : undefined,
      yesText: String(payload?.yes_text ?? "Play"),
      noText: String(payload?.no_text ?? "Later"),
    };
  }

  if (t === "prompt_accept_rematch") {
    return {
      promptType: "prompt_accept_rematch",
      title: String(payload?.label ?? "Rematch?"),
      subtitle: payload?.subtitle ? String(payload.subtitle) : undefined,
      yesText: String(payload?.yes_text ?? "Accept"),
      noText: String(payload?.no_text ?? "Decline"),
    };
  }

  return null;
}
