import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Plus, Trash2, Download, Trophy, Lock, Unlock, RefreshCw, PlusCircle, X, Clock, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import type { PalpiteRow, OficialRow, GameRow, RankingHistoricoRow } from "../lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bolão Família 12/8" },
      { name: "description", content: "Bolão entre amigos — palpites, pontuação automática e ranking geral." },
    ],
  }),
  component: Index,
});

type Guess = { id: string; name: string; g1: string; g2: string; scorers: string; locked?: boolean };
type Official = { g1: string; g2: string; scorers: string; deadline: string };
type Game = { id: string; team1: string; team2: string; date_label: string; position: number };
type GameState = { game: Game; guesses: Guess[]; official: Official };

const ADMIN_PASSWORD = "familia128";

const INITIAL_GAMES: Game[] = [
  { id: "bra-jap", team1: "Brasil", team2: "Japão", date_label: "29/06 14h", position: 0 },
  { id: "ale-par", team1: "Alemanha", team2: "Paraguai", date_label: "29/06 17h30", position: 1 },
  { id: "hol-mar", team1: "Holanda", team2: "Marrocos", date_label: "29/06 22h", position: 2 },
  { id: "nor-maf", team1: "Noruega", team2: "Costa do Marfim", date_label: "30/06 14h", position: 3 },
  { id: "fra-sue", team1: "França", team2: "Suécia", date_label: "30/06 18h", position: 4 },
  { id: "ing-con", team1: "Inglaterra", team2: "RD Congo", date_label: "01/07 13h", position: 5 },
  { id: "bel-sen", team1: "Bélgica", team2: "Senegal", date_label: "01/07 17h", position: 6 },
  { id: "esp-aut", team1: "Espanha", team2: "Áustria", date_label: "02/07 16h", position: 7 },
  { id: "por-cro", team1: "Portugal", team2: "Croácia", date_label: "02/07 20h", position: 8 },
  { id: "arg-cab", team1: "Argentina", team2: "Cabo Verde", date_label: "03/07 19h", position: 9 },
  { id: "col-gan", team1: "Colômbia", team2: "Gana", date_label: "03/07 22h30", position: 10 },
];

const INITIAL_DEADLINES: Record<string, string> = {
  "bra-jap": "2026-06-29T14:00:00-03:00",
  "ale-par": "2026-06-29T17:30:00-03:00",
  "hol-mar": "2026-06-29T22:00:00-03:00",
  "nor-maf": "2026-06-30T14:00:00-03:00",
  "fra-sue": "2026-06-30T18:00:00-03:00",
  "ing-con": "2026-07-01T13:00:00-03:00",
  "bel-sen": "2026-07-01T17:00:00-03:00",
  "esp-aut": "2026-07-02T16:00:00-03:00",
  "por-cro": "2026-07-02T20:00:00-03:00",
  "arg-cab": "2026-07-03T19:00:00-03:00",
  "col-gan": "2026-07-03T22:30:00-03:00",
};

const emptyOfficial = (): Official => ({ g1: "", g2: "", scorers: "", deadline: "" });

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function parseScorers(s: string): string[] {
  return s.split(",").map((x) => normalizeName(x)).filter(Boolean);
}

function computeScorerPoints(guessScorers: string[], officialScorers: string[]): number {
  if (officialScorers.length === 0) return 0;
  const officialCopy = [...officialScorers];
  let points = 0;
  for (const name of guessScorers) {
    const idx = officialCopy.indexOf(name);
    if (idx !== -1) { points++; officialCopy.splice(idx, 1); }
  }
  return points;
}

function computePoints(guess: Guess, official: Official) {
  if (official.g1 === "" || official.g2 === "") return { total: null, breakdown: { result: 0, scorers: 0 } };
  if (guess.g1 === "" || guess.g2 === "") return { total: null, breakdown: { result: 0, scorers: 0 } };
  const og1 = Number(official.g1), og2 = Number(official.g2);
  const pg1 = Number(guess.g1), pg2 = Number(guess.g2);
  let resultPoints = 0;
  if (pg1 === og1 && pg2 === og2) resultPoints = 3;
  else if (Math.sign(og1 - og2) === Math.sign(pg1 - pg2)) resultPoints = 1;
  const officialScorers = parseScorers(official.scorers);
  const guessScorers = parseScorers(guess.scorers);
  let scorerPoints = 0;
  if (officialScorers.length > 0) {
    scorerPoints = computeScorerPoints(guessScorers, officialScorers);
  }
  return { total: resultPoints + scorerPoints, breakdown: { result: resultPoints, scorers: scorerPoints } };
}

