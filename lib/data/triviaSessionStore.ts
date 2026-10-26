import { create } from "zustand";
import type { TriviaParticipant } from "../backend/trivia";

type TriviaSessionState = {
  sessions: Record<string, TriviaParticipant>;
  setParticipant: (roomId: string, participant: TriviaParticipant) => void;
  getParticipant: (roomId: string) => TriviaParticipant | null;
  clearRoom: (roomId: string) => void;
};

export const useTriviaSessionStore = create<TriviaSessionState>((set, get) => ({
  sessions: {},
  setParticipant: (roomId, participant) =>
    set((s) => ({
      sessions: { ...s.sessions, [roomId]: participant },
    })),
  getParticipant: (roomId) => get().sessions[roomId] ?? null,
  clearRoom: (roomId) =>
    set((s) => {
      const next = { ...s.sessions };
      delete next[roomId];
      return { sessions: next };
    }),
}));
