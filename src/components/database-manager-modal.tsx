"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  CircleCheck,
  Download,
  FileDown,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { downloadExcelTemplate, exportDatasetToExcel } from "@/lib/excel/excelGenerator";
import { outcomeToDataset, parseExcelFile, type ParseOutcome } from "@/lib/excel/excelParser";
import type { Dataset } from "@/lib/game/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Phase = "idle" | "parsing" | "parsed" | "importing";

interface DatabaseManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active in-game dataset used for "Export Active Database"; if null the export button is disabled with a hint. */
  currentDataset?: Dataset | null;
  /** Called after a successful import (dataset parsed from the Excel file). Parent persists to IndexedDB. */
  onImportComplete?: (dataset: Dataset) => void;
}

export function DatabaseManagerModal({
  open,
  onOpenChange,
  currentDataset = null,
  onImportComplete,
}: DatabaseManagerModalProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setOutcome(null);
    setFileName(null);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // Reset the import workflow whenever the dialog closes (X, overlay, Esc or
  // parent-driven close). The setState call runs in a timeout callback — not
  // synchronously in the effect — to avoid cascading renders.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => reset(), 0);
    return () => window.clearTimeout(timer);
  }, [open, reset]);

  const handleTemplateDownload = () => {
    try {
      downloadExcelTemplate();
      toast({
        title: "Template downloaded",
        description: "Fill the Leagues, Teams and Players sheets, then import the file back in-game.",
      });
    } catch {
      toast({
        title: "Download failed",
        description: "The Excel template could not be generated.",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (!currentDataset) return;
    try {
      exportDatasetToExcel(currentDataset);
      toast({
        title: "Export ready",
        description: "Your active database was exported as an .xlsx workbook.",
      });
    } catch {
      toast({
        title: "Export failed",
        description: "The active database could not be exported.",
        variant: "destructive",
      });
    }
  };

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setFileName(file.name);
      setOutcome(null);
      setPhase("parsing");
      setProgress(30);
      try {
        const result = await parseExcelFile(file);
        setOutcome(result);
        setPhase("parsed");
      } catch {
        toast({
          title: "Could not read file",
          description: "The file is corrupt or not a valid Excel workbook.",
          variant: "destructive",
        });
        setPhase("idle");
        setProgress(0);
        setFileName(null);
      }
    },
    [toast],
  );

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const hasOutcome = phase === "parsed" || phase === "importing";
  const hasErrors = (outcome?.errors.length ?? 0) > 0;
  // "idle" and "parsing" have no parsed outcome yet, so they are disabled too.
  const importDisabled = !hasOutcome || hasErrors;

  const handleImport = async () => {
    if (!outcome || outcome.errors.length > 0 || phase === "importing" || phase === "parsing") {
      return;
    }
    setPhase("importing");
    setProgress(50);
    const dataset = outcomeToDataset(outcome);
    let cloudOk = false;
    try {
      const response = await fetch("/api/database/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagues: dataset.leagues,
          teams: dataset.teams,
          players: dataset.players,
        }),
      });
      cloudOk = response.ok;
    } catch {
      cloudOk = false;
    }

    if (cloudOk) {
      setProgress(100);
      toast({
        title: "Database imported",
        description: `${dataset.leagues.length} leagues, ${dataset.teams.length} teams and ${dataset.players.length} players synced to the cloud database.`,
      });
    } else {
      toast({
        title: "Cloud import failed, data saved on this device only",
        description: `${dataset.leagues.length} leagues, ${dataset.teams.length} teams and ${dataset.players.length} players were kept on this device.`,
        variant: "destructive",
      });
    }
    onImportComplete?.(dataset);
    setPhase("parsed");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85dvh,85vh)] max-w-[440px] overflow-y-auto overscroll-contain touch-scroll sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Database Manager</DialogTitle>
          <DialogDescription>
            Import, export and template tools for the Quattrick player database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="size-4 text-emerald-400" />
                Excel Template
              </CardTitle>
              <CardDescription>
                Download the official workbook with format instructions, then fill it
                with your own leagues, teams and players.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <Button onClick={handleTemplateDownload} className="w-full">
                <Download />
                Download Template
              </Button>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileDown className="size-4 text-emerald-400" />
                Export Active Database
              </CardTitle>
              <CardDescription>
                Save the database you are currently playing as an .xlsx file for editing,
                sharing or backup.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4">
              <Button
                onClick={handleExport}
                disabled={!currentDataset}
                className="w-full"
                variant="outline"
              >
                <FileDown />
                Export .xlsx
              </Button>
              {!currentDataset && (
                <p className="text-xs text-muted-foreground">No active database</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="size-4 text-emerald-400" />
                Import Excel Database
              </CardTitle>
              <CardDescription>
                Load a Quattrick .xlsx workbook, review the validation report, then sync it to
                your cloud database.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
                  dragActive
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-border hover:border-emerald-500/50 hover:bg-emerald-500/5",
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    void handleFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <FileSpreadsheet className="size-8 text-emerald-400" />
                <span className="text-sm font-medium">Drag &amp; drop your .xlsx file here</span>
                <span className="text-xs text-muted-foreground">or tap to browse</span>
                {fileName && <span className="mt-1 text-xs text-emerald-400">{fileName}</span>}
              </label>

              {phase !== "idle" && (
                <Progress
                  value={progress}
                  className="[&_[data-slot=progress-indicator]]:bg-emerald-500"
                />
              )}

              {phase === "parsing" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-emerald-400" />
                  Parsing {fileName ?? "workbook"}...
                </div>
              )}

              {hasOutcome && outcome && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                      {outcome.leagues.length} Leagues
                    </Badge>
                    <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                      {outcome.teams.length} Teams
                    </Badge>
                    <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                      {outcome.players.length} Players
                    </Badge>
                    {outcome.warnings.length > 0 && (
                      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-400">
                        <TriangleAlert />
                        {outcome.warnings.length} Warnings
                      </Badge>
                    )}
                    {outcome.errors.length > 0 ? (
                      <Badge variant="destructive">
                        {outcome.errors.length} Errors
                      </Badge>
                    ) : (
                      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                        <CircleCheck />
                        No errors
                      </Badge>
                    )}
                  </div>

                  {outcome.warnings.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-amber-400">
                        Auto-fixed issues ({outcome.warnings.length})
                      </p>
                      <div className="max-h-32 overflow-y-auto overscroll-contain rounded-md border bg-muted/30 p-2 touch-scroll">
                        <ul className="space-y-1 text-xs">
                          {outcome.warnings.map((warning, index) => (
                            <li key={index} className="text-amber-400/90">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {outcome.errors.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-destructive">
                        Blocking errors ({outcome.errors.length})
                      </p>
                      <div className="max-h-40 overflow-y-auto overscroll-contain rounded-md border bg-muted/30 p-2 touch-scroll">
                        <ul className="space-y-1 text-xs text-destructive">
                          {outcome.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => void handleImport()}
                    disabled={importDisabled}
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {phase === "importing" ? <Loader2 className="animate-spin" /> : <Upload />}
                    Import to Cloud Database
                  </Button>
                  {hasErrors && (
                    <p className="text-xs text-destructive">
                      Fix the errors above before importing.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DatabaseManagerModal;