function isDeadlinePassed(deadline: string): boolean {
  if (!deadline) return false;
  return new Date() > new Date(deadline);
}

function formatDeadline(deadline: string): string {
  if (!deadline) return "";
  return new Date(deadline).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function ScorerTags({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (newValue: string) => void;
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value.split(",").map((s) => s.trim()).filter(Boolean);

  const addTag = () => {
    const name = inputVal.trim();
    if (!name) { setAdding(false); return; }
    onChange([...tags, name].join(", "));
    setInputVal("");
    setAdding(false);
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index).join(", "));
  };

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
          {tag}
          {editable && (
            <button type="button" onClick={() => removeTag(i)} className="text-primary/60 hover:text-primary">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {tags.length === 0 && !editable && <span className="text-xs text-muted-foreground">—</span>}
      {editable && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs text-primary/60 hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" /> Artilheiro
        </button>
      )}
      {editable && adding && (
        <div className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(); }
              if (e.key === "Escape") { setAdding(false); setInputVal(""); }
            }}
            className="row-input w-28 py-0.5 text-xs"
            placeholder="Nome..."
          />
          <button type="button" onClick={addTag} className="text-xs text-primary hover:text-primary/80">✓</button>
          <button type="button" onClick={() => { setAdding(false); setInputVal(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}
    </div>
  );
}

function Index() {
  const [games, setGames] = useState<Game[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, GameState>>({});
  const [rankingHistorico, setRankingHistorico] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGame, setNewGame] = useState({ team1: "", team2: "", date_label: "" });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(new Date());

  // Tick a cada minuto pra atualizar deadline em tempo real
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(new Date()), 30000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const fetchAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [
        { data: gamesData },
        { data: palpites },
        { data: oficial },
        { data: historico },
      ] = await Promise.all([
        supabase.from("games").select("*").order("position", { ascending: true }),
        supabase.from("palpites").select("*").order("created_at", { ascending: true }),
        supabase.from("oficial").select("*"),
        supabase.from("ranking_historico").select("*"),
      ]);

      // Se não tem jogos no banco ainda, insere os iniciais e semeia os deadlines
      let gamesList: Game[] = [];
      if (!gamesData || gamesData.length === 0) {
        const { data: inserted } = await supabase
          .from("games")
          .insert(INITIAL_GAMES)
          .select();
        gamesList = (inserted as GameRow[]) ?? INITIAL_GAMES;
        for (const game of gamesList) {
          const deadline = INITIAL_DEADLINES[game.id];
          if (deadline) {
            await supabase.from("oficial").upsert(
              { game_id: game.id, g1: "", g2: "", scorers: "", deadline },
              { onConflict: "game_id" }
            );
          }
        }
      } else {
        gamesList = gamesData as GameRow[];
      }

      setGames(gamesList);

      const newStateMap: Record<string, GameState> = {};
      for (const g of gamesList) {
        newStateMap[g.id] = { game: g, guesses: [], official: emptyOfficial() };
      }

      if (palpites) {
        for (const row of palpites as PalpiteRow[]) {
          if (!newStateMap[row.game_id]) continue;
          newStateMap[row.game_id].guesses.push({
            id: row.id, name: row.name, g1: row.g1, g2: row.g2,
            scorers: row.scorers ?? "", locked: row.locked,
          });
        }
      }

      if (oficial) {
        for (const row of oficial as OficialRow[]) {
          if (!newStateMap[row.game_id]) continue;
          newStateMap[row.game_id].official = {
            g1: row.g1, g2: row.g2, scorers: row.scorers ?? "",
            deadline: row.deadline ?? "",
          };
        }
      }

      setStateMap(newStateMap);

      const hist: Record<string, number> = {};
      if (historico) {
        for (const row of historico as RankingHistoricoRow[]) {
          hist[row.name] = row.points;
        }
      }
      setRankingHistorico(hist);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("bolao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "palpites" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "oficial" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "ranking_historico" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const addGuess = async (gameId: string) => {
    const gs = stateMap[gameId];
    if (!gs) return;
    if (isDeadlinePassed(gs.official.deadline) && !adminMode) {
      alert("Prazo encerrado! Não é mais possível adicionar palpites.");
      return;
    }
    const { data, error } = await supabase
      .from("palpites")
      .insert({ game_id: gameId, name: "", g1: "", g2: "", scorers: "", locked: false })
      .select().single();
    if (error) { alert("Erro ao adicionar palpite: " + error.message); return; }
    setStateMap((s) => ({
      ...s,
      [gameId]: {
        ...s[gameId],
        guesses: [...s[gameId].guesses, { id: data.id, name: "", g1: "", g2: "", scorers: "", locked: false }],
      },
    }));
  };

  const updateGuessLocal = (gameId: string, id: string, patch: Partial<Guess>) => {
    setStateMap((s) => ({
      ...s,
      [gameId]: { ...s[gameId], guesses: s[gameId].guesses.map((g) => (g.id === id ? { ...g, ...patch } : g)) },
    }));
  };

  const saveGuess = async (gameId: string, id: string) => {
    const guess = stateMap[gameId]?.guesses.find((g) => g.id === id);
    if (!guess) return;
    await supabase.from("palpites").update({ name: guess.name, g1: guess.g1, g2: guess.g2, scorers: guess.scorers }).eq("id", id);
  };

  const removeGuess = async (gameId: string, id: string) => {
    const { error } = await supabase.from("palpites").delete().eq("id", id);
    if (error) { alert("Erro ao remover: " + error.message); return; }
    setStateMap((s) => ({
      ...s,
      [gameId]: { ...s[gameId], guesses: s[gameId].guesses.filter((g) => g.id !== id) },
    }));
  };

  const updateGuessScorersDirect = async (gameId: string, id: string, newScorers: string) => {
    updateGuessLocal(gameId, id, { scorers: newScorers });
    const guess = stateMap[gameId]?.guesses.find((g) => g.id === id);
    if (!guess) return;
    await supabase.from("palpites").update({
      name: guess.name, g1: guess.g1, g2: guess.g2, scorers: newScorers,
    }).eq("id", id);
  };

  const updateOfficial = async (gameId: string, patch: Partial<Official>) => {
    const updated = { ...stateMap[gameId].official, ...patch };
    setStateMap((s) => ({ ...s, [gameId]: { ...s[gameId], official: updated } }));
    await supabase.from("oficial").upsert({
      game_id: gameId, g1: updated.g1, g2: updated.g2,
      scorers: updated.scorers, deadline: updated.deadline || null,
    });
  };

  // Salvar pontos no ranking histórico antes de remover o jogo
  const removeGame = async (gameId: string) => {
    if (!confirm("Remover este jogo? Os palpites serão apagados, mas os pontos serão salvos no ranking.")) return;
    const gs = stateMap[gameId];
    if (!gs) return;

    // Computa pontos do jogo e salva no histórico
    const pointsToSave: Record<string, number> = {};
    for (const guess of gs.guesses) {
      const name = guess.name.trim();
      if (!name) continue;
      const { total } = computePoints(guess, gs.official);
      if (total) pointsToSave[name] = (pointsToSave[name] ?? 0) + total;
    }

    // Upsert no ranking_historico
    for (const [name, pts] of Object.entries(pointsToSave)) {
      const current = rankingHistorico[name] ?? 0;
      await supabase.from("ranking_historico").upsert(
        { name, points: current + pts },
        { onConflict: "name" }
      );
    }

    // Remove palpites, oficial e game
    await supabase.from("palpites").delete().eq("game_id", gameId);
    await supabase.from("oficial").delete().eq("game_id", gameId);
    await supabase.from("games").delete().eq("id", gameId);

    setGames((g) => g.filter((x) => x.id !== gameId));
    setStateMap((s) => { const n = { ...s }; delete n[gameId]; return n; });
    await fetchAll();
  };

  const addGame = async () => {
    if (!newGame.team1.trim() || !newGame.team2.trim()) {
      alert("Preencha os dois times.");
      return;
    }
    const id = `${newGame.team1.toLowerCase().replace(/\s+/g, "-")}-${newGame.team2.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const position = games.length;
    const { error } = await supabase.from("games").insert({
      id, team1: newGame.team1.trim(), team2: newGame.team2.trim(),
      date_label: newGame.date_label.trim(), position,
    });
    if (error) { alert("Erro ao adicionar jogo: " + error.message); return; }
    setNewGame({ team1: "", team2: "", date_label: "" });
    setShowAddGame(false);
    await fetchAll();
  };

  const clearRanking = async () => {
    if (!confirm("Limpar o ranking histórico? Use isso ao iniciar um bolão novo.")) return;
    await supabase.from("ranking_historico").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setRankingHistorico({});
  };

  const toggleAdmin = () => {
    if (adminMode) { setAdminMode(false); return; }
    const pwd = prompt("Senha do administrador:");
    if (pwd === null) return;
    if (pwd === ADMIN_PASSWORD) setAdminMode(true);
    else alert("Senha incorreta.");
  };

  // Ranking combinado: histórico + pontos ativos
  const ranking = useMemo(() => {
    const totals = new Map<string, number>();
    // Pontos históricos
    for (const [name, pts] of Object.entries(rankingHistorico)) {
      totals.set(name, (totals.get(name) ?? 0) + pts);
    }
    // Pontos dos jogos ativos
    for (const gs of Object.values(stateMap)) {
      for (const guess of gs.guesses) {
        const name = guess.name.trim();
        if (!name) continue;
        const { total } = computePoints(guess, gs.official);
        totals.set(name, (totals.get(name) ?? 0) + (total ?? 0));
      }
    }
    return [...totals.entries()]
      .map(([name, points]) => ({ name, points }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [stateMap, rankingHistorico]);

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    for (const gs of Object.values(stateMap)) {
      const { game, official, guesses } = gs;
      const officialDefined = official.g1 !== "" && official.g2 !== "";
      const aoa: (string | number | null)[][] = [
        [`${game.team1} x ${game.team2} — ${game.date_label}`],
        ["Placar Oficial", officialDefined ? `${official.g1} x ${official.g2}` : "Pendente"],
        ["Artilheiros Oficiais", official.scorers || "—"],
        [],
        ["Nome", "Palpite", "Artilheiros", "Pts Placar", "Pts Artilheiros", "Total"],
      ];
      for (const guess of guesses) {
        const { total, breakdown } = computePoints(guess, official);
        const palpite = guess.g1 !== "" && guess.g2 !== "" ? `${guess.g1} x ${guess.g2}` : "";
        aoa.push([
          guess.name,
          palpite,
          guess.scorers || "",
          breakdown.result,
          breakdown.scorers,
          total === null ? "" : total,
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, ws, `${game.team1} x ${game.team2}`.slice(0, 31));
    }
    const rankingAoa: (string | number)[][] = [["Posição", "Nome", "Pontos"]];
    ranking.forEach((r, i) => rankingAoa.push([i + 1, r.name, r.points]));
    const wsRanking = XLSX.utils.aoa_to_sheet(rankingAoa);
    wsRanking["!cols"] = [{ wch: 10 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsRanking, "Ranking Final");
    XLSX.writeFile(wb, "bolao-familia-12-8.xlsx");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando palpites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/40">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Bolão Família 12/8</h1>
              {lastUpdate && (
                <p className="text-xs text-muted-foreground">
                  Atualizado às {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={fetchAll} disabled={syncing} className="btn-secondary">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Atualizando..." : "Atualizar"}
            </button>
            {adminMode && (
              <>
                <button onClick={handleExport} className="btn-secondary">
                  <Download className="h-4 w-4" /> Excel
                </button>
                <button onClick={() => setShowAddGame(true)} className="btn-secondary">
                  <PlusCircle className="h-4 w-4" /> Jogo
                </button>
                <button onClick={clearRanking} className="btn-danger">
                  <RotateCcw className="h-4 w-4" /> Zerar Ranking
                </button>
              </>
            )}
            <button onClick={toggleAdmin} className={adminMode ? "btn-primary" : "btn-secondary"}>
              {adminMode ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {adminMode ? "Admin ativo" : "Admin"}
            </button>
          </div>
        </div>
        {adminMode && (
          <div className="mx-auto max-w-6xl px-4 pb-3 text-xs text-primary">
            Modo admin ativo — você pode editar placares, prazos, adicionar e remover jogos.
          </div>
        )}
      </header>

      {/* Modal adicionar jogo */}
      {showAddGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Adicionar Jogo</h3>
              <button onClick={() => setShowAddGame(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Time 1</label>
                <input
                  type="text" value={newGame.team1}
                  onChange={(e) => setNewGame((n) => ({ ...n, team1: e.target.value }))}
                  placeholder="Ex: Brasil" className="row-input w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Time 2</label>
                <input
                  type="text" value={newGame.team2}
                  onChange={(e) => setNewGame((n) => ({ ...n, team2: e.target.value }))}
                  placeholder="Ex: Argentina" className="row-input w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Data/Hora (ex: 27/06 20h)</label>
                <input
                  type="text" value={newGame.date_label}
                  onChange={(e) => setNewGame((n) => ({ ...n, date_label: e.target.value }))}
                  placeholder="Ex: 27/06 20h30" className="row-input w-full"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={addGame} className="btn-primary flex-1">Adicionar</button>
              <button onClick={() => setShowAddGame(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {games.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card/40 p-10 text-center text-muted-foreground">
            Nenhum jogo cadastrado. {adminMode ? "Clique em \"+ Jogo\" para adicionar." : ""}
          </div>
        )}

        {games.map((game) => {
          const gs = stateMap[game.id];
          if (!gs) return null;
          const { official, guesses } = gs;
          const totalGoals = official.g1 !== "" && official.g2 !== ""
            ? Number(official.g1) + Number(official.g2) : null;
          const deadlinePassed = isDeadlinePassed(official.deadline);
          const deadlineFormatted = formatDeadline(official.deadline);

          return (
            <section key={game.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold sm:text-xl">
                    {game.team1} <span className="text-muted-foreground">x</span> {game.team2}
                  </h2>
                  <p className="text-xs text-muted-foreground">{game.date_label}</p>
                  {/* Prazo visível pra todos */}
                  {official.deadline && (
                    <div className={`mt-1 flex items-center gap-1 text-xs ${deadlinePassed ? "text-destructive" : "text-primary"}`}>
                      <Clock className="h-3 w-3" />
                      {deadlinePassed
                        ? `Palpites encerrados (prazo: ${deadlineFormatted})`
                        : `Palpites até ${deadlineFormatted}`}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-3">
                  {/* Prazo — só admin edita */}
                  {adminMode && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Prazo palpites</span>
                      <input
                        type="datetime-local"
                        value={official.deadline ? official.deadline.slice(0, 16) : ""}
                        onChange={(e) => updateOfficial(game.id, { deadline: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                        className="row-input text-xs"
                      />
                    </div>
                  )}
                  {/* Placar oficial */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Oficial</span>
                    {adminMode ? (
                      <>
                        <input
                          type="number" min={0} inputMode="numeric" value={official.g1}
                          onChange={(e) => updateOfficial(game.id, { g1: e.target.value })}
                          className="score-input border-primary/40 bg-primary/10"
                        />
                        <span className="text-muted-foreground">x</span>
                        <input
                          type="number" min={0} inputMode="numeric" value={official.g2}
                          onChange={(e) => updateOfficial(game.id, { g2: e.target.value })}
                          className="score-input border-primary/40 bg-primary/10"
                        />
                      </>
                    ) : official.g1 !== "" && official.g2 !== "" ? (
                      <span className="font-semibold">{official.g1} x {official.g2}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pendente</span>
                    )}
                  </div>
                  {/* Artilheiros oficiais */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Artilheiros{totalGoals !== null ? ` (${totalGoals})` : ""}
                    </span>
                    <ScorerTags
                      value={official.scorers}
                      editable={adminMode}
                      onChange={(v) => updateOfficial(game.id, { scorers: v })}
                    />
                  </div>
                  {/* Remover jogo — só admin */}
                  {adminMode && (
                    <button
                      onClick={() => removeGame(game.id)}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      title="Remover jogo (salva pontos no ranking)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[600px] border-separate border-spacing-y-1 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium">{game.team1}</th>
                      <th className="px-3 py-2 font-medium">{game.team2}</th>
                      <th className="px-3 py-2 font-medium">Artilheiros</th>
                      <th className="px-3 py-2 font-medium">Pts</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {guesses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          {deadlinePassed && !adminMode
                            ? "Prazo encerrado. Nenhum palpite registrado."
                            : "Nenhum palpite ainda. Clique em \"+ Adicionar palpite\"."}
                        </td>
                      </tr>
                    )}
                    {guesses.map((guess) => {
                      const { total, breakdown } = computePoints(guess, official);
                      const editable = !deadlinePassed || adminMode;
                      const guessScorersCount = parseScorers(guess.scorers).length;

                      return (
                        <tr key={guess.id} className="bg-muted/30">
                          <td className="rounded-l-md px-3 py-2">
                            <input
                              type="text" value={guess.name}
                              onChange={(e) => editable && updateGuessLocal(game.id, guess.id, { name: e.target.value })}
                              onBlur={() => editable && saveGuess(game.id, guess.id)}
                              placeholder="Nome"
                              className="row-input w-full disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={!editable}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number" min={0} inputMode="numeric" value={guess.g1}
                              onChange={(e) => editable && updateGuessLocal(game.id, guess.id, { g1: e.target.value })}
                              onBlur={() => editable && saveGuess(game.id, guess.id)}
                              className="score-input disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={!editable}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number" min={0} inputMode="numeric" value={guess.g2}
                              onChange={(e) => editable && updateGuessLocal(game.id, guess.id, { g2: e.target.value })}
                              onBlur={() => editable && saveGuess(game.id, guess.id)}
                              className="score-input disabled:cursor-not-allowed disabled:opacity-70"
                              disabled={!editable}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <ScorerTags
                                value={guess.scorers}
                                editable={editable}
                                onChange={(v) => updateGuessScorersDirect(game.id, guess.id, v)}
                              />
                              {totalGoals !== null && (
                                <span className="text-xs text-muted-foreground">{guessScorersCount}/{totalGoals} nomes</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-start">
                              <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 text-xs font-semibold ${
                                total !== null && total > 0 ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground"
                              }`}>
                                {total === null ? "—" : total}
                              </span>
                              {total !== null && (breakdown.result > 0 || breakdown.scorers > 0) && (
                                <span className="mt-0.5 text-xs text-muted-foreground">{breakdown.result}p + {breakdown.scorers}⚽</span>
                              )}
                            </div>
                          </td>
                          <td className="rounded-r-md px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {(adminMode || !deadlinePassed) && (
                                <button onClick={() => removeGuess(game.id, guess.id)}
                                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(!deadlinePassed || adminMode) && (
                <button onClick={() => addGuess(game.id)} className="btn-primary mt-3">
                  <Plus className="h-4 w-4" /> Adicionar palpite
                </button>
              )}
            </section>
          );
        })}

        {/* Ranking */}
        <section className="card">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Ranking Geral</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[360px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Posição</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Pontos totais</th>
                </tr>
              </thead>
              <tbody>
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Adicione palpites para ver o ranking.
                    </td>
                  </tr>
                )}
                {ranking.map((r, i) => (
                  <tr key={r.name} className="bg-muted/30">
                    <td className="rounded-l-md px-3 py-2 font-semibold">
                      <span className={`inline-grid h-7 w-7 place-items-center rounded-full text-xs ${
                        i === 0 ? "bg-primary text-primary-foreground"
                        : i === 1 ? "bg-primary/40 text-foreground"
                        : i === 2 ? "bg-primary/20 text-foreground"
                        : "bg-muted text-muted-foreground"
                      }`}>{i + 1}</span>
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="rounded-r-md px-3 py-2 font-semibold text-primary">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Acertou vencedor/empate: 1 pt · Placar exato: 3 pts · Artilheiro acertado: +1 pt por gol ⚽
        </footer>
      </main>
    </div>
  );
}
