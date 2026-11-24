"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { passageParagraphs } from "../../lib/exam-shared";

// A reading passage shown above the group of questions that use it, in the
// student exam screen and the result screen. Plain text only (rendered as
// text, never as HTML), set in a serif "paper" column for long reading.
export default function PassageBlock({ passage, part, partCount, collapsible = false }) {
  if (!passage) return null;
  const label = part ? `Part ${part}${partCount ? ` of ${partCount}` : ""}` : "Reading passage";
  const paragraphs = passageParagraphs(passage.body);

  const body = (
    <div className="space-y-4">
      {passage.title && <h3 className="text-balance text-lg font-semibold tracking-tight text-ink sm:text-xl">{passage.title}</h3>}
      <div className="max-w-[65ch] space-y-3.5 font-serif text-[15.5px] leading-7 text-ink/90">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line text-pretty break-words">{paragraph}</p>
        ))}
      </div>
    </div>
  );

  return (
    <section
      className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgb(31_35_40/0.04),0_12px_32px_-18px_rgb(31_35_40/0.18)] ring-1 ring-border-subtle"
      aria-label={passage.title ? `${label}: ${passage.title}` : label}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle bg-page/70 px-4 py-2.5 sm:px-6">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-active text-primary">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold tracking-wide text-ink">{label}</span>
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        {passage.instructions && (
          <p className="text-pretty rounded-xl border-l-[3px] border-primary bg-page px-3.5 py-2.5 text-sm font-medium leading-relaxed text-ink">
            {passage.instructions}
          </p>
        )}
        {collapsible ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold text-ink transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              <span className="group-open:hidden">Show the passage{passage.title ? `: ${passage.title}` : ""}</span>
              <span className="hidden group-open:inline">Hide the passage</span>
            </summary>
            <div className="mt-4">{body}</div>
          </details>
        ) : (
          body
        )}
      </div>
    </section>
  );
}
