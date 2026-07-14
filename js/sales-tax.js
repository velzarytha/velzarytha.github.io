const salesTaxForm = document.getElementById("salesTaxForm");
const salesTaxMessage = document.getElementById("salesTaxMessage");

salesTaxForm.addEventListener("submit", (event) => {
  event.preventDefault();
  salesTaxMessage.textContent = "";

  const subtotal = Velzarytha.readNumber("subtotal");
  const rate = Velzarytha.readNumber("taxRate");
  const discount = Math.max(0, Velzarytha.readNumber("discount"));
  const shipping = Math.max(0, Velzarytha.readNumber("shipping"));
  const taxShipping = document.getElementById("taxShipping").checked;

  if (subtotal < 0 || rate < 0 || rate > 100) {
    salesTaxMessage.textContent = "Enter a non-negative subtotal and a tax rate from 0 to 100.";
    return;
  }

  const discountedItems = Math.max(0, subtotal - discount);
  const taxable = discountedItems + (taxShipping ? shipping : 0);
  const tax = taxable * (rate / 100);
  const total = discountedItems + shipping + tax;

  document.getElementById("taxableAmount").textContent = Velzarytha.money(taxable);
  document.getElementById("salesTaxAmount").textContent = Velzarytha.money(tax);
  document.getElementById("shippingResult").textContent = Velzarytha.money(shipping);
  document.getElementById("finalTotal").textContent = Velzarytha.money(total);
  Velzarytha.showResult("salesTaxEmpty", "salesTaxContent");
});

salesTaxForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    salesTaxMessage.textContent = "";
    Velzarytha.resetResult("salesTaxEmpty", "salesTaxContent");
  }, 0);
});
