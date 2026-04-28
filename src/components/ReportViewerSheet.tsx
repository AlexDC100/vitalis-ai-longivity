import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Link2, Mail, Loader2, Check, Printer } from "lucide-react";
import {
  generateAIDoctorReportHtml,
  downloadAIDoctorReport,
  type AIDoctorReportInput,
} from "@/lib/ai-doctor-report";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  input: AIDoctorReportInput | null;
  userId?: string | null;
  userEmail?: string | null;
}

/**
 * Mobile-optimized in-app report viewer.
 *  - Renders the exact same HTML report inside a sandboxed iframe so the
 *    user can preview without leaving the screen.
 *  - Actions: one-tap PDF (uses iframe.print() so the OS save-as-PDF
 *    dialog appears), HTML download, Share link (creates a token row in
 *    `shared_health_reports`), Email (mailto with link).
 */
export default function ReportViewerSheet({ open, onOpenChange, input, userId, userEmail }: Props) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!input) return "";
    try { return generateAIDoctorReportHtml(input); } catch { return ""; }
  }, [input]);

  useEffect(() => {
    if (!open) { setShareUrl(null); setCopied(false); }
  }, [open]);

  const handlePdf = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      toast({ title: "Preview not ready", description: "Please wait a moment and try again.", variant: "destructive" });
      return;
    }
    try {
      win.focus();
      win.print();
      toast({ title: "Save as PDF", description: "Choose 'Save as PDF' in the print dialog." });
    } catch (e: any) {
      toast({ title: "Could not open print dialog", description: e?.message || "Try downloading the HTML instead.", variant: "destructive" });
    }
  };

  const handleHtml = () => {
    if (!input) return;
    downloadAIDoctorReport(input);
    toast({ title: "Report downloaded", description: "Saved as an HTML file." });
  };

  const ensureShareUrl = async (): Promise<string | null> => {
    if (shareUrl) return shareUrl;
    if (!userId || !html) {
      toast({ title: "Sign in required", description: "Please sign in to create a shareable link.", variant: "destructive" });
      return null;
    }
    setShareBusy(true);
    try {
      const { data, error } = await supabase
        .from("shared_health_reports")
        .insert({ user_id: userId, html, title: "AI Doctor Report" })
        .select("share_token")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not create share link");
      const url = `${window.location.origin}/r/${encodeURIComponent(data.share_token)}`;
      setShareUrl(url);
      return url;
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message || "Please try again.", variant: "destructive" });
      return null;
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyLink = async () => {
    const url = await ensureShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", description: "Share it with anyone — link expires in 30 days." });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback: show URL via prompt
      window.prompt("Copy this link:", url);
    }
  };

  const handleEmail = async () => {
    const url = await ensureShareUrl();
    if (!url) return;
    const subject = encodeURIComponent("My Vitalis AI Doctor health report");
    const body = encodeURIComponent(
      `Hi,\n\nHere is my latest AI Doctor health report:\n${url}\n\n(Link expires in 30 days.)\n`
    );
    const to = userEmail ? encodeURIComponent(userEmail) : "";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] p-0 flex flex-col bg-background border-t border-border/60 rounded-t-3xl"
      >
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-primary" />
            AI Doctor Health Report
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            Preview, share, or download — without leaving the app.
          </p>
        </SheetHeader>

        {/* Action bar */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          <Button
            onClick={handlePdf}
            className="h-10 text-xs font-semibold gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Save as PDF
          </Button>
          <Button
            onClick={handleHtml}
            variant="secondary"
            className="h-10 text-xs font-semibold gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download HTML
          </Button>
          <Button
            onClick={handleCopyLink}
            variant="outline"
            disabled={shareBusy}
            className="h-10 text-xs font-semibold gap-1.5"
          >
            {shareBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
              copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> :
              <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Link copied" : "Copy share link"}
          </Button>
          <Button
            onClick={handleEmail}
            variant="outline"
            disabled={shareBusy}
            className="h-10 text-xs font-semibold gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            Email report
          </Button>
        </div>

        {shareUrl && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40 text-[11px] text-muted-foreground break-all">
            <span className="text-foreground font-medium">Share link:</span> {shareUrl}
          </div>
        )}

        {/* Preview — keeps the exact report design */}
        <div className="flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-border/40 bg-[#0a0a0b]">
          {html ? (
            <iframe
              ref={iframeRef}
              title="AI Doctor report preview"
              srcDoc={html}
              sandbox="allow-same-origin allow-modals"
              className="w-full h-full border-0 block"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Generating report…
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}