import { useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { ChatSidebar } from "./components/chat-sidebar";
import { Thread } from "./components/assistant/thread";
import { OllamaSettings } from "./components/ollama-settings";
import { createOllamaAdapter, type OllamaConfig } from "./lib/ollama-adapter";
import { createChatHistoryAdapter } from "./lib/chat-store";
import { createGatewayModelAdapter } from "./lib/agent-transport/gateway-model-adapter";
import { createGatewayAttachmentAdapter } from "./lib/attachments/gateway-attachment-adapter";
import { Sun, Moon, PanelLeft } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

// When enabled (default), chat runs through the self-hosted gateway (apps/api):
// multi-model agent + server-side file/audio processing. Set VITE_USE_GATEWAY
// to "false" to fall back to the direct browser→Ollama path.
const USE_GATEWAY = import.meta.env.VITE_USE_GATEWAY !== "false";


/*

Available OLLAMA model list
NAME                       ID              SIZE      MODIFIED    
deepseek-r1:latest         6995872bfe4c    5.2 GB    4 weeks ago    
nemotron3:33b              f6d8b7ff496c    27 GB     5 weeks ago    
nomic-embed-text:latest    0a109f422b47    274 MB    5 weeks ago    
gemma4:31b                 6316f0629137    19 GB     6 weeks ago    
gemma4:latest              c6eb396dbd59    9.6 GB    6 weeks ago    
qwen3.6:latest             07d35212591f    23 GB     6 weeks ago  

*/

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "nemotron-3-super:latest",
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { dark, toggle } = useTheme();

  // Ollama config — stored in a ref so the adapter always reads the latest
  // value without the runtime needing to be recreated.
  const [config, setConfig] = useState<OllamaConfig>(DEFAULT_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;

  // Model adapter: gateway (multi-model agent + file/audio/vision, via /agent)
  // or the direct browser→Ollama path. Both run on the LOCAL runtime so chat
  // history persists per-thread.
  const ollamaAdapter = useMemo(
    () => createOllamaAdapter(() => configRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const gatewayAdapter = useMemo(() => createGatewayModelAdapter(), []);
  const modelAdapter = USE_GATEWAY ? gatewayAdapter : ollamaAdapter;

  // Attachments upload to the gateway; the gateway resolves them at run time.
  const attachments = useMemo(() => createGatewayAttachmentAdapter(), []);

  // Persisted multi-conversation runtime. The thread list + per-thread message
  // history are stored via the IndexedDB chat-store adapter, so "new chat"
  // keeps prior chats and switching reloads their history (and it survives
  // refresh).
  const chatHistoryAdapter = useMemo(() => createChatHistoryAdapter(), []);
  const runtime = useRemoteThreadListRuntime({
    adapter: chatHistoryAdapter,
    runtimeHook: () =>
      useLocalRuntime(modelAdapter, { adapters: { attachments } }),
  });

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
          <ChatSidebar />
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
