import { useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { ChatSidebar } from "./components/chat-sidebar";
import { Thread } from "./components/assistant/thread";
import { OllamaSettings } from "./components/ollama-settings";
import { createOllamaAdapter, type OllamaConfig } from "./lib/ollama-adapter";
import { Sun, Moon, PanelLeft } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "llama3.2",
};

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
  const [activeChat, setActiveChat] = useState<string>("1");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { dark, toggle } = useTheme();

  // Ollama config — stored in a ref so the adapter always reads the latest
  // value without the runtime needing to be recreated.
  const [config, setConfig] = useState<OllamaConfig>(DEFAULT_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;

  const adapter = useMemo(
    () => createOllamaAdapter(() => configRef.current),
    // adapter is created once; it reads config via the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const runtime = useLocalRuntime(adapter);

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

            <div className="ml-auto flex items-center gap-2">
              {/* Ollama middleware settings */}
              <OllamaSettings config={config} onChange={setConfig} />

              <div className="h-4 w-px bg-border" />

              <button
                onClick={toggle}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Toggle theme"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {/* Thread */}
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
