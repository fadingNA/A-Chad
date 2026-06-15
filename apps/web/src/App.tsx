import { useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  useThreadListItem,
} from "@assistant-ui/react";
import { ChatSidebar } from "./components/chat-sidebar";
import { Thread } from "./components/assistant/thread";
import { createOllamaAdapter, type OllamaConfig } from "./lib/ollama-adapter";
import { createChatHistoryAdapter } from "./lib/chat-store";
import { createGatewayModelAdapter } from "./lib/agent-transport/gateway-model-adapter";
import { createGatewayAttachmentAdapter } from "./lib/attachments/gateway-attachment-adapter";
import { PanelLeft } from "lucide-react";
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
  model: "gemma4:26b",
};

/** Shows the active conversation's title at the top-left of the chat area. */
function ThreadTitle() {
  const title = useThreadListItem({
    optional: true,
    selector: (i) => i.title,
  });
  return (
    <span className="truncate text-sm font-medium text-foreground/80">
      {title || "New chat"}
    </span>
  );
}

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
  const gatewayAdapter = useMemo(
    () => createGatewayModelAdapter(() => configRef.current.model),
    []
  );
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
          <ChatSidebar
            config={config}
            onConfigChange={setConfig}
            dark={dark}
            onToggleTheme={toggle}
            onToggleSidebar={() => setSidebarOpen((s) => !s)}
          />
        </div>

        {/* Main area */}
        <div className="relative flex min-w-0 flex-1 flex-col border-l border-border">
          {/* Compact title row: shows the active chat name (and a toggle when
              the sidebar is collapsed) so users know which history is open. */}
          <div className="flex h-10 shrink-0 items-center gap-2 px-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Open sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
            <ThreadTitle />
          </div>

          {/* Thread */}
          <main className="flex min-h-0 flex-1">
            <Thread config={config} onChange={setConfig} />
          </main>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

export function App() {
  return <ChatApp />;
}
