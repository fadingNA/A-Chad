import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useEditComposer,
  useMessage,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { makeLightSyntaxHighlighter } from "@assistant-ui/react-syntax-highlighter";
import atomOneLight from "react-syntax-highlighter/dist/esm/styles/hljs/atom-one-light";
import atomOneDark from "react-syntax-highlighter/dist/esm/styles/hljs/atom-one-dark";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  RefreshCw,
  Square,
  ThumbsDown,
  ThumbsUp,
  Sparkles,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

const LightSyntaxHighlighter = makeLightSyntaxHighlighter({
  style: atomOneLight,
  showLineNumbers: true,
});
const DarkSyntaxHighlighter = makeLightSyntaxHighlighter({
  style: atomOneDark,
  showLineNumbers: true,
});

/**
 * Tracks the `dark` class on <html> (toggled by the theme switch in App.tsx)
 * and re-renders when it changes, so code blocks switch palettes live.
 */
function useIsDarkMode() {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false
  );
}

/**
 * react-syntax-highlighter writes the theme's colors as inline styles, so a
 * single static style can't adapt to dark mode — we pick the matching palette
 * (atom-one-light / atom-one-dark) based on the active theme instead.
 */
function SyntaxHighlighter(
  props: ComponentPropsWithoutRef<typeof LightSyntaxHighlighter>
) {
  const isDark = useIsDarkMode();
  const Highlighter = isDark ? DarkSyntaxHighlighter : LightSyntaxHighlighter;
  return <Highlighter {...props} />;
}

type WithNode = { node?: unknown };

const mdComponents = {
  SyntaxHighlighter,
  table: ({ node: _n, ...props }: ComponentPropsWithoutRef<"table"> & WithNode) => (
    <Table className="my-3" {...props} />
  ),
  thead: ({ node: _n, ...props }: ComponentPropsWithoutRef<"thead"> & WithNode) => (
    <TableHeader {...props} />
  ),
  tbody: ({ node: _n, ...props }: ComponentPropsWithoutRef<"tbody"> & WithNode) => (
    <TableBody {...props} />
  ),
  tr: ({ node: _n, ...props }: ComponentPropsWithoutRef<"tr"> & WithNode) => (
    <TableRow {...props} />
  ),
  th: ({ node: _n, ...props }: ComponentPropsWithoutRef<"th"> & WithNode) => (
    <TableHead {...props} />
  ),
  td: ({ node: _n, ...props }: ComponentPropsWithoutRef<"td"> & WithNode) => (
    <TableCell {...props} />
  ),
};

function MarkdownContent() {
  return (
    <MarkdownTextPrimitive
      smooth
      remarkPlugins={[remarkGfm]}
      className="prose prose-sm dark:prose-invert max-w-none
        prose-p:leading-relaxed prose-p:my-1.5
        prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
        prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
        prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:my-3 prose-pre:rounded-xl prose-pre:p-0 prose-pre:bg-transparent prose-pre:overflow-hidden
        prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-blockquote:not-italic
        prose-table:border-0 prose-thead:border-0 prose-tbody:border-0 prose-tr:border-0 prose-th:border-0 prose-td:border-0 prose-th:p-0 prose-td:p-0"
      components={mdComponents}
    />
  );
}

