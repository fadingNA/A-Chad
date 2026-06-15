import { ThreadListPrimitive, ThreadListItemPrimitive } from "@assistant-ui/react";
import { PenSquare, Clock, Trash2, PanelLeft, Sun, Moon } from "lucide-react";
import { OllamaSettings } from "./ollama-settings";
import type { OllamaConfig } from "@/lib/ollama-adapter";

interface ChatSidebarProps {
  config: OllamaConfig;
  onConfigChange: (config: OllamaConfig) => void;
  dark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export function ChatSidebar({
  config,
  onConfigChange,
  dark,
  onToggleTheme,
  onToggleSidebar,
}: ChatSidebarProps) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Top area */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[oklch(0.65_0.2_30)] text-white">
            <span className="text-xs font-bold">K</span>
          </div>
          <span className="font-semibold text-sm">Kirby</span>
          <span className="rounded-full border border-[oklch(0.65_0.2_30)/30] bg-[oklch(0.65_0.2_30)/10] px-2 py-0.5 text-[10px] font-medium text-[oklch(0.55_0.2_30)] dark:text-[oklch(0.75_0.2_30)]">
            Beta
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <ThreadListPrimitive.New asChild>
            <button
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              title="New chat"
            >
              <PenSquare className="h-4 w-4" />
            </button>
          </ThreadListPrimitive.New>
          <button
            onClick={onToggleSidebar}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conversations list */}
      <ThreadListPrimitive.Root className="flex-1 overflow-y-auto px-2 py-1">
        <div className="mb-3">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Recent
            </span>
          </div>
          <ThreadListPrimitive.Items components={{ ThreadListItem }} />
        </div>
      </ThreadListPrimitive.Root>

      {/* Settings row */}
      <div className="flex items-center justify-between gap-1 border-t border-sidebar-border px-2 py-2">
        <OllamaSettings config={config} onChange={onConfigChange} />
        <button
          onClick={onToggleTheme}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Bottom user area */}
      <div className="border-t border-sidebar-border p-2">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.2_30)] text-white text-xs font-semibold">
            U
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-medium truncate">User-Test</p>
            <p className="text-[11px] text-muted-foreground truncate">CCG</p>
          </div>
        </button>
      </div>
    </aside>
  );
}

function ThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root
      className="group/item relative mb-0.5 flex w-full items-center rounded-lg transition-colors hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
    >
      <ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left">
        <span className="truncate text-xs">
          <ThreadListItemPrimitive.Title fallback="New chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>

      <ThreadListItemPrimitive.Delete asChild>
        <button
          className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/item:opacity-100"
          title="Delete chat"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  );
}
