import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

// Animate a visual copy so the user's decision can be persisted immediately.
// The next real card stays interactive while its predecessor leaves the deck.
export function useCardMotion() {
  const cardRef = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [dragX, setDragX] = useState(0);
  const flights = useRef(new Set<() => void>());

  useEffect(
    () => () => {
      flights.current.forEach((cleanup) => cleanup());
    },
    [],
  );

  function depart(action: 'save' | 'reject') {
    const card = cardRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (card && !reducedMotion) {
      const previousTransform = card.style.transform;
      card.style.transform = 'none';
      const rect = card.getBoundingClientRect();
      card.style.transform = previousTransform;
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.classList.add('card-flight');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.querySelector('.swipe-feedback')?.remove();
      const label = document.createElement('span');
      label.className = `swipe-feedback ${action}`;
      label.textContent = action === 'save' ? 'KEEP' : 'PASS';
      ghost.append(label);
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        transform: 'none',
        animation: 'none',
        zIndex: '15',
        pointerEvents: 'none',
      });
      document.body.append(ghost);
      const direction = action === 'save' ? 1 : -1;
      const distance = direction * (window.innerWidth + rect.width);
      const animation = ghost.animate(
        [
          { transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`, opacity: 1 },
          { transform: `translate(${distance}px, 70px) rotate(${direction * 28}deg)`, opacity: 0 },
        ],
        { duration: 460, easing: 'cubic-bezier(.32,.02,.65,.55)', fill: 'forwards' },
      );
      const cleanup = () => {
        animation.cancel();
        ghost.remove();
        flights.current.delete(cleanup);
      };
      flights.current.add(cleanup);
      void animation.finished.then(cleanup, cleanup);
    }
    start.current = null;
    setDragX(0);
  }

  function reset() {
    start.current = null;
    setDragX(0);
  }

  return {
    cardRef,
    dragX,
    suppressClick,
    depart,
    reset,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick.current = false;
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragX(Math.max(-180, Math.min(180, dx)));
      }
    },
    finish(event: PointerEvent<HTMLButtonElement>): 'save' | 'reject' | null {
      if (!start.current) return null;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      reset();
      return Math.abs(dx) > 80 && Math.abs(dy) < 70 ? (dx > 0 ? 'save' : 'reject') : null;
    },
  };
}
