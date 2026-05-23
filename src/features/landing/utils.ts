export function scrollToId(id: string) {
  const target = document.querySelector(id);
  if (!target) return;

  const header = document.querySelector("header");
  const headerOffset = header instanceof HTMLElement ? header.offsetHeight : 0;
  const elementPosition = target.getBoundingClientRect().top + window.scrollY;

  window.scrollTo({
    top: elementPosition - headerOffset,
    behavior: "smooth",
  });

  history.pushState(null, "", id);
}
