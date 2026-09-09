export type ModelTransport = (url: string, init: RequestInit) => Promise<Response>;
let nativeTransport: ModelTransport | null = null;
export function installModelTransport(transport: ModelTransport): void { nativeTransport = transport; }
export const modelFetch: ModelTransport = (url, init) => nativeTransport ? nativeTransport(url, init) : fetch(url, init);
