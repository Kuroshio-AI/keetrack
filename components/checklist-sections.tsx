// No "use client": it is only rendered by client components, and it takes callbacks.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Check, CheckCircle2, ChevronDown, Circle, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RESULT_LABELS } from "@/lib/client";

export type Answer = "pass" | "fail" | "na";
type Item = { id: string; label: string; section?: string };
type Group = { section?: string; items: Item[] };

const ANSWERS = ["pass", "fail", "na"] as const;
const SELECTED = { pass: "bg-success text-white", fail: "bg-danger text-white", na: "bg-slate-500 text-white" };
const ICON = { pass: CheckCircle2, fail: XCircle, na: MinusCircle };
const TONE = { pass: "text-success", fail: "text-danger", na: "text-slate-400" };
// interior's spring, as on the Buildings table; folding uses a plain ease so the height never overshoots.
const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const FOLD = { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] } as const;
const scrollBehavior = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// Items follow the paper form, so a section is a run of items under the same heading.
function groupItems(items: Item[]): Group[] {
  return items.reduce<Group[]>((groups, item) => {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
    return groups;
  }, []);
}

// Fills as the section's items are answered; once done it shows a check, or the Not Ok count in red.
function SectionRing({ done, total, fails }: { done: number; total: number; fails: number }) {
  const complete = done === total;
  return <span className="relative grid size-7 shrink-0 place-items-center" aria-hidden="true">
    <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90">
      <circle cx="14" cy="14" r="12" fill="none" strokeWidth="2.5" className="stroke-[#e3ebf1]" />
      <motion.circle cx="14" cy="14" r="12" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-accent" initial={false} animate={{ pathLength: done / total, opacity: done ? 1 : 0 }} transition={SPRING} />
    </svg>
    <AnimatePresence initial={false}>{complete && <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING} className={`relative grid size-7 place-items-center rounded-full text-xs font-bold text-white ${fails ? "bg-danger" : "bg-success"}`}>{fails || <Check className="size-4" strokeWidth={3} />}</motion.span>}</AnimatePresence>
  </span>;
}

function Row({ id, item, result, disabled, onPick }: { id: string; item: Item; result?: Answer; disabled: boolean; onPick: (answer: Answer) => void }) {
  const Icon = result ? ICON[result] : Circle;
  return <div id={id} className="flex scroll-mt-28 flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <span className="flex items-start gap-2 text-sm font-medium text-navy"><Icon className={`mt-0.5 size-4 shrink-0 ${result ? TONE[result] : "text-slate-300"}`} aria-hidden="true" />{item.label}</span>
    <div role="radiogroup" aria-label={item.label} className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border border-line bg-white p-1 sm:w-[204px]">
      {ANSWERS.map((value) => <label key={value} className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
        <input type="radio" className="peer sr-only" name={id} value={value} checked={result === value} disabled={disabled} onChange={() => onPick(value)} />
        <span className={`block rounded-md px-2 py-2.5 text-center text-sm font-semibold transition-[color,background-color,transform] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-1 sm:py-2 ${result === value ? SELECTED[value] : `text-slate-600 ${disabled ? "opacity-50" : "hover:bg-paper active:scale-[.96]"}`}`}>{RESULT_LABELS[value]}</span>
      </label>)}
    </div>
  </div>;
}

