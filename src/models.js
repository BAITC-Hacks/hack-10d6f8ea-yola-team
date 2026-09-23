export const TASK_STATUS = { DRAFT: 'draft', PUBLISHED: 'published' };
export const PROPOSAL_STATUS = { PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };

export const emptyTask = (id = `task-${Date.now()}`) => ({
  id, title: '', description: '', context: '', need: '', users: '', data: '', constraints: '',
  expectedResult: '', successCriteria: '', businessContact: '', interactionFormat: '', company: '', industry: '', topic: 'Другое',
  score: 0, readinessLevel: 'Draft', status: TASK_STATUS.DRAFT, confirmed: false, confirmedFields: [], lastChange: null, createdAt: new Date().toISOString(),
});
export const makeTeam = (id, name, interests, skills, technologies) => ({ id, name, interests, skills, technologies });
export const makeProposal = (id, taskId, teamId, solutionIdea, plan, duration, prototypeUrl, status = PROPOSAL_STATUS.PENDING) => ({ id, taskId, teamId, solutionIdea, plan, duration, prototypeUrl, status, createdAt: new Date().toISOString() });
