import { useEffect, useState } from "react";
import { Cpu, ChevronsUpDown, Check, Loader2, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { fetchOllamaModels, type OllamaConfig } from "@/lib/ollama-adapter";
import {
  describeModel,
  CATEGORY_ORDER,
  type ModelDescriptor,
} from "@/lib/model-catalog";

interface ModelSelectorProps {
  config: OllamaConfig;
  onChange: (config: OllamaConfig) => void;
}

/** Friendly title for a model id (used for the compact topbar pill). */
function displayName(model: string) {
  return describeModel(model).title;
}

/**
 * Claude-Code-style model picker. Sits beside the Ollama status in the topbar:
 * a compact pill showing the active model that opens a searchable-ish list of
 * everything pulled on the connected Ollama server.
 */
export function ModelSelector({ config, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Refresh the model list whenever the popover opens (or the server changes).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchOllamaModels(config.baseUrl)
      .then((list) => {
        if (!cancelled) setModels(list.map((m) => m.name));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, config.baseUrl]);

  // Describe every pulled model and drop non-chat ones (embeddings).
  const visible = models.map(describeModel).filter((d) => !d.hidden);

  // Featured section: one representative per category (in CATEGORY_ORDER), plus
  // the currently selected model. Everything else falls under "More models".
  const primary: ModelDescriptor[] = [];
  const selected = visible.find((d) => d.id === config.model);
  if (selected) primary.push(selected);
  for (const cat of CATEGORY_ORDER) {
    const d = visible.find((v) => v.category === cat && !primary.includes(v));
    if (d) primary.push(d);
  }
  const more = visible.filter((d) => !primary.includes(d));

  const renderRow = (d: ModelDescriptor) => (
    <button
      key={d.id}
      onClick={() => {
        onChange({ ...config, model: d.id });
        setOpen(false);
      }}
      className={cn(
        "flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
        d.id === config.model && "bg-muted"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{d.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {d.description}
        </span>
      </span>
      {d.id === config.model && (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Select model"
        >
          <Cpu className="h-3.5 w-3.5" />
          <span className="hidden max-w-40 truncate sm:inline">
            {displayName(config.model)}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-1.5" align="end">
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          Model
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading models…
          </div>
        )}

        {!loading && models.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No models found. Is Ollama running?
          </div>
        )}

        {!loading && (
          <div className="max-h-72 overflow-y-auto">
            {primary.map(renderRow)}

            {more.length > 0 && (
              <>
                <button
                  onClick={() => setShowMore((s) => !s)}
                  className="mt-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      showMore && "rotate-90"
                    )}
                  />
                  More models ({more.length})
                </button>
                {showMore && more.map(renderRow)}
              </>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
