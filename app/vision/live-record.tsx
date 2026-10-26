// app/vision/live-record.tsx — Live counter recording entry
import { useLocalSearchParams } from "expo-router";
import React from "react";

import LiveRecordScreen from "../components/LiveRecordScreen";
import type { ShootingSessionType } from "../../lib/models/visionTypes";

export default function LiveRecordRoute() {
  const params = useLocalSearchParams<{
    flow?: string;
    recordSlug?: string;
    sessionType?: string;
    challengeId?: string;
    timeLimitSec?: string;
  }>();

  const flow = params.flow === "practice" ? "practice" : "shooting";
  const sessionType = (["free_throw", "three_point", "midrange", "mixed"] as const).includes(
    params.sessionType as ShootingSessionType
  )
    ? (params.sessionType as ShootingSessionType)
    : "free_throw";

  const timeLimitSec = params.timeLimitSec ? Number(params.timeLimitSec) : null;

  return (
    <LiveRecordScreen
      flow={flow}
      recordSlug={params.recordSlug ?? null}
      sessionType={sessionType}
      challengeId={params.challengeId ?? null}
      timeLimitSec={Number.isFinite(timeLimitSec) ? timeLimitSec : null}
    />
  );
}
