import { sessionToken } from './auth-http.mjs';
import { ProductError } from './product-service.mjs';

const taskPath = (pathname) => pathname.match(/^\/api\/tasks\/([^/]+)$/);
const workflowPath = (pathname) => pathname.match(/^\/api\/tasks\/([^/]+)\/workflow$/);
const publishPath = (pathname) => pathname.match(/^\/api\/tasks\/([^/]+)\/publish$/);
const proposalCreatePath = (pathname) => pathname.match(/^\/api\/tasks\/([^/]+)\/proposals$/);
const proposalDecisionPath = (pathname) => pathname.match(/^\/api\/proposals\/([^/]+)\/decision$/);
const decodeId = (match) => { try { return decodeURIComponent(match[1]); } catch { throw new ProductError(400, 'Некорректный идентификатор.'); } };

export async function handleProductRequest({ request, response, pathname, authService, productService, analyzeTask, readJson, sendJson }) {
  const isProductPath = pathname === '/api/tasks' || pathname === '/api/me/tasks' || pathname === '/api/me/proposals'
    || pathname === '/api/ai/analyze' || pathname.startsWith('/api/tasks/') || pathname.startsWith('/api/proposals/');
  if (!isProductPath) return false;
  const user = authService.userForToken(sessionToken(request));
  const idempotencyKey = request.headers['idempotency-key'];

  if (pathname === '/api/tasks' && request.method === 'GET') {
    const url = new URL(request.url || '/api/tasks', 'http://localhost');
    sendJson(response, 200, productService.listCatalog(user, {
      query: url.searchParams.get('query') || '',
      topic: url.searchParams.get('topic') || '',
      readiness: url.searchParams.get('readiness') || '',
    }));
    return true;
  }
  if (pathname === '/api/tasks' && request.method === 'POST') {
    sendJson(response, 201, productService.createTask(user, await readJson(request), idempotencyKey));
    return true;
  }
  if (pathname === '/api/me/tasks' && request.method === 'GET') {
    sendJson(response, 200, { tasks: productService.listMyTasks(user) });
    return true;
  }
  if (pathname === '/api/me/proposals' && request.method === 'GET') {
    sendJson(response, 200, { proposals: productService.listMyProposals(user) });
    return true;
  }
  if (pathname === '/api/ai/analyze' && request.method === 'POST') {
    if (!user) throw new ProductError(401, 'Требуется вход в аккаунт.');
    if (user.role !== 'business') throw new ProductError(403, 'AI-анализ доступен только бизнесу.');
    const input = await readJson(request);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProductError(400, 'JSON payload должен быть объектом.');
    const taskId = typeof input.taskId === 'string' ? input.taskId : '';
    const current = productService.getWorkflow(user, taskId);
    const expectedVersion = Number(input.version);
    if (expectedVersion !== current.workflow.version) throw new ProductError(409, 'Черновик изменился. Обновите его перед AI-анализом.');
    const result = await analyzeTask({
      description: current.workflow.description,
      currentCard: current.workflow.draft,
      previousQuestions: current.workflow.questions,
      answers: current.workflow.answers,
    });
    const hasAnswers = Object.values(current.workflow.answers).some((answer) => String(answer || '').trim());
    sendJson(response, 200, productService.saveAnalysis(user, taskId, expectedVersion, result, hasAnswers ? 'card' : 'questions'));
    return true;
  }

  const workflow = workflowPath(pathname);
  if (workflow && request.method === 'GET') {
    sendJson(response, 200, productService.getWorkflow(user, decodeId(workflow)));
    return true;
  }
  if (workflow && request.method === 'PUT') {
    sendJson(response, 200, productService.updateWorkflow(user, decodeId(workflow), await readJson(request)));
    return true;
  }
  const publish = publishPath(pathname);
  if (publish && request.method === 'POST') {
    sendJson(response, 200, productService.publishTask(user, decodeId(publish), await readJson(request), idempotencyKey));
    return true;
  }
  const proposalCreate = proposalCreatePath(pathname);
  if (proposalCreate && request.method === 'POST') {
    sendJson(response, 201, productService.createProposal(user, decodeId(proposalCreate), await readJson(request), idempotencyKey));
    return true;
  }
  const proposalDecision = proposalDecisionPath(pathname);
  if (proposalDecision && request.method === 'PATCH') {
    sendJson(response, 200, productService.decideProposal(user, decodeId(proposalDecision), await readJson(request)));
    return true;
  }
  const task = taskPath(pathname);
  if (task && request.method === 'GET') {
    sendJson(response, 200, { task: productService.getTask(user, decodeId(task)) });
    return true;
  }
  throw new ProductError(405, 'Method not allowed');
}
