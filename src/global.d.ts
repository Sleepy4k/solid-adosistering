/// <reference types="@solidjs/start/env" />

declare module "*.svg?url" {
  const src: string;
  export default src;
}

declare global {
  namespace App {
    interface RequestEventLocals {
      nonce?: string;
      requestId?: string;
    }
  }
}

export {};
