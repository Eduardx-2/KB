"use client";

import { cn } from "@/lib/utils";

function SimpleMarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith("### "))
          return (
            <h3 key={i} className="mb-1 mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        if (trimmed.startsWith("## "))
          return (
            <h2 key={i} className="mb-2 mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        if (trimmed.startsWith("# "))
          return (
            <h1 key={i} className="mb-2 text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        if (trimmed.startsWith("- "))
          return (
            <li key={i} className="ml-4 list-disc text-sm text-neutral-700 dark:text-neutral-300">
              {renderInline(trimmed.slice(2))}
            </li>
          );
        if (/^\d+\.\s/.test(trimmed))
          return (
            <li key={i} className="ml-4 list-decimal text-sm text-neutral-700 dark:text-neutral-300">
              {renderInline(trimmed.replace(/^\d+\.\s/, ""))}
            </li>
          );
        return (
          <p key={i} className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={idx} className="font-semibold text-neutral-900 dark:text-neutral-100">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={idx} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

const textareaCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 font-mono text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-4 focus:ring-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800";

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder = "Escribí markdown…",
  rows = 12,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </label>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={textareaCls}
        />
        <div className="min-h-[200px] rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Vista previa</p>
          {value.trim() ? (
            <SimpleMarkdownPreview content={value} />
          ) : (
            <p className="text-sm text-neutral-400">Sin contenido</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50", className)}>
      <SimpleMarkdownPreview content={content} />
    </div>
  );
}
