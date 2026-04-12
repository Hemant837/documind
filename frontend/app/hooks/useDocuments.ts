// hooks/useDocuments.ts
// ----------------------
// Fetches the list of uploaded documents from GET /documents.
// Refetched automatically after every successful upload.

import { useQuery } from "@tanstack/react-query";
import api from "../lib/axios";

export interface Document {
  doc_id: string;
  file_name: string;
}

export const DOCUMENTS_KEY = ["documents"];

export function useDocuments() {
  return useQuery<Document[]>({
    queryKey: DOCUMENTS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/documents/");
      return data;
    },
  });
}
