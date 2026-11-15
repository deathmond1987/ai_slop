export type TauriInvoke = (command: string, payload?: Record<string, unknown>) => Promise<unknown>;

export interface TauriGlobal {
  shell?: {
    open?: (path: string) => Promise<unknown>;
  };
  core?: {
    invoke?: TauriInvoke;
  };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}
