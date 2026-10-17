/**
 * Scripted demo scenarios for the test double. Modelled on a real pilot
 * failure (usps_03: the agent read the results list, but Saturday hours only
 * appear on the location's detail page — pilot note kb_000015), but every
 * trace step and evaluator result here is scripted, not observed.
 */
import type { EvaluatorResult, Lesson, TraceEvent } from "@/lib/ui/contracts";
import type { LessonDraft } from "./store";

type Step = Pick<TraceEvent, "type" | "selector" | "value"> & { result?: "ok" | "error"; error?: string };

export interface Scenario {
  task_id: string;
  domain: string;
  instruction: string;
  baseline: { steps: Step[]; evaluator: EvaluatorResult };
  reflect: Omit<LessonDraft, "domain" | "source_run_id">;
  /** does any retrieved lesson carry the fix this scenario needs? */
  fixedBy: (lessons: Pick<Lesson, "lesson_text">[]) => boolean;
  transfer: { steps: Step[]; evaluator: EvaluatorResult };
}

const USPS_SEARCH: Step[] = [
  { type: "navigate", selector: null, value: "https://tools.usps.com/find-location.htm" },
  { type: "fill", selector: "#city-state-input", value: "94704" },
  { type: "click", selector: "#searchLocations", value: null },
  { type: "screenshot", selector: null, value: null },
];

export const SCENARIOS: Record<string, Scenario> = {
  usps_03: {
    task_id: "usps_03",
    domain: "usps.com",
    instruction:
      "Use USPS's Find a Post Office tool to find the post office nearest to ZIP Code 94704 and report its name and its Saturday retail hours.",
    baseline: {
      steps: [
        ...USPS_SEARCH,
        {
          type: "finish",
          selector: null,
          value: "The nearest post office is the first result in the list. Its Saturday retail hours match its weekday hours.",
        },
      ],
      evaluator: {
        passed: false,
        score: 0,
        evidence: {
          type: "scripted",
          detail:
            "Final page is the search results list. No location detail page was opened, so no 'Saturday' hours row was ever on screen; the reported hours are unsupported.",
        },
      },
    },
    reflect: {
      task_pattern:
        "Find the post office nearest a ZIP Code with the USPS Find a Post Office tool and report its name and Saturday retail hours",
      root_cause:
        "The agent answered from the search results list. Saturday retail hours only appear on a location's detail page, so it reported hours it never saw.",
      lesson_text:
        "After submitting the ZIP Code, click the nearest result to open its detail page before reading anything. The name and Saturday retail hours are only on that detail page. Never report hours from the results list.",
      success_criteria: "Detail page header shows the post office name and the hours table has a 'Saturday' row.",
      risk_warnings: [],
      applies_when: "After submitting the ZIP Code, when the results list appears",
    },
    fixedBy: (lessons) => lessons.some((l) => /detail page/i.test(l.lesson_text ?? "")),
    transfer: {
      steps: [
        ...USPS_SEARCH,
        { type: "click", selector: ".location-result:first-child a.location-name", value: null },
        { type: "screenshot", selector: null, value: null },
        {
          type: "finish",
          selector: null,
          value: "Read the post office name and its Saturday retail hours from the location detail page.",
        },
      ],
      evaluator: {
        passed: true,
        score: 1,
        evidence: {
          type: "scripted",
          detail: "Final page is a location detail page: the header shows the post office name and the hours table has a 'Saturday' row.",
        },
      },
    },
  },
};

export const DEFAULT_SCENARIO = "usps_03";
