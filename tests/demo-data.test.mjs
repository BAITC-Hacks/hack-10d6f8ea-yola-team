import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data.js';

test('submission demo data meets the minimum counts', () => {
  const drafts = seedData.tasks.filter((task) => task.status === 'draft');
  const cards = seedData.tasks.filter((task) => task.status === 'published' && task.confirmed === true);
  assert.ok(drafts.length >= 5, `expected at least 5 drafts, got ${drafts.length}`);
  assert.ok(cards.length >= 5, `expected at least 5 published cards, got ${cards.length}`);
  assert.ok(seedData.teams.length >= 5, `expected at least 5 team profiles, got ${seedData.teams.length}`);
  assert.ok(seedData.proposals.length >= 5, `expected at least 5 proposals, got ${seedData.proposals.length}`);
});

test('demo proposals reference existing published tasks and teams', () => {
  const taskIds = new Set(seedData.tasks.filter((task) => task.status === 'published').map((task) => task.id));
  const teamIds = new Set(seedData.teams.map((team) => team.id));
  for (const proposal of seedData.proposals) {
    assert.ok(taskIds.has(proposal.taskId), `missing task ${proposal.taskId}`);
    assert.ok(teamIds.has(proposal.teamId), `missing team ${proposal.teamId}`);
  }
});
