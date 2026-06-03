import { useState } from "react";
import {
  PenSquare,
  Search,
  ChevronDown,
  Star,
  Clock,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface Conversation {
  id: string;
  title: string;
  timestamp: string;
  pinned?: boolean;
}

const SAMPLE_CONVERSATIONS: Conversation[] = [
  { id: "1", title: "Python greet function example", timestamp: "Just now", pinned: true },
  { id: "2", title: "React vs Vue comparison", timestamp: "2 hours ago" },
  { id: "3", title: "TypeScript async/await patterns", timestamp: "Yesterday" },
  { id: "4", title: "Setting up a Vite project", timestamp: "Yesterday" },
  { id: "5", title: "Tailwind CSS dark mode setup", timestamp: "2 days ago" },
  { id: "6", title: "PostgreSQL query optimization", timestamp: "3 days ago" },
  { id: "7", title: "Docker compose networking", timestamp: "Last week" },
  { id: "8", title: "Git rebase vs merge strategy", timestamp: "Last week" },
];

interface ChatSidebarProps {
  activeId?: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
}

export function ChatSidebar({ activeId, onNewChat, onSelectChat }: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery
    ? SAMPLE_CONVERSATIONS.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SAMPLE_CONVERSATIONS;

  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Top area */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[oklch(0.65_0.2_30)] text-white">
            <span className="text-xs font-bold">A</span>
          </div>
          <span className="font-semibold text-sm">A-Chad</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={onNewChat}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <PenSquare className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {pinned.length > 0 && (
          <Section label="Pinned" icon={<Star className="h-3 w-3" />}>
            {pinned.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                isActive={c.id === activeId}
                isHovered={c.id === hoveredId}
                onHover={setHoveredId}
                onSelect={onSelectChat}
              />
            ))}
          </Section>
        )}

        {recent.length > 0 && (
          <Section label="Recent" icon={<Clock className="h-3 w-3" />}>
            {recent.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                isActive={c.id === activeId}
                isHovered={c.id === hoveredId}
                onHover={setHoveredId}
                onSelect={onSelectChat}
              />
            ))}
          </Section>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <MessageSquare className="h-5 w-5 opacity-40" />
            <p className="text-xs">No conversations found</p>
          </div>
        )}
      </div>

      {/* Bottom user area */}
      <div className="border-t border-sidebar-border p-2">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.2_30)] text-white text-xs font-semibold">
            U
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-medium truncate">User</p>
            <p className="text-[11px] text-muted-foreground truncate">Free plan</p>
          </div>
        </button>
      </div>
    </aside>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  isHovered,
  onHover,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(conversation.id)}
      onMouseEnter={() => onHover(conversation.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "group relative flex w-full items-center rounded-lg px-2 py-1.5 text-left transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
      )}
    >
      <span className="flex-1 truncate text-xs">{conversation.title}</span>

      {/* Hover actions */}
      {(isHovered || isActive) && (
        <div className="flex items-center gap-0.5 ml-1">
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </span>
        </div>
      )}
    </button>
  );
}
