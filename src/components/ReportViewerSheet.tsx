import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Link2, Mail, Loader2, Check, Printer, FileDown, AlertTriangle, RefreshCw, X } from "lucide-react";
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

const REPORT_TITLE = "AI Doctor Health Report";
const SHARE_TTL_DAYS = 30;

/**
 * Mobile-optimized in-app report viewer.
 *  - Preview: sandboxed iframe rendering the exact same HTML report.
 *  - Save as PDF: direct .pdf download via html2pdf.js (no print dialog).
 *  - Print: triggers iframe print() with print-CSS for correct margins/scale.
 *  - Download HTML, Copy share link (with confirmation), Email report.
 */
export default function ReportViewerSheet({ open, onOpenChange, input, userId, userEmail }: Props) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | "copy" | "email">(null);
  const [actionError, setActionError] = useState<null | { action: "pdf" | "print"; message: string }>(null);

  // Report HTML — extend with print-friendly CSS so iframe printing
  // matches the HTML download exactly (margins + scaling).
  const html = useMemo(() => {
    if (!input) return "";
    try {
      const base = generateAIDoctorReportHtml(input);
      const printCss = `
        <style>
          @page { size: A4; margin: 14mm; }
          @media print {
            html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-before: always; }
          }
        </style>`;
      return base.includes("</head>")
        ? base.replace("</head>", `${printCss}</head>`)
        : printCss + base;
    } catch { return ""; }
  }, [input]);

  const expiresAt = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + SHARE_TTL_DAYS);
    return d;
  }, [open]);

  useEffect(() => {
    if (!open) { setShareUrl(null); setCopied(false); setConfirm(null); setActionError(null); }
  }, [open]);

  // ---- Direct PDF download (no print dialog) ----
  const handlePdfDownload = async () => {
    setActionError(null);
    if (!html) {
      setActionError({ action: "pdf", message: "Preview isn't ready yet — wait a moment and retry." });
      return;
    }
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      // Render into an off-screen container so html2pdf can rasterize
      // the actual styled DOM (iframes can't be captured cross-doc).
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.width = "794px"; // ~A4 width @ 96dpi
      container.style.background = "#ffffff";
      container.innerHTML = html;
      document.body.appendChild(container);
      try {
        await html2pdf()
          .set({
            margin: [10, 10, 12, 10],
            filename: `vitalis-ai-doctor-report-${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: "jpeg", quality: 0.96 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["css", "legacy"] },
          } as any)
          .from(container)
          .save();
        toast({ title: "PDF downloaded", description: "Saved to your downloads folder." });
      } finally {
        container.remove();
      }
    } catch (e: any) {
      setActionError({
        action: "pdf",
        message: e?.message || "Could not generate the PDF. Try Print or HTML instead.",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  // ---- Print (uses iframe.print() with proper CSS) ----
  const handlePrint = () => {
    setActionError(null);
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setActionError({ action: "print", message: "Preview isn't ready yet — wait a moment and retry." });
      return;
    }
    try {
      win.focus();
      win.print();
    } catch (e: any) {
      setActionError({ action: "print", message: e?.message || "Could not open the print dialog. Try Save as PDF instead." });
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
        .insert({ user_id: userId, html, title: REPORT_TITLE })
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

  // Confirmation flow before creating + sharing/emailing.
  const requestShare = (mode: "copy" | "email") => setConfirm(mode);

  const performShare = async () => {
    const mode = confirm;
    setConfirm(null);
    if (!mode) return;
    const url = await ensureShareUrl();
    if (!url) return;

    // Single combined flow: ALWAYS copy first, then for "email" also open the
    // composer with the link pre-filled. This way the user has a fallback if
    // the mailto handler doesn't open or strips the body.
    let copiedOk = false;
    try {
      await navigator.clipboard.writeText(url);
      copiedOk = true;
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked — fall back to manual copy prompt for "copy" mode.
      if (mode === "copy") window.prompt("Copy this link:", url);
    }

    if (mode === "copy") {
      toast({
        title: copiedOk ? "Link copied" : "Link ready",
        description: `Expires ${expiresAt.toLocaleDateString()}.`,
      });
      return;
    }

    // Email mode: link is now on the clipboard, open composer with it pre-filled.
    const subject = encodeURIComponent(`My Vitalis ${REPORT_TITLE}`);
    const body = encodeURIComponent(
      `Hi,\n\nHere is my latest ${REPORT_TITLE}:\n${url}\n\n(Link expires ${expiresAt.toLocaleDateString()}.)\n`
    );
    const to = userEmail ? encodeURIComponent(userEmail) : "";
    toast({
      title: copiedOk ? "Link copied — opening email" : "Opening email",
      description: copiedOk ? "Paste it anywhere if your email app doesn't fill it in." : undefined,
    });
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92vh] p-0 flex flex-col bg-background border-t border-border/60 rounded-t-3xl"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-primary" />
              {REPORT_TITLE}
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground">
              Preview, share, or download — without leaving the app.
            </p>
          </SheetHeader>

          {/* Action bar */}
          <div className="px-4 pb-3 grid grid-cols-2 gap-2">
            <Button onClick={handlePdfDownload} disabled={pdfBusy} className="h-10 text-xs font-semibold gap-1.5">
              {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {pdfBusy ? "Generating…" : "Save as PDF"}
            </Button>
            <Button onClick={handlePrint} variant="secondary" className="h-10 text-xs font-semibold gap-1.5">
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <Button onClick={handleHtml} variant="outline" className="h-10 text-xs font-semibold gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Download HTML
            </Button>
            <Button onClick={() => requestShare("copy")} variant="outline" disabled={shareBusy} className="h-10 text-xs font-semibold gap-1.5">
              {shareBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> :
                <Link2 className="w-3.5 h-3.5" />}
              {copied ? "Link copied" : "Copy share link"}
            </Button>
            <Button onClick={() => requestShare("email")} variant="outline" disabled={shareBusy} className="h-10 text-xs font-semibold gap-1.5 col-span-2">
              <Mail className="w-3.5 h-3.5" />
              Email report
            </Button>
          </div>

          {shareUrl && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40 text-[11px] text-muted-foreground break-all">
              <span className="text-foreground font-medium">Share link:</span> {shareUrl}
              <div className="text-[10px] mt-0.5 text-muted-foreground/80">
                Expires {expiresAt.toLocaleDateString()}
              </div>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="mx-4 mb-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-destructive">
                  {actionError.action === "pdf" ? "PDF download failed" : "Print failed"}
                </div>
                <div className="text-[11px] text-muted-foreground break-words">{actionError.message}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] gap-1"
                onClick={() => actionError.action === "pdf" ? handlePdfDownload() : handlePrint()}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setActionError(null)}
                aria-label="Dismiss"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Preview */}
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

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "email" ? "Email this report?" : "Create share link?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-foreground font-medium">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    {REPORT_TITLE}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Expires {expiresAt.toLocaleDateString()} ({SHARE_TTL_DAYS} days)
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Anyone with the link will be able to view this report until it expires.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performShare}>
              {confirm === "email" ? "Continue to email" : "Create & copy link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