function UserMessage() {
  const isEditing = useEditComposer((s) => s.isEditing);

  return (
    <MessagePrimitive.Root className="group flex w-full justify-end gap-2 py-2">
      <div className="flex max-w-[85%] flex-col items-end gap-1">
        {!isEditing ? (
          <>
            <div className="rounded-2xl bg-[oklch(0.97_0_0)] dark:bg-[oklch(0.269_0_0)] px-4 py-2.5 text-sm empty:hidden">
              <MessagePrimitive.Parts
                components={{
                  Text: ({ text }) => (
                    <span className="whitespace-pre-wrap break-words">{text}</span>
                  ),
                }}
              />
            </div>

            {/* Attached files shown under the query */}
            <div className="flex flex-wrap justify-end gap-2 empty:hidden">
              <MessagePrimitive.Attachments
                components={{ Attachment: MessageAttachment }}
              />
            </div>
            <ActionBarPrimitive.Root
              hideWhenRunning
              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ActionBarPrimitive.Edit asChild>
                <IconButton tooltip="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
              </ActionBarPrimitive.Edit>
            </ActionBarPrimitive.Root>
          </>
        ) : (
          <div className="w-full min-w-[320px]">
            <ComposerPrimitive.Root className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 shadow-sm focus-within:border-ring/50">
              <ComposerPrimitive.Input
                className="min-h-[60px] resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="flex justify-end gap-2">
                <ComposerPrimitive.Cancel asChild>
                  <button className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </ComposerPrimitive.Cancel>
                <ComposerPrimitive.Send asChild>
                  <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity">
                    Save & Submit
                  </button>
                </ComposerPrimitive.Send>
              </div>
            </ComposerPrimitive.Root>
          </div>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}

function ReasoningPart({
  text,
  status,
}: {
  text: string;
  status?: { type?: string };
}) {
  const running = status?.type === "running";
  return (
    <details
      open={running}
      className="my-1.5 rounded-lg border border-border/60 bg-muted/40 text-xs"
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-1.5 font-medium text-muted-foreground">
        <span>💭 {running ? "Thinking…" : "Thoughts"}</span>
        {running && <ProcessingDots />}
      </summary>
      <div className="whitespace-pre-wrap px-3 pb-2.5 leading-relaxed text-muted-foreground">
        {text}
      </div>
    </details>
  );
}

const PROCESSING_PHRASES = [
  "Thinking",
  "Working on it",
  "Gathering details",
  "Almost there",
];

function ProcessingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Shows what the agent is doing while a response is pending. Uses the real
 * server stage when present (e.g. "Transcribing audio…"), otherwise cycles
 * gentle generic phrases. Hides as soon as the answer starts streaming.
 */
function ProcessingIndicator() {
  const isRunning = useMessage((m) => m.status?.type === "running");
  const hasContent = useMessage((m) =>
    m.content.some(
      (p) =>
        (p.type === "text" || p.type === "reasoning") &&
        ((p as { text?: string }).text?.length ?? 0) > 0
    )
  );
  const stage = useMessage(
    (m) => (m.metadata?.custom?.status as string | undefined) ?? ""
  );
  const [phrase, setPhrase] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (stage) return; // a real stage is showing — don't cycle generic phrases
    const id = setInterval(
      () => setPhrase((n) => (n + 1) % PROCESSING_PHRASES.length),
      2200
    );
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (!isRunning) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  if (!isRunning || hasContent) return null;
  const label = stage || PROCESSING_PHRASES[phrase];
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ProcessingDots />
      {elapsed > 2 && (
        <span className="shrink-0 tabular-nums text-xs opacity-60">{clock}</span>
      )}
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex w-full gap-3 py-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.2_30)] text-white shadow-sm">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="text-sm">
          {/* MarkdownContent must be the Text component inside Parts to get part scope */}
          <MessagePrimitive.Parts
            components={{ Text: MarkdownContent, Reasoning: ReasoningPart }}
          />
          <ProcessingIndicator />
        </div>

        <ActionBarPrimitive.Root
          hideWhenRunning
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ActionBarPrimitive.Copy asChild>
            <IconButton tooltip="Copy">
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload asChild>
            <IconButton tooltip="Regenerate">
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
          </ActionBarPrimitive.Reload>
          <ActionBarPrimitive.FeedbackPositive asChild>
            <IconButton tooltip="Good response">
              <ThumbsUp className="h-3.5 w-3.5" />
            </IconButton>
          </ActionBarPrimitive.FeedbackPositive>
          <ActionBarPrimitive.FeedbackNegative asChild>
            <IconButton tooltip="Bad response">
              <ThumbsDown className="h-3.5 w-3.5" />
            </IconButton>
          </ActionBarPrimitive.FeedbackNegative>

          <BranchPickerPrimitive.Root
            hideWhenSingleBranch
            className="flex items-center gap-0.5 text-xs text-muted-foreground"
          >
            <BranchPickerPrimitive.Previous asChild>
              <IconButton tooltip="Previous">
                <ChevronLeft className="h-3.5 w-3.5" />
              </IconButton>
            </BranchPickerPrimitive.Previous>
            <span className="tabular-nums">
              <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
            </span>
            <BranchPickerPrimitive.Next asChild>
              <IconButton tooltip="Next">
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </BranchPickerPrimitive.Next>
          </BranchPickerPrimitive.Root>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

function ThreadWelcome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[oklch(0.65_0.2_30)] text-white shadow-md">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">What can I help with?</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ask me anything — code, writing, analysis, math, or just a conversation.
        </p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <ThreadPrimitive.Suggestion
            key={s.prompt}
            prompt={s.prompt}
            method="replace"
            autoSend
            asChild
          >
            <button className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3.5 text-left text-sm shadow-sm hover:bg-accent hover:border-border/80 transition-colors">
              <span className="text-lg">{s.icon}</span>
              <span className="font-medium text-xs leading-snug">{s.label}</span>
            </button>
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  { icon: "💻", label: "Write a Python function", prompt: "Write a Python function that reverses a linked list" },
  { icon: "📝", label: "Explain a concept", prompt: "Explain how React's useEffect hook works with a simple example" },
  { icon: "🔍", label: "Debug my code", prompt: "I have a bug in my code. Can you help me debug it?" },
  { icon: "✨", label: "Brainstorm ideas", prompt: "Give me 5 creative ideas for a side project using TypeScript" },
];

function MessageAttachment() {
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <AttachmentPrimitive.Name className="max-w-[180px] truncate" />
    </AttachmentPrimitive.Root>
  );
}

