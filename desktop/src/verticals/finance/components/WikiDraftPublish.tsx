import { useState } from "react";
import { FileText } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { KnowledgeText } from "./WikiReport";
import { publishWikiDraft, researchRead, type WikiDraft } from "../lib/research";

export function WikiDraftPublish({
  draftToken,
  onPublished,
}: {
  draftToken: string;
  onPublished?: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [preview, setPreview] = useState<WikiDraft | null>(null);
  const review = async () => {
    setBusy(`review:${draftToken}`);
    setError("");
    try {
      const draft = await researchRead<WikiDraft>(`/wiki/page-drafts/${encodeURIComponent(draftToken)}`);
      if (!draft.specs?.length || draft.previews?.length !== draft.specs.length) throw new Error("草案正文暂不可读，请重试");
      setPreview(draft);
      setReviewed(draftToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审阅失败");
    } finally { setBusy(""); }
  };
  const publish = async () => {
    if (reviewed !== draftToken || preview?.draft_token !== draftToken) {
      setError("请先审阅这条草案的正文，再确认发布");
      return;
    }
    setBusy(draftToken);
    setError("");
    try {
      const result = await publishWikiDraft(draftToken);
      if (!result.published) throw new Error("发布未完成");
      if (result.association_error) throw new Error(result.association_error);
      setPreview(null);
      setReviewed("");
      onPublished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally { setBusy(""); }
  };
  return <div className="mt-3 space-y-3">
    <div className="flex flex-wrap gap-2">
      <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void review()}>
        <FileText className="h-3.5 w-3.5" />{reviewed === draftToken ? "已审阅" : "审阅草案"}
      </button>
      <button type="button" className="workspace-field-action" disabled={!!busy || reviewed !== draftToken} onClick={() => void publish()}>
        {busy === draftToken ? "发布中…" : "确认发布"}
      </button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {preview && <div className="space-y-3">
      <p className="text-xs text-muted-foreground">草案 · 请先阅读正文，确认后发布到研究页。</p>
      {preview.previews?.map(item => <GlassCard key={item.slug}><KnowledgeText markdown={item.markdown} /></GlassCard>)}
    </div>}
  </div>;
}
