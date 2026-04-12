"use client";
// components/DocumentList.tsx
// ----------------------------
// Shows uploaded documents as a checkable list.
// Checking a document adds it to selectedDocIds in Redux — the chat will
// then scope queries to only those documents.
// Unchecking all = search across everything.

import { useRef } from "react";
import { FileText, Upload, Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useDocuments } from "../hooks/useDocuments";
import { useUpload } from "../hooks/useUpload";
import { useAppDispatch, useAppSelector } from "../store";
import { toggleDocId } from "../store/chatSlice";
import { cn } from "@/lib/utils";

export function DocumentList() {
  const dispatch = useAppDispatch();
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds);
  const { data: documents, isLoading } = useDocuments();
  const upload = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Documents
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-neutral-400 hover:text-neutral-700"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          title="Upload PDF"
        >
          {upload.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload error */}
      {upload.isError && (
        <p className="px-2 text-xs text-red-500">
          Upload failed. Please try again.
        </p>
      )}

      {/* Document list */}
      {isLoading ? (
        <p className="px-2 text-xs text-neutral-400">Loading...</p>
      ) : !documents?.length ? (
        <p className="px-2 text-xs text-neutral-400">No documents yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {documents.map((doc) => {
            const checked = selectedDocIds.includes(doc.doc_id);
            return (
              <li key={doc.doc_id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    checked
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => dispatch(toggleDocId(doc.doc_id))}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span className="truncate text-xs">{doc.file_name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* Scope indicator */}
      {!!selectedDocIds.length && (
        <p className="px-2 text-xs text-blue-500">
          Querying {selectedDocIds.length} selected doc
          {selectedDocIds.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
