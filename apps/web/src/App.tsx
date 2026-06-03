import { useState } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { mockAdapter } from "./lib/mock-adapter";
import { ChatSidebar } from "./components/chat-sidebar";
import { Thread } from "./components/assistant/thread";
import { Sun, Moon, PanelLeft } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const toggle = () => {
    document.documentElement.classList.toggle("dark");
    setDark((d) => !d);
  };
  return { dark, toggle };
}

function ChatApp() {
  const runtime = useLocalRuntime(mockAdapter);
  const [activeChat, setActiveChat] = useState<string>("1");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { dark, toggle } = useTheme();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-svh overflow-hidden bg-background text-foreground">
        {/* Sidebar */}
        <div
          className={cn(
            "transition-all duration-300 overflow-hidden shrink-0",
            sidebarOpen ? "w-[260px]" : "w-0"
          )}
        >
          <ChatSidebar
            activeId={activeChat}
            onNewChat={() => setActiveChat("")}
            onSelectChat={setActiveChat}
          />
        </div>

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col border-l border-border">
          {/* Topbar */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Toggle sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">A-Chad</span>
              <span className="rounded-full border border-[oklch(0.65_0.2_30)/30] bg-[oklch(0.65_0.2_30)/10] px-2 py-0.5 text-[10px] font-medium text-[oklch(0.55_0.2_30)] dark:text-[oklch(0.75_0.2_30)]">
                Beta
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={toggle}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Toggle theme"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {/* Thread — min-h-0 lets it shrink so overflow-y-auto inside works */}
          <main className="flex min-h-0 flex-1">
            <Thread />
          </main>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

export function App() {
  return <ChatApp />;
}
