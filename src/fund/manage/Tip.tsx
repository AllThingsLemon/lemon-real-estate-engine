// Tooltips for the manage pages: what a button does, or what a section or
// figure shows. They open on mouse hover and keyboard focus (not on a tap,
// which would cover the button's own action), stay open while the pointer
// is over them, close with Escape, and screen readers read them as the
// trigger's description (WCAG 1.4.13). The ⓘ info buttons also open on a
// tap, for phones. The bubble renders into <body> so a table's scroll area
// can't clip it.
import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Place = 'top' | 'right';

/** Props for the element a tooltip explains (none without tooltip text). */
export interface TipTrigger {
  ref?: (el: HTMLElement | null) => void;
  'aria-describedby'?: string;
  onPointerEnter?: (e: { pointerType: string }) => void;
  onPointerLeave?: (e: { pointerType: string }) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
}

/** Props to spread on the element a tooltip explains, and the bubble to render beside it. */
export function useTip(text: ReactNode | undefined, place: Place = 'top'): { trigger: TipTrigger; bubble: ReactNode; open: boolean; setOpen: (open: boolean) => void } {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const timer = useRef(0);
  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  // A short delay lets the pointer cross onto the bubble without closing it.
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (!text) return { trigger: {}, bubble: null, open, setOpen };
  return {
    trigger: {
      ref: (el: HTMLElement | null) => {
        ref.current = el;
      },
      'aria-describedby': id,
      onPointerEnter: (e) => {
        if (e.pointerType === 'mouse') show();
      },
      onPointerLeave: (e) => {
        if (e.pointerType === 'mouse') hide();
      },
      // Keyboard focus only: a tap focuses a button too, and shouldn't cover it.
      onFocus: (e) => {
        if (e.currentTarget.matches(':focus-visible')) show();
      },
      onBlur: hide,
    },
    bubble: (
      <Bubble id={id} open={open} anchor={ref} place={place} onEnter={show} onLeave={hide}>
        {text}
      </Bubble>
    ),
    open,
    setOpen,
  };
}

function Bubble({ id, open, anchor, place, onEnter, onLeave, children }: { id: string; open: boolean; anchor: RefObject<HTMLElement | null>; place: Place; onEnter: () => void; onLeave: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: string } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const a = anchor.current?.getBoundingClientRect();
      const b = ref.current?.getBoundingClientRect();
      if (!a || !b) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const clampX = (x: number) => Math.min(Math.max(gap, x), vw - b.width - gap);
      const clampY = (y: number) => Math.min(Math.max(gap, y), vh - b.height - gap);
      if (place === 'right' && a.right + gap + b.width <= vw - gap) {
        setPos({ top: clampY(a.top + a.height / 2 - b.height / 2), left: a.right + gap, side: 'right' });
      } else if (a.top - gap - b.height >= gap) {
        setPos({ top: a.top - gap - b.height, left: clampX(a.left + a.width / 2 - b.width / 2), side: 'top' });
      } else {
        setPos({ top: a.bottom + gap, left: clampX(a.left + a.width / 2 - b.width / 2), side: 'bottom' });
      }
    };
    fit();
    window.addEventListener('scroll', fit, true);
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('scroll', fit, true);
      window.removeEventListener('resize', fit);
    };
  }, [open, anchor, place]);
  // Always in the page, so screen readers can read it as the description; hidden until it opens.
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="mg-tip"
      hidden={!open}
      data-side={pos?.side}
      style={open && pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A small ⓘ button that explains the heading, figure or field next to it. Opens on hover, focus or a tap. */
export function InfoTip({ about, children, place }: { about: string; children: ReactNode; place?: Place }) {
  const t = useTip(children, place);
  const btn = useRef<HTMLButtonElement | null>(null);
  // A tap or click toggles it; a tap elsewhere closes it.
  useEffect(() => {
    if (!t.open) return;
    const away = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.mg-tip')) t.setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [t.open, t]);
  const { ref, ...rest } = t.trigger as { ref?: (el: HTMLElement | null) => void };
  // The word joiner keeps the button on the line of the word before it, so it
  // never wraps on its own. A flex row that wraps needs its label and this in
  // one element (see "Your roles").
  return (
    <span className="mg-infotip-glue">
      {'⁠'}
      <button
        type="button"
        className="mg-infotip"
        aria-label={`About ${about}`}
        {...rest}
        ref={(el) => {
          btn.current = el;
          ref?.(el);
        }}
        onClick={() => t.setOpen(!t.open)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {t.bubble}
    </span>
  );
}
