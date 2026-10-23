import { flushSync } from "react-dom";

/**
 * Circular reveal from the point the user clicked (same effect as the demo video).
 * `change` should be a plain state update — it is flushed synchronously so the
 * browser can snapshot the new UI before animating.
 *
 * Falls back to an instant change on browsers without View Transitions or when
 * the user has "reduce motion" turned on.
 */
export function wipe(event, change, duration = 620) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!document.startViewTransition || reduce) {
    change();
    return;
  }

  const x = event?.clientX ?? window.innerWidth / 2;
  const y = event?.clientY ?? window.innerHeight / 2;
  const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(() => {
    flushSync(change);
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration, easing: "cubic-bezier(.85,0,.15,1)", pseudoElement: "::view-transition-new(root)" }
    );
  });
}
