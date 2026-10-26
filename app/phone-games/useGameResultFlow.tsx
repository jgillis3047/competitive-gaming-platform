import React, { useCallback, useState } from "react";

import {
  pollChallengeOutcome,
  type ChallengeOutcome,
  outcomeHeadline,
} from "../../lib/backend/challengeActions";
import {
  finishGameSession,
  type FinishGameSessionResult,
} from "../../lib/data/finishGameSession";
import { useAuthStore } from "../../lib/data/authStore";
import { useChallengeOpponent } from "../../lib/phone-games/useChallengeOpponent";
import MatchResultModal from "../../lib/ui/MatchResultModal";
import { mediumTap, success } from "../../lib/utils/haptics";
import GameResultModal from "./components/GameResultModal";

type ShowResultOpts = {
  score?: number | null;
  timeSec?: number | null;
  headline?: string;
  scoreLabel?: string | null;
  timeLabel?: string | null;
};

export function useGameResultFlow(gameKey: string, gameTitle: string, challengeId: string | null) {
  const user = useAuthStore((s) => s.user);
  const opponentUserId = useChallengeOpponent(challengeId);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"practice" | "challenge">("practice");
  const [headline, setHeadline] = useState("");
  const [scoreLabel, setScoreLabel] = useState<string | null>(null);
  const [timeLabel, setTimeLabel] = useState<string | null>(null);
  const [session, setSession] = useState<FinishGameSessionResult | null>(null);
  const [outcome, setOutcome] = useState<ChallengeOutcome | null>(null);
  const [playAgainFn, setPlayAgainFn] = useState<(() => void) | null>(null);

  const showPracticeResult = useCallback(
    async (opts: ShowResultOpts, playAgain: () => void) => {
      const s = await finishGameSession({
        gameKey,
        score: opts.score,
        timeSec: opts.timeSec,
        logPracticeHistory: true,
      });
      if (s.isPersonalBest) success();
      else mediumTap();
      setSession(s);
      setOutcome(null);
      setMode("practice");
      setHeadline(opts.headline ?? (s.isPersonalBest ? "New personal best!" : "Run complete"));
      setScoreLabel(opts.scoreLabel ?? null);
      setTimeLabel(opts.timeLabel ?? null);
      setPlayAgainFn(() => playAgain);
      setVisible(true);
      return s;
    },
    [gameKey]
  );

  const presentChallengeResult = useCallback(
    async (opts: ShowResultOpts, resolved: ChallengeOutcome | null) => {
      const s = await finishGameSession({
        gameKey,
        score: opts.score,
        timeSec: opts.timeSec,
      });
      setSession(s);
      setOutcome(resolved);
      setMode("challenge");
      setPlayAgainFn(null);

      if (resolved?.status === "completed") {
        if (resolved.won === true) success();
        else mediumTap();
        setHeadline(opts.headline ?? outcomeHeadline(resolved));
      } else {
        success();
        setHeadline(opts.headline ?? "Submitted — waiting on opponent");
      }

      setScoreLabel(opts.scoreLabel ?? null);
      setTimeLabel(opts.timeLabel ?? null);
      setVisible(true);
      return s;
    },
    [gameKey]
  );

  const showChallengeSubmitted = useCallback(
    async (opts: ShowResultOpts) => {
      let resolved: ChallengeOutcome | null = null;
      if (challengeId && user?.id) {
        resolved = await pollChallengeOutcome({ challengeId, userId: user.id });
      }
      return presentChallengeResult(opts, resolved);
    },
    [challengeId, user?.id, presentChallengeResult]
  );

  const showChallengeOutcome = useCallback(
    async (opts: ShowResultOpts & { won: boolean }) => {
      let resolved: ChallengeOutcome | null = null;
      if (challengeId && user?.id) {
        resolved = await pollChallengeOutcome({ challengeId, userId: user.id });
      }
      if (!resolved || resolved.status !== "completed") {
        resolved = {
          status: "completed",
          won: opts.won,
          winnerUserId: null,
          winnerDisplayName: null,
          myScore: opts.score ?? null,
          opponentScore: null,
          rewardCents: null,
          gameType: gameKey,
        };
      }
      return presentChallengeResult(opts, resolved);
    },
    [challengeId, user?.id, gameKey, presentChallengeResult]
  );

  function ResultModal() {
    if (mode === "practice") {
      return (
        <GameResultModal
          visible={visible}
          gameKey={gameKey}
          gameTitle={gameTitle}
          mode="practice"
          headline={headline}
          scoreLabel={scoreLabel}
          timeLabel={timeLabel}
          session={session}
          challengeId={challengeId}
          opponentUserId={opponentUserId}
          onPlayAgain={() => {
            setVisible(false);
            playAgainFn?.();
          }}
          onClose={() => setVisible(false)}
        />
      );
    }

    return (
      <MatchResultModal
        visible={visible}
        gameTitle={gameTitle}
        gameKey={gameKey}
        outcome={outcome}
        scoreLabel={scoreLabel}
        timeLabel={timeLabel}
        challengeId={challengeId}
        opponentUserId={opponentUserId}
        onClose={() => setVisible(false)}
      />
    );
  }

  return {
    opponentUserId,
    showPracticeResult,
    showChallengeSubmitted,
    showChallengeOutcome,
    closeResult: () => setVisible(false),
    ResultModal,
  };
}
