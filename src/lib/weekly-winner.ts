export interface WeeklyWinner {
  weekId: string;
  weekNumber: number;
  userId: string;
  displayName: string;
  points: number;
}

type CandidateWeek = {
  id: string;
  weekNumber: number;
  isFinal: boolean;
  games: { isFinal: boolean }[];
  weeklyScores: {
    userId: string;
    finalRank: number | null;
    points: number;
    adminOverridePoints: number | null;
    user: { profile: { displayName: string } | null };
  }[];
};

// A partial week's rank #1 is NOT a weekly winner. Use the persisted final
// ranking, which already incorporates tiebreakers and commissioner overrides.
export function selectLatestWeeklyWinner(weeks: CandidateWeek[]): WeeklyWinner | null {
  const week = weeks.filter((candidate) => candidate.isFinal
    && candidate.games.length > 0 && candidate.games.every((game) => game.isFinal))
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];
  const score = week?.weeklyScores.find((candidate) => candidate.finalRank === 1);
  if (!week || !score) return null;
  return {
    weekId: week.id,
    weekNumber: week.weekNumber,
    userId: score.userId,
    displayName: score.user.profile?.displayName || 'League player',
    points: score.adminOverridePoints ?? score.points,
  };
}