function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1 text-xs">
      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
      <AttachmentPrimitive.Name className="max-w-[160px] truncate" />
      <AttachmentPrimitive.Remove asChild>
        <button
          type="button"
          title="Remove attachment"
          className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function Composer() {
  return (
    <div className="w-full px-4 pb-4 pt-2">
      <ComposerPrimitive.Root className="flex flex-col gap-2 rounded-2xl border border-border bg-background shadow-sm focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/20 transition-all">
        <ComposerPrimitive.AttachmentDropzone className="relative flex flex-col gap-2 rounded-2xl transition data-[dragging=true]:ring-2 data-[dragging=true]:ring-[oklch(0.65_0.2_30)] data-[dragging=true]:ring-offset-2 data-[dragging=true]:ring-offset-background">
        <ComposerPrimitive.Attachments
          components={{ Attachment: ComposerAttachment }}
          className="flex flex-wrap gap-2 px-3 pt-3 empty:hidden"
        />
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Message A-Chad..."
          className="max-h-48 min-h-[52px] resize-none bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1">
            <ComposerPrimitive.AddAttachment asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Attach files (text, PDF, audio, images)"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </ComposerPrimitive.AddAttachment>
          </div>
          <div className="flex items-center gap-2">
            <ComposerPrimitive.Cancel asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            </ComposerPrimitive.Cancel>

            <ComposerPrimitive.Send asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[oklch(0.65_0.2_30)] text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </ComposerPrimitive.Send>
          </div>
        </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        A-Chad can make mistakes. Consider checking important information.
      </p>
    </div>
  );
}

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full w-full flex-col bg-background">
      {/* Scrollable messages area — min-h-0 lets it shrink inside the flex parent */}
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ThreadPrimitive.Empty>
          <ThreadWelcome />
        </ThreadPrimitive.Empty>

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      {/* Composer pinned at bottom, outside the scroll area */}
      <div className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl">
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}

function IconButton({
  tooltip,
  children,
  className,
}: {
  tooltip: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      className={cn(
        "rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}
