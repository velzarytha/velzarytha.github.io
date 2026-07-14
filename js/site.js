document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const menuButton = document.querySelector("#menuButton");
const mainNav = document.querySelector("#mainNav");

if (menuButton && mainNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
}

window.Velzarytha = {
  money(value) {
    const number = Number(value);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(Number.isFinite(number) ? number : 0);
  },
  number(value, digits = 2) {
    const number = Number(value);
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: digits
    }).format(Number.isFinite(number) ? number : 0);
  },
  readNumber(id) {
    const element = document.getElementById(id);
    return element ? Number(element.value || 0) : 0;
  },
  showResult(emptyId, contentId) {
    const empty = document.getElementById(emptyId);
    const content = document.getElementById(contentId);
    if (empty) empty.hidden = true;
    if (content) content.hidden = false;
  },
  resetResult(emptyId, contentId) {
    const empty = document.getElementById(emptyId);
    const content = document.getElementById(contentId);
    if (empty) empty.hidden = false;
    if (content) content.hidden = true;
  }
};
