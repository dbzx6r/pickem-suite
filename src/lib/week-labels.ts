export type WeekLabelInput = { weekNumber: number; isFinal: boolean };
export function weekLabel(week: WeekLabelInput, weeks: WeekLabelInput[]) {
  const pending = weeks.filter(w=>!w.isFinal).sort((a,b)=>a.weekNumber-b.weekNumber);
  if (week.isFinal) return 'Completed';
  if (week.weekNumber === pending[0]?.weekNumber) return 'Current week';
  if (week.weekNumber === pending[1]?.weekNumber) return 'Next week';
  return 'Upcoming';
}
export function rememberedWeek(value: string | null, weeks: WeekLabelInput[]) {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  return weeks.find(w=>w.weekNumber===Number(value)) ?? null;
}
