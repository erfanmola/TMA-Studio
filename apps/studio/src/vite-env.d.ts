/// <reference types="vite/client" />
interface Window {
  __bunium?: {
    send(name: string, payload: string): void;
    on(name: string, listener: (payload: unknown) => void): void;
    off?(name: string, listener: (payload: unknown) => void): void;
  };
}
