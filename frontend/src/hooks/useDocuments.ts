import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "../lib/axios"

export interface Document {
  doc_id: string
  file_name: string
}

export const DOCUMENTS_KEY = ["documents"]

export function useDocuments() {
  return useQuery<Document[]>({
    queryKey: DOCUMENTS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/documents/")
      return data
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (docId: string) => {
      await api.delete(`/documents/${docId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
    },
  })
}
