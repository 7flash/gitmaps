/**
 * Interactive Onboarding Tutorial — Guide new users through GitMaps
 */

import type { CanvasContext } from './context';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  highlightSelector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GitMaps! 🎉',
    description:
      "Explore codebases on an infinite canvas. Let's take a quick tour of the main controls.",
    highlightSelector: '#app',
    position: 'bottom',
  },
  {
    id: 'repo-selector',
    title: 'Repository Selector',
    description:
      'Choose a loaded repository here, or import a new one from GitHub.',
    highlightSelector: '#repoSelect',
    position: 'bottom',
  },
  {
    id: 'commit-timeline',
    title: 'Commit Timeline',
    description:
      'Walk through history and inspect changes over time. Arrow keys work here too.',
    highlightSelector: '#commitTimeline',
    position: 'right',
  },
  {
    id: 'canvas-area',
    title: 'Infinite Canvas',
    description:
      'Pan, zoom, and arrange file cards spatially to understand a repository at a glance.',
    highlightSelector: '#canvasViewport',
    position: 'top',
  },
  {
    id: 'minimap',
    title: 'Minimap',
    description: 'Use the minimap to jump around large canvases quickly.',
    highlightSelector: '#minimap',
    position: 'top',
  },
  {
    id: 'done',
    title: "You're Ready! 🚀",
    description: 'Start exploring. You can always reopen onboarding later.',
    highlightSelector: '#app',
    position: 'bottom',
    action: () => {
      localStorage.setItem('gitcanvas:onboardingComplete', 'true');
    },
  },
];

let currentStep = 0;
let tutorialOverlay: HTMLElement | null = null;
let activeContext: CanvasContext | null = null;

export function hasCompletedOnboarding(): boolean {
  return localStorage.getItem('gitcanvas:onboardingComplete') === 'true';
}

export function resetOnboarding(): void {
  localStorage.removeItem('gitcanvas:onboardingComplete');
  currentStep = 0;
}

export function startOnboarding(ctx: CanvasContext): void {
  if (tutorialOverlay) return;
  activeContext = ctx;
  currentStep = 0;
  showTutorialStep(ctx, currentStep);
}

function showTutorialStep(ctx: CanvasContext, stepIndex: number): void {
  if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) {
    hideTutorial();
    return;
  }

  const step = TUTORIAL_STEPS[stepIndex];

  if (!tutorialOverlay) {
    tutorialOverlay = document.createElement('div');
    tutorialOverlay.className = 'tutorial-overlay';
    tutorialOverlay.innerHTML = `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-content">
        <div class="tutorial-header">
          <h3 class="tutorial-title"></h3>
          <button class="tutorial-close" id="tutorialClose">×</button>
        </div>
        <div class="tutorial-description"></div>
        <div class="tutorial-progress">
          <span class="tutorial-step-count"></span>
        </div>
        <div class="tutorial-actions">
          <button class="btn-ghost" id="tutorialSkip">Skip Tour</button>
          <button class="btn-primary" id="tutorialNext">Next →</button>
        </div>
      </div>
    `;

    document.body.appendChild(tutorialOverlay);

    const style = document.createElement('style');
    style.dataset.gitmapsTutorial = 'true';
    style.textContent = `
      .tutorial-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tutorial-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 10, 15, 0.82);
        backdrop-filter: blur(4px);
      }
      .tutorial-content {
        position: relative;
        max-width: 460px;
        padding: 24px;
        border-radius: 14px;
        background: var(--bg-secondary, #111827);
        border: 1px solid var(--border-primary, #334155);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      }
      .tutorial-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .tutorial-title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .tutorial-close {
        border: none;
        background: none;
        color: inherit;
        font-size: 24px;
        cursor: pointer;
      }
      .tutorial-description {
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 18px;
      }
      .tutorial-progress {
        margin-bottom: 18px;
        opacity: 0.8;
        font-size: 12px;
      }
      .tutorial-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .tutorial-actions button {
        padding: 10px 18px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
      }
      .btn-primary {
        color: white;
        background: linear-gradient(135deg, #7c3aed, #3b82f6);
      }
      .tutorial-highlight {
        outline: 2px solid #8b5cf6;
        outline-offset: 4px;
        border-radius: 10px;
      }
    `;
    document.head.appendChild(style);

    tutorialOverlay
      .querySelector('#tutorialClose')
      ?.addEventListener('click', hideTutorial);
    tutorialOverlay
      .querySelector('#tutorialSkip')
      ?.addEventListener('click', () => {
        localStorage.setItem('gitcanvas:onboardingComplete', 'true');
        hideTutorial();
      });
    tutorialOverlay
      .querySelector('#tutorialNext')
      ?.addEventListener('click', advanceTutorial);

    document.addEventListener('keydown', handleTutorialKeydown);
  }

  const titleEl = tutorialOverlay.querySelector('.tutorial-title');
  const descriptionEl = tutorialOverlay.querySelector('.tutorial-description');
  const countEl = tutorialOverlay.querySelector('.tutorial-step-count');
  const nextBtn = tutorialOverlay.querySelector('#tutorialNext');

  if (titleEl) titleEl.textContent = step.title;
  if (descriptionEl) descriptionEl.textContent = step.description;
  if (countEl) {
    countEl.textContent = `Step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}`;
  }
  if (nextBtn) {
    nextBtn.textContent =
      stepIndex >= TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next →';
  }

  highlightElement(step.highlightSelector);
  activeContext = ctx;
}

function advanceTutorial(): void {
  const step = TUTORIAL_STEPS[currentStep];
  step?.action?.();
  currentStep += 1;
  if (activeContext) {
    showTutorialStep(activeContext, currentStep);
  } else {
    hideTutorial();
  }
}

function highlightElement(selector: string): void {
  document
    .querySelectorAll('.tutorial-highlight')
    .forEach((el) => el.classList.remove('tutorial-highlight'));

  const target = document.querySelector(selector);
  if (target instanceof HTMLElement) {
    target.classList.add('tutorial-highlight');
    target.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    });
  }
}

function handleTutorialKeydown(event: KeyboardEvent): void {
  if (!tutorialOverlay) return;

  if (event.key === 'Escape') {
    hideTutorial();
    return;
  }

  if (event.key === 'Enter' || event.key === 'ArrowRight') {
    event.preventDefault();
    advanceTutorial();
  }
}

function hideTutorial(): void {
  document
    .querySelectorAll('.tutorial-highlight')
    .forEach((el) => el.classList.remove('tutorial-highlight'));

  tutorialOverlay?.remove();
  tutorialOverlay = null;
  activeContext = null;
  document.removeEventListener('keydown', handleTutorialKeydown);
}