"use client";

// Copied from interior (github.com/ddoemonn/interior, MIT): the headless hook, with KTrack's own markup where noted.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export type FlashDirection = "up" | "down";

export type UseValueFlashOptions<T> = {
  hold?: number;
  compare?: (next: T, previous: T) => number;
};

export type ValueFlashState<T> = {
  direction: FlashDirection | null;
  from: T;
  changeId: number;
  flashing: boolean;
};

export function useValueFlash<T>(
  value: T,
  { hold = 900, compare }: UseValueFlashOptions<T> = {},
): ValueFlashState<T> {
  const [state, setState] = useState<ValueFlashState<T>>({
    direction: null,
    from: value,
    changeId: 0,
    flashing: false,
  });

  const previous = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rank = useRef(compare);

  useEffect(() => {
    rank.current = compare;
  });

  useEffect(() => {
    const prior = previous.current;
    if (Object.is(prior, value)) return;
    previous.current = value;

    const measure = rank.current;
    const delta = measure
      ? measure(value, prior)
      : typeof value === "number" && typeof prior === "number"
        ? value - prior
        : 0;

    if (delta === 0) return;

    setState((prev) => ({
      direction: delta > 0 ? "up" : "down",
      from: prior,
      changeId: prev.changeId + 1,
      flashing: true,
    }));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setState((prev) => (prev.flashing ? { ...prev, flashing: false } : prev));
    }, hold);
  }, [value, hold]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return state;
}

const ROLL = { type: "spring", stiffness: 460, damping: 32, mass: 0.55 } as const;

// KTrack's take on interior's ValueFlash: the number rolls up or down when it changes, without the tint or arrow.
export function RollingNumber({ value, className = "" }: { value: number; className?: string }) {
  const { direction, changeId } = useValueFlash(value);
  const offset = direction === "down" ? -1 : 1;
  return <span className={`relative inline-grid overflow-hidden tabular-nums ${className}`}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={changeId} className="col-start-1 row-start-1" initial={{ opacity: 0, y: `${0.85 * offset}em` }} animate={{ opacity: 1, y: "0em" }} exit={{ opacity: 0, y: `${-0.7 * offset}em`, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }} transition={ROLL}>{value}</motion.span>
    </AnimatePresence>
  </span>;
}
