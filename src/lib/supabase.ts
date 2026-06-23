import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ppnohrwxftsuoltfpqpg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-PPggy1hr3rm10dafILoAg_5sWeiPFo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type PalpiteRow = {
  id: string;
  game_id: string;
  name: string;
  g1: string;
  g2: string;
  scorers: string;
  locked: boolean;
  created_at: string;
};

export type OficialRow = {
  game_id: string;
  g1: string;
  g2: string;
  scorers: string;
  deadline: string | null;
};

export type GameRow = {
  id: string;
  team1: string;
  team2: string;
  date_label: string;
  position: number;
  created_at: string;
};

export type RankingHistoricoRow = {
  id: string;
  name: string;
  points: number;
  updated_at: string;
};
