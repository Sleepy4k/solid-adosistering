import { useIsRouting } from "@solidjs/router";
import { createEffect } from "solid-js";
import { finishProgress, startProgress } from "~/lib/client/progress";

const progressStyles = `
#nprogress {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 100000;
  pointer-events: none;
}
#nprogress .bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px !important;
  background: #16a34a !important;
  z-index: 100000 !important;
}
#nprogress .peg {
  display: block;
  position: absolute;
  right: 0;
  width: 100px;
  height: 100%;
  opacity: 1;
  transform: rotate(3deg) translate(0, -4px);
  box-shadow:
    0 0 10px #16a34a,
    0 0 5px #16a34a;
}
#nprogress .spinner {
  display: block;
  position: fixed;
  top: 15px;
  right: 15px;
  z-index: 100000;
}
#nprogress .spinner-icon {
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border: solid 2px transparent;
  border-top-color: #16a34a;
  border-left-color: #16a34a;
  border-radius: 50%;
  animation: nprogress-spinner 400ms linear infinite;
}
@keyframes nprogress-spinner {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  #nprogress .spinner-icon {
    animation: none;
  }
}
`;

export default function RouterProgress() {
  const isRouting = useIsRouting();

  createEffect(() => {
    if (isRouting()) {
      void startProgress({ immediate: true });
    } else {
      void finishProgress();
    }
  });

  return <style>{progressStyles}</style>;
}
