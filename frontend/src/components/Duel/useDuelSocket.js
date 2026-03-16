import { useState, useEffect, useRef, useCallback } from "react";

const WS_BASE = (import.meta.env.VITE_API_URL || "")
  .replace(/^http/, "ws") || `ws://${window.location.host}`;

export default function useDuelSocket(roomCode, onConnect) {
  const [gameState, setGameState] = useState({
    phase: "connecting",
    players: [],
    currentQuestion: null,
    round: 0,
    totalRounds: 0,
    timerSeconds: 20,
    rankings: [],
    myPlayerId: null,
    myScore: 0,
    myStreak: 0,
    myAlive: true,
    answered: false,
    answeredCount: 0,
    totalPlayers: 0,
    mode: "duel",
    winner: null,
    roomCode: roomCode,
    correctInfo: null,
    playerResults: [],
    eliminations: [],
    error: null,
  });

  const wsRef = useRef(null);
  const pingRef = useRef(null);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const send = useCallback((action, data = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...data }));
    }
  }, []);

  const setAnswered = useCallback(() => {
    setGameState((s) => ({ ...s, answered: true }));
  }, []);

  useEffect(() => {
    if (!roomCode) return;

    const ws = new WebSocket(`${WS_BASE}/ws/duel/${roomCode}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setGameState((s) => ({ ...s, phase: "connected", error: null }));
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
      // Fire callback directly in onopen — bypasses React render cycle
      if (onConnectRef.current) {
        onConnectRef.current(ws);
      }
    };

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      const { event, data } = msg;

      setGameState((prev) => {
        switch (event) {
          case "pong":
            return prev;

          case "host_connected":
            return {
              ...prev,
              phase: data.phase || "lobby",
              players: data.players || [],
              totalRounds: data.total_rounds,
              timerSeconds: data.timer_seconds,
              mode: data.mode,
              roomCode: data.room_code,
            };

          case "joined":
            return {
              ...prev,
              phase: "lobby",
              myPlayerId: data.player_id,
              players: data.room?.players || prev.players,
              totalRounds: data.room?.total_rounds || prev.totalRounds,
              timerSeconds: data.room?.timer_seconds || prev.timerSeconds,
              mode: data.room?.mode || prev.mode,
            };

          case "player_joined":
            return {
              ...prev,
              players: prev.players.some((p) => p.id === data.id)
                ? prev.players
                : [...prev.players, { id: data.id, name: data.name }],
              totalPlayers: data.player_count,
            };

          case "player_left":
            return { ...prev, totalPlayers: data.player_count };

          case "game_starting":
            return { ...prev, phase: "countdown" };

          case "new_question":
            return {
              ...prev,
              phase: "question",
              currentQuestion: data.question,
              round: data.round,
              totalRounds: data.total_rounds,
              timerSeconds: data.timer_seconds,
              answered: false,
              answeredCount: 0,
              correctInfo: null,
              playerResults: [],
              eliminations: [],
            };

          case "player_answered":
            return {
              ...prev,
              answeredCount: data.answered_count,
              totalPlayers: data.total_players,
            };

          case "round_results": {
            const me = data.players?.find((p) => p.id === prev.myPlayerId);
            return {
              ...prev,
              phase: "reveal",
              correctInfo: data.correct_info,
              playerResults: data.players || [],
              eliminations: data.eliminations || [],
              myScore: me?.total_score ?? prev.myScore,
              myStreak: me?.streak ?? prev.myStreak,
              myAlive: me?.alive ?? prev.myAlive,
            };
          }

          case "scoreboard": {
            const me = data.rankings?.find((p) => p.id === prev.myPlayerId);
            return {
              ...prev,
              phase: "scoreboard",
              rankings: data.rankings || [],
              round: data.round,
              totalRounds: data.total_rounds,
              myScore: me?.score ?? prev.myScore,
              myStreak: me?.streak ?? prev.myStreak,
              myAlive: me?.alive ?? prev.myAlive,
            };
          }

          case "game_over":
            return {
              ...prev,
              phase: "game_over",
              rankings: data.rankings || [],
              winner: data.winner,
              mode: data.mode || prev.mode,
            };

          case "error":
            return { ...prev, error: data.message };

          default:
            return prev;
        }
      });
    };

    ws.onclose = () => {
      clearInterval(pingRef.current);
      setGameState((s) => ({ ...s, phase: "disconnected" }));
    };

    ws.onerror = () => {
      setGameState((s) => ({ ...s, error: "Verbindungsfehler" }));
    };

    return () => {
      clearInterval(pingRef.current);
      ws.close();
    };
  }, [roomCode]);

  return { gameState, send, setAnswered };
}
