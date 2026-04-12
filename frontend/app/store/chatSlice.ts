// store/chatSlice.ts
// ------------------
// Global state for the chat session.
//
// Why Redux here instead of local state?
//   - session_id needs to be shared between ChatInput (sends it) and
//     SessionList (highlights the active session)
//   - selectedDocIds needs to be shared between DocumentList (sets it)
//     and ChatInput (sends it with every question)
//   - Lifting this to a common parent would mean prop-drilling through
//     multiple layout levels — RTK is cleaner

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ChatState {
  sessionId: string; // current active conversation ID
  selectedDocIds: string[]; // doc_ids to scope queries to (empty = all)
}

// Generate a fresh UUID for the initial session on first load.
// crypto.randomUUID() is available in all modern browsers and Node 18+.
const initialState: ChatState = {
  sessionId: crypto.randomUUID(),
  selectedDocIds: [],
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    // Start a brand-new conversation — called when user clicks "New Chat"
    newSession(state) {
      state.sessionId = crypto.randomUUID();
    },

    // Restore a past conversation — called when user clicks a session in the sidebar
    setSession(state, action: PayloadAction<string>) {
      state.sessionId = action.payload;
    },

    // Toggle a document's inclusion in the query scope
    toggleDocId(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedDocIds.includes(id)) {
        state.selectedDocIds = state.selectedDocIds.filter((d) => d !== id);
      } else {
        state.selectedDocIds.push(id);
      }
    },

    // Clear all selected docs (search across everything)
    clearDocIds(state) {
      state.selectedDocIds = [];
    },
  },
});

export const { newSession, setSession, toggleDocId, clearDocIds } =
  chatSlice.actions;
export default chatSlice.reducer;
