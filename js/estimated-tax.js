const estimatedTaxForm = document.getElementById("estimatedTaxForm");
const estimatedTaxMessage = document.getElementById("estimatedTaxMessage");

estimatedTaxForm.addEventListener("submit", (event) => {
  event.preventDefault();
  estimatedTaxMessage.textContent = "";

  const income = Velzarytha.readNumber("expectedIncome");
  const deductions = Math.max(0, Velzarytha.readNumber("deductions"));
  const rate = Velzarytha.readNumber("effectiveRate");
  const credits = Math.max(0, Velzarytha.readNumber("taxCredits"));
  const withholding = Math.max(0, Velzarytha.readNumber("withholding"));
  const payments = Math.trunc(Velzarytha.readNumber("paymentsLeft"));

  if (income < 0 || rate < 0 || rate > 100 || payments < 1) {
    estimatedTaxMessage.textContent = "Enter valid non-negative amounts, a rate from 0 to 100, and at least one remaining payment.";
    return;
  }

  const taxable = Math.max(0, income - deductions);
  const taxBeforeCredits = taxable * (rate / 100);
  const taxAfterCredits = Math.max(0, taxBeforeCredits - credits);
  const remaining = Math.max(0, taxAfterCredits - withholding);
  const payment = remaining / payments;

  document.getElementById("projectedTaxable").textContent = Velzarytha.money(taxable);
  document.getElementById("projectedTax").textContent = Velzarytha.money(taxAfterCredits);
  document.getElementById("remainingTax").textContent = Velzarytha.money(remaining);
  document.getElementById("paymentAmount").textContent = Velzarytha.money(payment);
  Velzarytha.showResult("estimatedTaxEmpty", "estimatedTaxContent");
});

estimatedTaxForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    estimatedTaxMessage.textContent = "";
    Velzarytha.resetResult("estimatedTaxEmpty", "estimatedTaxContent");
  }, 0);
});