// A long PPM checklist one section at a time: answering a section's last item folds it and opens the next one with items left.
// Items without a section (Kee's four checks) render as one plain list.
export function ChecklistSections({ name, items, results, onAnswer, disabled = false, stickyProgress = false }: {
  name: string;
  items: Item[];
  results: Record<string, Answer | undefined>;
  onAnswer: (answers: Record<string, Answer>) => void;
  disabled?: boolean;
  stickyProgress?: boolean;
}) {
  const groups = groupItems(items);
  const left = (group: Group, answers = results) => group.items.filter((item) => !answers[item.id]).length;
  const fails = (group: Group) => group.items.filter((item) => results[item.id] === "fail").length;
  // Open the first section still to answer; a finished checklist opens where its first Not Ok is.
  const [open, setOpen] = useState<number | undefined>(() => {
    const index = [groups.findIndex((group) => left(group) > 0), groups.findIndex((group) => fails(group) > 0)].find((candidate) => candidate !== -1);
    return index;
  });
  const sections = useRef<(HTMLElement | null)[]>([]);
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The section an auto-advance opened; it scrolls into view once it has unfolded.
  const scrollTo = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  const answered = items.filter((item) => results[item.id]).length;
  const notOk = items.filter((item) => results[item.id] === "fail").length;
  const rowId = (item: Item) => `${name}-${item.id}`;

  function answer(index: number, updates: Record<string, Answer>) {
    const firstAnswer = Object.keys(updates).some((id) => !results[id]);
    onAnswer(updates);
    // Changing an answer already given never moves the page.
    if (!firstAnswer) return;
    const next = { ...results, ...updates };
    const group = groups[index];
    clearTimeout(advance.current);
    if (left(group, next) > 0) {
      const nextItem = group.items.find((item) => !next[item.id]);
      if (nextItem && Object.keys(updates).length === 1) document.getElementById(rowId(nextItem))?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      return;
    }
    // A beat to see the section finish, then fold it and open the next one with items left.
    const after = groups.findIndex((candidate, position) => position > index && left(candidate, next) > 0);
    const target = after !== -1 ? after : groups.findIndex((candidate) => left(candidate, next) > 0);
    advance.current = setTimeout(() => { scrollTo.current = target === -1 ? undefined : target; setOpen(target === -1 ? undefined : target); }, 450);
  }

  if (!groups.some((group) => group.section)) return <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
    {items.map((item) => <Row key={item.id} id={rowId(item)} item={item} result={results[item.id]} disabled={disabled} onPick={(value) => onAnswer({ [item.id]: value })} />)}
  </div>;

  return <MotionConfig reducedMotion="user"><div className="flex flex-col gap-3">
    {!disabled && <div className={stickyProgress ? "sticky top-0 z-10 -mx-4 bg-[#f3f7f9]/90 px-4 py-2.5 backdrop-blur" : ""}>
      <div className="flex items-baseline justify-between gap-3 text-xs font-semibold tabular-nums"><span className="text-navy">{answered} of {items.length} answered</span>{notOk > 0 && <span className="text-danger">{notOk} {RESULT_LABELS.fail}</span>}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e3ebf1]"><motion.div className={`h-full origin-left rounded-full ${answered === items.length ? "bg-success" : "bg-accent"}`} initial={false} animate={{ scaleX: answered / items.length }} transition={SPRING} /></div>
    </div>}
    {groups.map((group, index) => {
      const isOpen = open === index;
      const remaining = left(group);
      const failed = fails(group);
      const bodyId = `${name}-section-${index}`;
      return <section key={index} ref={(element) => { sections.current[index] = element; }} aria-label={group.section} className={`scroll-mt-28 overflow-hidden rounded-xl border bg-white transition-colors ${isOpen ? "border-[#b8cedc]" : "border-line"}`}>
        <div className="flex items-center gap-2 pr-3">
          <button type="button" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => { clearTimeout(advance.current); setOpen(isOpen ? undefined : index); }} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-4 text-left">
            <SectionRing done={group.items.length - remaining} total={group.items.length} fails={failed} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-navy">{group.section}</span>
              <span className="block text-xs tabular-nums text-slate-500">{group.items.length - remaining} of {group.items.length}{failed > 0 && <span className="font-semibold text-danger"> · {failed} {RESULT_LABELS.fail}</span>}</span>
            </span>
            <motion.span initial={false} animate={{ rotate: isOpen ? 180 : 0 }} transition={SPRING} className="text-slate-400"><ChevronDown className="size-4" aria-hidden="true" /></motion.span>
          </button>
          {isOpen && remaining > 0 && !disabled && <Button variant="outline" size="sm" className="shrink-0" title={`Answer this section's ${remaining} unanswered item${remaining === 1 ? "" : "s"} ${RESULT_LABELS.pass}`} onClick={() => answer(index, Object.fromEntries(group.items.filter((item) => !results[item.id]).map((item) => [item.id, "pass" as const])))}>Mark rest {RESULT_LABELS.pass}</Button>}
        </div>
        <AnimatePresence initial={false}>{isOpen && <motion.div key="body" id={bodyId} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={FOLD}
          onAnimationComplete={() => { if (scrollTo.current !== index) return; scrollTo.current = undefined; sections.current[index]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}>
          <div className="divide-y divide-line border-t border-line">{group.items.map((item) => <Row key={item.id} id={rowId(item)} item={item} result={results[item.id]} disabled={disabled} onPick={(value) => answer(index, { [item.id]: value })} />)}</div>
        </motion.div>}</AnimatePresence>
      </section>;
    })}
  </div></MotionConfig>;
}
