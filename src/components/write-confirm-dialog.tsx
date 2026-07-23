import { useRef } from "react";

import { ProdBadge } from "@/components/prod-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WriteConfirmDialogProps = {
  open: boolean;
  sql: string;
  reason?: string;
  isProduction?: boolean;
  adminWritesUnlocked?: boolean;
  onApprove: () => void;
  onReject: () => void;
};

/** Shared HITL gate for mutating SQL (agent + SQL editor). */
export function WriteConfirmDialog({
  open,
  sql,
  reason,
  isProduction,
  adminWritesUnlocked,
  onApprove,
  onReject,
}: WriteConfirmDialogProps) {
  const outcome = useRef<"approve" | "reject" | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          outcome.current = null;
          return;
        }
        // Closing after Approve should not also reject.
        if (outcome.current === "approve") {
          outcome.current = null;
          return;
        }
        outcome.current = null;
        onReject();
      }}
    >
      <DialogContent className="gap-3 p-4 sm:max-w-md">
        <DialogHeader className="gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base">
              {isProduction
                ? "Approve production write"
                : "Confirm mutating SQL"}
            </DialogTitle>
            {isProduction && <ProdBadge unlocked={!!adminWritesUnlocked} />}
          </div>
          {reason && (
            <p className="text-[12px] text-muted-foreground text-pretty">
              {reason}
            </p>
          )}
        </DialogHeader>

        {isProduction && (
          <div className="rounded-md border border-prod/30 bg-prod-muted px-2.5 py-2 text-[11px] leading-snug text-prod text-pretty">
            {adminWritesUnlocked
              ? "Admin unlock is on. This statement still needs your explicit approval before it runs."
              : "Production is locked. Approving runs this statement only; the connection stays read-only afterward."}
          </div>
        )}

        <pre className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">
          {sql}
        </pre>

        <DialogFooter>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              outcome.current = "reject";
              onReject();
            }}
          >
            Reject
          </Button>
          <Button
            size="xs"
            variant={isProduction ? "destructive" : "default"}
            className={
              isProduction
                ? "bg-prod text-white hover:bg-prod/90 focus-visible:ring-prod/30"
                : undefined
            }
            onClick={() => {
              outcome.current = "approve";
              onApprove();
            }}
          >
            {isProduction ? "Approve & run" : "Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
