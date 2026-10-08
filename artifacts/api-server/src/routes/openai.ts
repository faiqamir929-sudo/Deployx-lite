/**
 * AI Deployment Assistant routes
 *
 * Implements requirement #9: AI Deployment Assistant
 * - Explain deployment failures
 * - Suggest fixes
 * - Detect missing environment variables
 * - Review README quality
 * - Recommend deployment improvements
 */
import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateOpenaiConversationBody,
  ListOpenaiConversationsResponse,
  GetOpenaiConversationResponse,
  ListOpenaiMessagesResponse,
  SendOpenaiMessageBody,
  CreateOpenaiConversationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireAuth);

const MAX_CONVERSATION_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_MESSAGES = 40;
const MAX_CONTEXT_CHARACTERS = 60_000;
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 20;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function userIdFor(req: Request): string {
  const userId = getAuth(req).userId;
  if (!userId) {
    throw new Error("Authenticated Clerk user is missing");
  }
  return userId;
}

function consumeMessageRateLimit(ownerId: string): boolean {
  const now = Date.now();
  const current = rateBuckets.get(ownerId);
  if (!current || now - current.startedAt >= AI_RATE_WINDOW_MS) {
    rateBuckets.set(ownerId, { startedAt: now, count: 1 });
    if (rateBuckets.size > 10_000) {
      for (const [id, bucket] of rateBuckets) {
        if (now - bucket.startedAt >= AI_RATE_WINDOW_MS) rateBuckets.delete(id);
      }
    }
    return true;
  }
  if (current.count >= AI_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

async function ownedConversation(
  id: number,
  ownerId: string,
): Promise<typeof conversations.$inferSelect | undefined> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)));
  return conversation;
}

// System prompt for the AI Deployment Assistant
const SYSTEM_PROMPT = `You are DeployX AI, an expert deployment assistant embedded inside DeployX Lite — an AI-powered deployment and environment management platform for small development teams.

Your role is to help developers:
1. **Explain deployment failures** — analyze pipeline logs and error messages, explain what went wrong in plain language
2. **Suggest fixes** — provide concrete, actionable steps to resolve deployment issues
3. **Detect missing environment variables** — identify missing or misconfigured env vars that could cause build or runtime failures
4. **Review README quality** — suggest improvements to project documentation
5. **Recommend deployment improvements** — advise on CI/CD best practices, security hardening, performance optimizations

The deployment pipeline has six stages: Clone Repository → Install Dependencies → Run Tests → Build Project → Deploy → Health Check.

When analyzing issues:
- Be specific and reference exact error messages or log lines when possible
- Suggest the most likely root cause first
- Provide code snippets or commands when relevant
- Keep responses focused and actionable — developers are busy

You have context about the user's project stack (frameworks like Next.js, Express, React, etc.), their environments (Development, Staging, Production), and their deployment history.

Respond in a conversational, expert tone. Use markdown formatting for code blocks and lists.`;

// GET /openai/conversations — list all conversations
router.get("/conversations", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.ownerId, ownerId))
    .orderBy(desc(conversations.createdAt));
  res.json(ListOpenaiConversationsResponse.parse(rows));
});

// POST /openai/conversations — create a new conversation
router.post("/conversations", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.title.length > MAX_CONVERSATION_TITLE_LENGTH) {
    res.status(400).json({
      error: `Conversation title must be ${MAX_CONVERSATION_TITLE_LENGTH} characters or fewer`,
    });
    return;
  }
  const [convo] = await db
    .insert(conversations)
    .values({ ownerId, title: parsed.data.title })
    .returning();
  res.status(201).json(CreateOpenaiConversationResponse.parse(convo));
});

// GET /openai/conversations/:id — get conversation with messages
router.get("/conversations/:id", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const convo = await ownedConversation(id, ownerId);
  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(GetOpenaiConversationResponse.parse({ ...convo, messages: msgs }));
});

// DELETE /openai/conversations/:id
router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  if (!(await ownedConversation(id, ownerId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  await db.delete(messages).where(eq(messages.conversationId, id));
  const deleted = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.status(204).end();
});

// GET /openai/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  if (!(await ownedConversation(id, ownerId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(ListOpenaiMessagesResponse.parse(msgs));
});

// POST /openai/conversations/:id/messages — streaming text response
router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  if (!(await ownedConversation(id, ownerId))) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const parsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userContent = parsed.data.content;
  if (userContent.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
    });
    return;
  }
  if (!consumeMessageRateLimit(ownerId)) {
    res.status(429).json({ error: "AI request rate limit exceeded" });
    return;
  }

  // Persist user message
  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content: userContent,
  });

  // Load conversation history for context
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_CONTEXT_MESSAGES);

  const boundedHistory: typeof history = [];
  let contextCharacters = 0;
  for (const message of history) {
    if (contextCharacters + message.content.length > MAX_CONTEXT_CHARACTERS) {
      break;
    }
    boundedHistory.push(message);
    contextCharacters += message.content.length;
  }
  boundedHistory.reverse();

  const chatMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...boundedHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Stream SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 2048,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Persist assistant reply
    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({ error: "The AI assistant is temporarily unavailable." })}\n\n`,
    );
  }

  res.end();
});

export default router;
