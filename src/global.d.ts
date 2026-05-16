/// <reference types="@solidjs/start/env" />

declare module "*.svg?url" {
  const src: string;
  export default src;
}
