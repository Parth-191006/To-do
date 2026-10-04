import Constants from 'expo-constants';

import type { Priority, TaskWithTags } from '@/domain/types';

/**
 * "Break down with AI".
 *
 * Two-tier design:
 *  1. A remote model (Supabase Edge Function or any OpenAI-compatible endpoint)
 *     when `EXPO_PUBLIC_AI_ENDPOINT` is configured. This gives the best results
 *     and is what ships in production.
 *  2. A deterministic local planner that runs entirely on device. It keeps the
 *     feature working offline and — importantly — makes the button never a dead
 *     end when the network is unavailable.
 *
 * Both paths return the same shape, so the UI does not care which one ran.
 */

export interface BreakdownStep {
  title: string;
  estimateMinutes: number | null;
  /** Suggested priority for the subtask — the parent's is only a starting point. */
  priority: Priority;
}

export interface BreakdownResult {
  steps: BreakdownStep[];
  /** Which engine produced the plan — surfaced as a small "offline plan" hint. */
  source: 'remote' | 'local';
}

interface PlanTemplate {
  keywords: RegExp;
  steps: string[];
}

/**
 * Domain templates. Ordered most-specific first; the first match wins, and
 * anything unmatched falls back to the generic project plan.
 */
const TEMPLATES: PlanTemplate[] = [
  {
    keywords: /report|essay|article|thesis|paper|blog|write|writing|documentation|docs?\b/i,
    steps: [
      'Outline the structure and key points',
      'Gather sources and supporting data',
      'Write the first draft',
      'Edit for clarity and tighten the argument',
      'Proofread and hand off for review',
    ],
  },
  {
    keywords: /bug|fix|debug|issue|error|crash|regression/i,
    steps: [
      'Reproduce the issue with a minimal case',
      'Trace the root cause',
      'Implement the fix',
      'Add a regression test',
      'Verify in a staging build and close out',
    ],
  },
  {
    keywords: /launch|release|deploy|ship|rollout|migrate|migration/i,
    steps: [
      'Write the rollout plan and rollback criteria',
      'Prepare release notes and comms',
      'Dry-run in staging',
      'Deploy to production with monitoring open',
      'Confirm health checks and announce',
    ],
  },
  {
    keywords: /design|mockup|wireframe|ui|ux|redesign|brand/i,
    steps: [
      'Collect references and constraints',
      'Sketch low-fidelity options',
      'Build the high-fidelity mockups',
      'Review with stakeholders and iterate',
      'Prepare specs and assets for handoff',
    ],
  },
  {
    keywords: /presentation|slides|deck|pitch|demo|talk/i,
    steps: [
      'Define the single takeaway for the audience',
      'Outline the narrative arc',
      'Build the slide deck',
      'Rehearse and time the run-through',
      'Prep for likely questions',
    ],
  },
  {
    keywords: /meeting|sync|standup|review|interview|1:?1|one-on-one/i,
    steps: [
      'Confirm agenda with attendees',
      'Prepare your notes and data',
      'Run the session and capture decisions',
      'Share the summary and action items',
    ],
  },
  {
    keywords: /trip|travel|flight|vacation|holiday|pack|move|moving/i,
    steps: [
      'Lock in dates and bookings',
      'Build the packing list',
      'Handle documents and reservations',
      'Sort logistics (transport, keys, pets)',
      'Set out-of-office and reminders',
    ],
  },
  {
    keywords: /workout|gym|run|training|marathon|exercise|yoga/i,
    steps: [
      'Pick the session and block the time',
      'Warm up properly',
      'Complete the main set',
      'Cool down and stretch',
      'Log the session',
    ],
  },
  {
    keywords: /clean|tidy|organi[sz]e|declutter|chore|home/i,
    steps: [
      'Gather supplies and set a timer',
      'Clear surfaces and put things away',
      'Handle the deep-clean areas',
      'Take out trash and reset the space',
    ],
  },
  {
    keywords: /shop|buy|order|groceries|purchase/i,
    steps: [
      'Write the shopping list',
      'Compare options and prices',
      'Place the order or go to the store',
      'Put everything away and check off the list',
    ],
  },
  {
    keywords: /tax|invoice|budget|bill|finance|expense|payroll/i,
    steps: [
      'Collect the necessary documents',
      'Reconcile the numbers',
      'Fill in and double-check the forms',
      'Submit and archive a copy',
    ],
  },
  {
    keywords: /learn|study|course|read|research|practice|onboard/i,
    steps: [
      'Set a clear learning objective',
      'Break the material into sessions',
      'Study the core material',
      'Practice with an exercise or project',
      'Summarise what you learned',
    ],
  },
];

