import type { Href } from "expo-router";

export function liveRecordHref(params: {
  flow: "shooting" | "practice";
  recordSlug?: string | null;
  sessionType?: string | null;
  challengeId?: string | null;
  timeLimitSec?: number | null;
}): Href {
  const q = new URLSearchParams();
  q.set("flow", params.flow);
  if (params.recordSlug) q.set("recordSlug", params.recordSlug);
  if (params.sessionType) q.set("sessionType", params.sessionType);
  if (params.challengeId) q.set("challengeId", params.challengeId);
  if (params.timeLimitSec != null) q.set("timeLimitSec", String(params.timeLimitSec));
  return `/vision/live-record?${q.toString()}` as Href;
}
