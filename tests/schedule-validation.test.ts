import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSeasonKickoff, assertScoreboardSchedule } from '../src/lib/schedule-validation';
const slate = (date: string) => ({season:{year:2026,type:2},week:{number:11},events:[{competitions:[{date}]}]});
test('rejects the 1993 kickoff that caused premature permanent locks',()=>{
  assert.throws(()=>assertScoreboardSchedule(slate('1993-01-31T23:30:00Z'),2026,11,2), /outside NFL season/);
});
test('validates the entire slate, including a bad later event',()=>{
  const data=slate('2026-11-20T01:15:00Z');data.events.push({competitions:[{date:'1993-01-31T23:30:00Z'}]});
  assert.throws(()=>assertScoreboardSchedule(data,2026,11,2));
});
test('accepts legitimate flex scheduling and next-year postseason',()=>{
  assert.doesNotThrow(()=>assertScoreboardSchedule(slate('2026-11-22T21:25:00Z'),2026,11,2));
  assert.doesNotThrow(()=>assertSeasonKickoff('2027-02-14T23:30:00Z',2026));
});
test('rejects wrong response identity, absent dates, and invalid dates',()=>{
  for(const data of [{...slate('2026-11-22'),week:{number:10}}, {...slate('2026-11-22'),season:{year:2025,type:2}}, {...slate('2026-11-22'),season:{year:2026,type:3}}, {season:{year:2026,type:2},week:{number:11},events:[{competitions:[]}]}]) assert.throws(()=>assertScoreboardSchedule(data,2026,11,2));
  for(const date of ['bad-date','2025-11-22','2027-03-01'])assert.throws(()=>assertSeasonKickoff(date,2026));
});