const GENERIC_STEPS = [
  'Clarify the desired outcome',
  'Gather what you need to start',
  'Do the main body of work',
  'Review and refine',
  'Wrap up and close the loop',
];

function pickTemplate(title: string, notes: string): string[] {
  const haystack = `${title} ${notes}`;
  const match = TEMPLATES.find((template) => template.keywords.test(haystack));
  return match ? match.steps : GENERIC_STEPS;
}

/** Splits a parent estimate across the generated steps, largest first. */
function distributeEstimate(total: number | null, steps: string[]): (number | null)[] {
  if (!total || total <= 0) return steps.map(() => null);
  const weights = steps.map((_, index) => (index === steps.length - 1 ? 0.5 : 1));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => Math.max(5, Math.round((total * weight) / weightTotal)));
}

/**
 * A plan is a sequence, not a pile of equal chores.
 *
 * The first step is the one that unblocks everything else, so it carries the
 * parent's urgency (never below `medium` — an AI-generated plan whose first
 * step is "low" is a plan nobody starts). The last step is deliberately `low`
 * so wrapping up never competes with the real work.
 */
export function deriveStepPriorities(
  parentPriority: Priority,
  count: number,
): Priority[] {
  const RANK: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];
  const first = RANK.indexOf(parentPriority) > RANK.indexOf('medium') ? parentPriority : 'medium';
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return first;
    if (index === count - 1 && count > 2) return 'low';
    return 'medium';
  });
}

export function localBreakdown(
  task: Pick<TaskWithTags, 'title' | 'notes' | 'estimateMinutes' | 'priority'>,
): BreakdownResult {
  const steps = pickTemplate(task.title, task.notes).slice(0, 5);
  const estimates = distributeEstimate(task.estimateMinutes, steps);
  const priorities = deriveStepPriorities(task.priority, steps.length);
  return {
    steps: steps.map((title, index) => ({
      title,
      estimateMinutes: estimates[index],
      priority: priorities[index],
    })),
    source: 'local',
  };
}

interface RemoteOptions {
  signal?: AbortSignal;
}

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];

/**
 * How long the remote planner gets before we fall back to the local one.
 *
 * Without this, pressing "Break down with AI" on a phone with no connectivity
 * (or a captive-portal Wi-Fi that swallows requests) left the button spinning
 * for the OS-level network timeout — up to a minute — even though the offline
 * planner was ready instantly. The feature must never *need* the network.
 */
export const REMOTE_TIMEOUT_MS = 3500;

async function remoteBreakdown(
  task: Pick<TaskWithTags, 'title' | 'notes' | 'estimateMinutes' | 'priority'>,
  options: RemoteOptions,
): Promise<BreakdownResult | null> {
  const endpoint =
    process.env.EXPO_PUBLIC_AI_ENDPOINT ??
    (Constants.expoConfig?.extra as { aiEndpoint?: string } | undefined)?.aiEndpoint;

  if (!endpoint) return null;

  // Compose the caller's signal (unmount) with our own timeout budget.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        title: task.title,
        notes: task.notes,
        estimateMinutes: task.estimateMinutes,
        priority: task.priority,
        maxSteps: 5,
      }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { steps?: unknown };
    if (!Array.isArray(payload.steps)) return null;

    const fallbackPriorities = deriveStepPriorities(task.priority, payload.steps.length);

    const steps: BreakdownStep[] = payload.steps
      .map((entry, index) => {
        if (typeof entry === 'string') {
          return {
            title: entry,
            estimateMinutes: null,
            priority: fallbackPriorities[index] ?? 'medium',
          };
        }
        const record = entry as {
          title?: unknown;
          estimateMinutes?: unknown;
          priority?: unknown;
        };
        if (typeof record.title !== 'string') return null;
        return {
          title: record.title,
          estimateMinutes:
            typeof record.estimateMinutes === 'number' ? record.estimateMinutes : null,
          priority:
            typeof record.priority === 'string' && PRIORITIES.includes(record.priority as Priority)
              ? (record.priority as Priority)
              : (fallbackPriorities[index] ?? 'medium'),
        };
      })
      .filter((step): step is BreakdownStep => step !== null)
      .slice(0, 5);

    if (steps.length < 3) return null;
    return { steps, source: 'remote' };
  } catch {
    // Network down, endpoint asleep, or the timeout fired — the local planner
    // takes over, so the button always produces a plan.
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Generates 3–5 subtasks, preferring the remote model and falling back locally. */
export async function generateBreakdown(
  task: Pick<TaskWithTags, 'title' | 'notes' | 'estimateMinutes' | 'priority'>,
  options: RemoteOptions = {},
): Promise<BreakdownResult> {
  const remote = await remoteBreakdown(task, options);
  return remote ?? localBreakdown(task);
}
