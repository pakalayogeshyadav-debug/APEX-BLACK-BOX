import type { ConsoleLayoutPreference } from '../types/simulator';

export const DEFAULT_SIM_LAYOUT: ConsoleLayoutPreference = {
  version: 1,
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  windowMode: 'floating',
  viewMode: 'expanded',
  x: 100,
  y: 84,
  width: 740,
  height: 620
};

/**
 * Validates and clamps a simulator console layout against given viewport bounds.
 * Prevents window from becoming inaccessible or resizing below minimum operable dimensions.
 */
export function validateAndClampLayout(
  raw: unknown,
  viewportWidth = 1280,
  viewportHeight = 800
): ConsoleLayoutPreference {
  const minW = 380;
  const minH = 340;
  const maxW = Math.max(minW, viewportWidth - 20);
  const maxH = Math.max(minH, viewportHeight - 40);

  const fallback: ConsoleLayoutPreference = {
    ...DEFAULT_SIM_LAYOUT,
    x: Math.max(20, viewportWidth - 780),
    y: 84
  };

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const obj = raw as Partial<ConsoleLayoutPreference>;
  if (obj.version !== 1) {
    return fallback;
  }

  const width = Math.max(minW, Math.min(maxW, Number(obj.width) || fallback.width));
  const height = Math.max(minH, Math.min(maxH, Number(obj.height) || fallback.height));
  const maxX = Math.max(10, viewportWidth - width - 10);
  const maxY = Math.max(70, viewportHeight - height - 10);

  const x = Math.max(10, Math.min(maxX, Number(obj.x) ?? fallback.x));
  const y = Math.max(70, Math.min(maxY, Number(obj.y) ?? fallback.y));

  return {
    version: 1,
    isOpen: Boolean(obj.isOpen),
    isMinimized: Boolean(obj.isMinimized),
    isMaximized: Boolean(obj.isMaximized),
    windowMode: obj.windowMode === 'docked' ? 'docked' : 'floating',
    viewMode: obj.viewMode === 'compact' ? 'compact' : 'expanded',
    x,
    y,
    width,
    height
  };
}

/**
 * Checks whether an element is an active text input or editable element.
 * Prevents driving keys (W/A/S/D/Space/I/R) from triggering while typing.
 */
export function isTypingInInputElement(
  tagName: string | null | undefined,
  isContentEditable = false
): boolean {
  if (!tagName) return false;
  const tag = tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || isContentEditable;
}
