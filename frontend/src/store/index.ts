import { configureStore } from "@reduxjs/toolkit"
import {
  type TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from "react-redux"
import chatReducer from "./chatSlice"
import authReducer from "./authSlice"

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
