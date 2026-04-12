// hooks/useUpload.ts
// -------------------
// Uploads a PDF to POST /upload and invalidates the documents query
// so the sidebar refreshes automatically after a successful upload.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "../lib/axios";
import { DOCUMENTS_KEY } from "./useDocuments";

export interface UploadResponse {
  message: string;
  filename: string;
  doc_id: string;
}

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation<UploadResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
      toast.success("Document uploaded", {
        description: `"${data.filename}" is ready to query.`,
      });
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      toast.error("Upload failed", {
        description: detail ?? "Something went wrong. Please try again.",
      });
    },
  });
}
