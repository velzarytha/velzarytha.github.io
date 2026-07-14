const depreciationForm = document.getElementById("depreciationForm");
const serviceDate = document.getElementById("serviceDate");
const depreciationMessage = document.getElementById("depreciationMessage");

serviceDate.value = new Date().toISOString().slice(0, 10);

depreciationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  depreciationMessage.textContent = "";

  const cost = Velzarytha.readNumber("assetCost");
  const additional = Velzarytha.readNumber("additionalCosts");
  const land = Velzarytha.readNumber("landValue");
  const salvage = Velzarytha.readNumber("salvageValue");
  const businessUse = Velzarytha.readNumber("businessUse");
  const years = Math.trunc(Velzarytha.readNumber("recoveryYears"));
  const dateValue = serviceDate.value;
  const proration = document.getElementById("proration").value;

  if (cost <= 0 || years < 1 || businessUse < 0 || businessUse > 100 || !dateValue) {
    depreciationMessage.textContent = "Enter a positive cost and recovery period, a business-use percentage from 0 to 100, and a service date.";
    return;
  }

  const totalCost = cost + Math.max(0, additional);
  const excluded = Math.max(0, land) + Math.max(0, salvage);

  if (excluded > totalCost) {
    depreciationMessage.textContent = "Land plus salvage value cannot exceed purchase price plus capitalized costs.";
    return;
  }

  const basisBeforeUse = Math.max(0, totalCost - excluded);
  const basis = basisBeforeUse * (businessUse / 100);
  const annual = basis / years;
  const startDate = new Date(`${dateValue}T00:00:00`);
  const startYear = startDate.getFullYear();
  const schedule = [];

  if (proration === "monthly") {
    const firstMonths = 12 - startDate.getMonth();
    const firstAmount = Math.min(basis, annual * (firstMonths / 12));
    let remaining = basis;
    let year = startYear;

    if (firstAmount > 0) {
      schedule.push({ year, amount: firstAmount });
      remaining -= firstAmount;
      year += 1;
    }

    while (remaining > 0.005) {
      const amount = Math.min(annual, remaining);
      schedule.push({ year, amount });
      remaining -= amount;
      year += 1;
    }
  } else {
    for (let index = 0; index < years; index += 1) {
      schedule.push({ year: startYear + index, amount: annual });
    }
  }

  document.getElementById("depreciationTitle").textContent =
    document.getElementById("assetName").value.trim() || "Depreciation results";
  document.getElementById("depreciableBasis").textContent = Velzarytha.money(basis);
  document.getElementById("annualDepreciation").textContent = Velzarytha.money(annual);
  document.getElementById("nonDepreciable").textContent = Velzarytha.money(excluded);
  document.getElementById("businessUseResult").textContent = `${Velzarytha.number(businessUse)}%`;

  const body = document.getElementById("depreciationSchedule");
  body.innerHTML = "";
  let accumulated = 0;

  schedule.forEach((row) => {
    accumulated = Math.min(basis, accumulated + row.amount);
    const ending = Math.max(0, basis - accumulated);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.year}</td><td>${Velzarytha.money(row.amount)}</td><td>${Velzarytha.money(accumulated)}</td><td>${Velzarytha.money(ending)}</td>`;
    body.appendChild(tr);
  });

  Velzarytha.showResult("depreciationEmpty", "depreciationContent");
});

depreciationForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    serviceDate.value = new Date().toISOString().slice(0, 10);
    depreciationMessage.textContent = "";
    Velzarytha.resetResult("depreciationEmpty", "depreciationContent");
  }, 0);
});
