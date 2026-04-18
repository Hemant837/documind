import { useRef, useState } from "react"
import { FileText, Upload, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import { useDocuments, useDeleteDocument } from "../../hooks/useDocuments"
import { useUpload } from "../../hooks/useUpload"
import { useAppDispatch, useAppSelector } from "../../store"
import { toggleDocId, removeDocId } from "../../store/chatSlice"
import { cn } from "@/lib/utils"

type PendingDelete = { id: string; name: string }

export function DocumentList() {
  const dispatch = useAppDispatch()
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds)
  const { data: documents, isLoading } = useDocuments()
  const upload = useUpload()
  const deleteDoc = useDeleteDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ""
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const { id, name } = pendingDelete
    setPendingDelete(null)
    deleteDoc.mutate(id, {
      onSuccess: () => {
        dispatch(removeDocId(id))
        toast.success(`"${name}" deleted`)
      },
      onError: () => {
        toast.error("Failed to delete document. Please try again.")
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center justify-between px-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Documents
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
          <p className="px-2 text-xs text-destructive">
            Upload failed. Please try again.
          </p>
        )}

        {/* Document list */}
        {isLoading ? (
          <p className="px-2 text-xs text-muted-foreground">Loading...</p>
        ) : !documents?.length ? (
          <p className="px-2 text-xs text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {documents.map((doc) => {
              const checked = selectedDocIds.includes(doc.doc_id)
              const isDeleting = deleteDoc.isPending && deleteDoc.variables === doc.doc_id

              return (
                <li key={doc.doc_id} className="group relative">
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pl-2 pr-7 text-sm transition-colors",
                      checked
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => dispatch(toggleDocId(doc.doc_id))}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs">{doc.file_name}</span>
                  </label>
                  <button
                    onClick={(e) => { e.preventDefault(); setPendingDelete({ id: doc.doc_id, name: doc.file_name }) }}
                    disabled={isDeleting}
                    title="Delete document"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                  >
                    {isDeleting
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />
                    }
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Scope indicator */}
        {!!selectedDocIds.length && (
          <p className="px-2 text-xs text-primary">
            Querying {selectedDocIds.length} selected doc
            {selectedDocIds.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        onConfirm={confirmDelete}
        title="Delete document?"
        description={
          <>
            <span className="font-medium text-foreground">"{pendingDelete?.name}"</span> will be
            permanently deleted and removed from all future searches.
          </>
        }
      />
    </>
  )
}
