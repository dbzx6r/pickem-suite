import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameIsOpen, gameHasStarted, scheduleChanged } from '../src/lib/game-availability';
import { weekLabel, rememberedWeek } from '../src/lib/week-labels';
const now=new Date('2026-10-02T12:00Z');
const game={startTime:'2026-10-04T17:00Z',statusState:'pre',isFinal:false};
test('exceptional status and preserved lock override future kickoff',()=>{
  assert.equal(gameIsOpen(game,now),true);
  for(const statusState of ['in','post','postponed','canceled','suspended','unknown']) assert.equal(gameIsOpen({...game,statusState},now),false);
  assert.equal(gameIsOpen({...game,pickLocked:true},now),false);
  assert.equal(gameIsOpen({...game,isFinal:true},now),false);
  assert.equal(gameIsOpen({...game,startTime:now},now),false);
  assert.equal(gameHasStarted({...game,statusState:'suspended'},now),true);
});
test('only schedule and exceptional status changes produce schedule notices',()=>{
  assert.equal(scheduleChanged(game,{...game,statusState:'in'}),false);
  assert.equal(scheduleChanged(game,{...game,statusState:'canceled'}),true);
  assert.equal(scheduleChanged(game,{...game,startTime:'2026-10-05T17:00Z'}),true);
  assert.equal(scheduleChanged(game,game),false);
});
test('current stays on unfinished week; remembered week must exist in this season',()=>{
  const weeks=[{weekNumber:1,isFinal:true},{weekNumber:2,isFinal:false},{weekNumber:3,isFinal:false}];
  assert.equal(weekLabel(weeks[1],weeks),'Current week');
  assert.equal(weekLabel(weeks[2],weeks),'Next week');
  assert.equal(weekLabel(weeks[0],weeks),'Completed');
  assert.equal(rememberedWeek('2',weeks)?.weekNumber,2);
  for(const value of ['19','NaN','/admin','2.5','',null]) assert.equal(rememberedWeek(value,weeks),null);
});
