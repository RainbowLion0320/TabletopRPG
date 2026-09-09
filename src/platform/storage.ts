export interface GameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  flush?(): Promise<void>;
}

let nativeStorage: GameStorage | null = null;
export const gameStorage: GameStorage = {
  getItem: (key) => (nativeStorage ?? localStorage).getItem(key),
  setItem: (key, value) => (nativeStorage ?? localStorage).setItem(key, value),
  removeItem: (key) => (nativeStorage ?? localStorage).removeItem(key),
};
export function installGameStorage(storage: GameStorage): void { nativeStorage = storage; }
export const usingNativeStorage = () => nativeStorage !== null;
export async function flushGameStorage(): Promise<void> { await nativeStorage?.flush?.(); }
