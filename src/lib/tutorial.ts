// First-use tutorial state (frontend-local onboarding, no backend).
// Pure module — no asset imports (node:test loads it; artwork lives in
// tutorial-artwork.ts, consumed by the component only).

export interface TutorialSlide {
  alt: string;
  title: string;
  description: string;
}

export type TutorialArtworkSlide = TutorialSlide & { image: string };

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    alt: "AI connected to external software",
    title: "What is AI Connect?",
    description:
      "AI Connect lets ChatGPT, Claude, or Cursor read and control your engineering software like Revit, AutoCAD, and QGIS, all from one place.",
  },
  {
    alt: "Software integrations connected to AiConnect",
    title: "Install Software Connectors",
    description:
      "Open the Connectors page, pick the software you need, and click Install following your plan. All connectors are secure.",
  },
  {
    alt: "Connector card with tutorial steps",
    title: "Every Connector Has a Guide",
    description:
      "Click any connector in the Collection to see a step-by-step tutorial on how to connect and start using it.",
  },
  {
    alt: "Help and FAQ page",
    title: "Need Help?",
    description:
      "Open the Help page for FAQs, agent setup guides (Claude, Cursor, ChatGPT), and tips to get the most out of AI Connect.",
  },
  {
    alt: "Ready to use AI Connect",
    title: "You're All Set!",
    description:
      "After installing and connecting, your AI agent automatically uses the tools you picked. Welcome to AI Connect.",
  },
];

export const TUTORIAL_PENDING_KEY = "aiconnect:tutorial-pending";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Set by the SIGNUP flow only (never on login). */
export function setTutorialPending(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(TUTORIAL_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearTutorialPending(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(TUTORIAL_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** One-shot consumer: returns true only ONCE per pending flag. */
export function takeTutorialPending(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    if (s.getItem(TUTORIAL_PENDING_KEY) !== "1") return false;
    s.removeItem(TUTORIAL_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function nextSlide(current: number, count = TUTORIAL_SLIDES.length): number {
  return Math.min(current + 1, count - 1);
}

export function buttonLabel(current: number, count = TUTORIAL_SLIDES.length): string {
  return current >= count - 1 ? "START" : "NEXT";
}

export function isLastSlide(current: number, count = TUTORIAL_SLIDES.length): boolean {
  return current >= count - 1;
}
