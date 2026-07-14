const capitalGainsForm = document.getElementById("capitalGainsForm");
const capitalGainsMessage = document.getElementById("capitalGainsMessage");

capitalGainsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  capitalGainsMessage.textContent = "";

  const proceeds = Velzarytha.readNumber("saleProceeds");
  const basis = Velzarytha.readNumber("costBasis");
  const adjustments = Math.max(0, Velzarytha.readNumber("improvements"));
  const expenses = Math.max(0, Velzarytha.readNumber("sellingExpenses"));
  const rate = Velzarytha.readNumber("gainTaxRate");
  const holding = document.getElementById("holdingPeriod").value;

  if (proceeds < 0 || basis < 0 || rate < 0 || rate > 100) {
    capitalGainsMessage.textContent = "Enter non-negative amounts and an estimated tax rate from 0 to 100.";
    return;
  }

  const adjustedBasis = basis + adjustments;
  const netProceeds = proceeds - expenses;
  const gain = netProceeds - adjustedBasis;
  const tax = gain > 0 ? gain * (rate / 100) : 0;

  document.getElementById("adjustedBasis").textContent = Velzarytha.money(adjustedBasis);
  document.getElementById("netProceeds").textContent = Velzarytha.money(netProceeds);
  document.getElementById("gainLoss").textContent = Velzarytha.money(gain);
  document.getElementById("estimatedGainTax").textContent = Velzarytha.money(tax);
  document.getElementById("holdingPeriodResult").textContent = holding;
  Velzarytha.showResult("capitalGainsEmpty", "capitalGainsContent");
});

capitalGainsForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    capitalGainsMessage.textContent = "";
    Velzarytha.resetResult("capitalGainsEmpty", "capitalGainsContent");
  }, 0);
});
