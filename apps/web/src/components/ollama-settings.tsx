import { useEffect, useRef, useState } from "react";
import { Settings2, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { fetchOllamaModels, pingOllama, type OllamaConfig } from "@/lib/ollama-adapter";

type ConnectionStatus = "idle" | "checking" | "connected" | "error";

interface OllamaSettingsProps {
  config: OllamaConfig;
  onChange: (config: OllamaConfig) => void;
}

export function OllamaSettings({ config, onChange }: OllamaSettingsProps) {
  const [open, setOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState(config.baseUrl);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const checkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkConnection = async (url: string) => {
    setStatus("checking");
    setErrorMsg("");
    setModels([]);
    try {
      const ok = await pingOllama(url);
      if (!ok) throw new Error("Ollama not reachable");
      const list = await fetchOllamaModels(url);
      setModels(list.map((m) => m.name));
      setStatus("connected");
      // Auto-select first model if current model not in list
      if (list.length && !list.find((m) => m.name === config.model)) {
        onChange({ baseUrl: url, model: list[0].name });
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  };

  // Debounce URL changes
  useEffect(() => {
    if (checkRef.current) clearTimeout(checkRef.current);
    checkRef.current = setTimeout(() => {
      if (urlDraft) checkConnection(urlDraft);
    }, 600);
    return () => {
      if (checkRef.current) clearTimeout(checkRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDraft]);

  // Check on open
  useEffect(() => {
    if (open) checkConnection(config.baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const statusIcon = {
    idle: null,
    checking: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
    connected: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  }[status];

  const badgeVariant =
    status === "connected" ? "default" : status === "error" ? "destructive" : "secondary";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Ollama settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ollama</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "connected" && "bg-green-500",
              status === "error" && "bg-destructive",
              (status === "idle" || status === "checking") && "bg-muted-foreground/50"
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="end">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Ollama Connection</p>
            <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
              {status === "checking" ? "Checking…" :
               status === "connected" ? "Connected" :
               status === "error" ? "Error" : "Idle"}
            </Badge>
          </div>

          {/* URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Server URL</label>
            <div className="flex gap-1.5">
              <Input
                value={urlDraft}
                onChange={(e) => {
                  setUrlDraft(e.target.value);
                  onChange({ ...config, baseUrl: e.target.value });
                }}
                placeholder="http://localhost:11434"
                className="h-8 text-xs"
              />
              <button
                onClick={() => checkConnection(urlDraft)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input hover:bg-muted transition-colors"
                title="Re-check connection"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", status === "checking" && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Model picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            {status === "connected" && models.length > 0 ? (
              <Select
                value={config.model}
                onValueChange={(model) => onChange({ ...config, baseUrl: urlDraft, model })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={config.model}
                onChange={(e) => onChange({ ...config, model: e.target.value })}
                placeholder="e.g. llama3.2"
                className="h-8 text-xs"
              />
            )}
          </div>

          {/* Status messages */}
          {status === "error" && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="font-medium">Cannot connect</p>
              <p className="mt-0.5 text-destructive/80">{errorMsg}</p>
            </div>
          )}

          {status === "connected" && models.length === 0 && (
            <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              No models found. Run <code className="font-mono">ollama pull llama3.2</code> to get started.
            </div>
          )}

          {/* Help */}
          {status !== "connected" && (
            <p className="text-[11px] text-muted-foreground">
              Make sure Ollama is running locally.{" "}
              <code className="font-mono">ollama serve</code>
            </p>
          )}

          {status === "checking" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {statusIcon}
              Connecting to Ollama…
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
