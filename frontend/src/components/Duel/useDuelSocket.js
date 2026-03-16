import { useState, useEffect, useRef, useCallback } from "react";

function getWsBase() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/^http/, "ws");
  }
  // In production, backend serves frontend — use same host
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

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
    answeredPlayers: [],
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
  const joinTimeoutRef = useRef(null);
  const onConnectRef = useRef(onConnect);
  const closedIntentionallyRef = useRef(false);
  onConnectRef.current = onConnect;

  const send = useCallback((action, data = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, ...data }));
    }
  }, []);

  const setAnswered = useCallback(() => {
    setGameState((s) => ({ ...s, answered: true }));
  }, []);

  function cleanup() {
    clearInterval(pingRef.current);
    pingRef.current = null;
    clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = null;
  }

  const connect = useCallback(() => {
    if (!roomCode) return;

    // Clean up previous connection WITHOUT triggering onclose handler
    cleanup();
    if (wsRef.current) {
      closedIntentionallyRef.current = true;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    setGameState((s) => ({ ...s, phase: "connecting", error: null }));

    const wsBase = getWsBase();
    let ws;
    try {
      ws = new WebSocket(`${wsBase}/ws/duel/${roomCode}`);
    } catch (e) {
      setGameState((s) => ({
        ...s,
        phase: "error",
        error: `WebSocket-Verbindung fehlgeschlagen: ${e.message}`,
      }));
      return;
    }
    wsRef.current = ws;
    closedIntentionallyRef.current = false;

    ws.onopen = () => {
      setGameState((s) => ({ ...s, phase: "connected", error: null }));

      // Start ping keepalive
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);

      // Fire connect callback (sends join or host_connect)
      if (onConnectRef.current) {
        onConnectRef.current(ws);
      }

      // Safety timeout: if still on "connected" after 6s, server didn't respond
      joinTimeoutRef.current = setTimeout(() => {
        setGameState((prev) => {
          if (prev.phase === "connected") {
            return {
              ...prev,
              phase: "error",
              error: "Server antwortet nicht. Raum existiert möglicherweise nicht mehr.",
            };
          }
          return prev;
        });
      }, 6000);
    };

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      const { event, data } = msg;

      // Clear join timeout on first meaningful response
      if (event !== "pong") {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }

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
              answeredPlayers: [],
              correctInfo: null,
              playerResults: [],
              eliminations: [],
            };

          case "player_answered":
            return {
              ...prev,
              answeredCount: data.answered_count,
              totalPlayers: data.total_players,
              answeredPlayers: data.player_name
                ? [...prev.answeredPlayers, { name: data.player_name, id: data.player_id, ts: Date.now() }]
                : prev.answeredPlayers,
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
      cleanup();
      // Ignore close if we intentionally closed (during reconnect)
      if (closedIntentionallyRef.current) {
        closedIntentionallyRef.current = false;
        return;
      }
      setGameState((s) => {
        // Don't override game_over with disconnected
        if (s.phase === "game_over") return s;
        return { ...s, phase: "disconnected" };
      });
    };

    ws.onerror = () => {
      cleanup();
      setGameState((s) => ({
        ...s,
        phase: "error",
        error: "Verbindungsfehler — Server nicht erreichbar.",
      }));
    };
  }, [roomCode]);

  // Initial connection + cleanup on unmount
  useEffect(() => {
    connect();
    return () => {
      cleanup();
      closedIntentionallyRef.current = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { gameState, send, setAnswered, reconnect: connect };
}
