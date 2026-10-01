# UK consumer financial demand cycle: prepared snapshot

## What the signals say

As of 1 October 2026, several high-frequency stress and credit-use signals are
moving up together. StepChange's August advice clients more often report
needing credit for living costs (+3 percentage points year over year), while
credit-card and personal-loan debt among those clients are each up 6 points.
Bank of England consumer-credit borrowing is above its recent average, with
credit-card borrowing growth accelerating.

The realised mortgage-arrears signal is less severe: UK Finance reports
homeowner mortgages at least 2.5% in arrears fell 1% quarter over quarter in
Q2 2026. FCA Financial Lives provides a population baseline, but is slower;
its latest credit-refusal rate was 22% for applicants in the two years to May
2024, down from 24% in 2022.

**Read-through:** stress and credit dependence are rising in recent consumer
signals, while mortgage arrears eased slightly. This is an early warning of
increasing financial pressure and possible demand for solutions, not enough
evidence to assign a formal macro-cycle phase or infer venture returns.
Consumer credit growth alone can reflect access as well as distress.

## Keep three signal types distinct

1. **Structural unmet need:** FCA Financial Lives survey (population-weighted,
   intermittent) and World Bank Global Findex (survey waves).
2. **Current stress / revealed service demand:** StepChange monthly client
   reports. These are people seeking debt advice, not a representative sample
   of UK consumers; read changes directionally and keep the denominator visible.
3. **Broad credit activity and realised arrears:** Bank of England monthly
   Money and Credit and UK Finance quarterly arrears. These describe the
   financial system and mortgage borrowers, not customer demand alone.

Observations and source URLs are in `consumer_demand_signals.csv`. They use
country, period, metric, value, source and unit, with population, frequency
and comparison fields to support interpretation. Run:

```powershell
python .\consumer_demand.py
```

This is a manually curated current snapshot, not an automated scraper. The
next useful step is to import historical Bank of England series and the
StepChange monthly archive, then calculate rolling 3- and 12-month changes
within each series. Keep annual survey and quarterly arrears observations at
their actual frequencies; do not fill gaps as if they were monthly data. Build
a composite only after the historical coverage is normalized and visible.

## Sources

- [FCA Financial Lives 2024](https://www.fca.org.uk/financial-lives/financial-lives-2024)
- [StepChange monthly client data reports](https://www.stepchange.org/policy-and-research/monthly-client-data-reports.aspx)
- [Bank of England Money and Credit, August 2026](https://www.bankofengland.co.uk/statistics/money-and-credit/2026/august-2026)
- [UK Finance arrears and possessions](https://www.ukfinance.org.uk/data-and-research/data/arrears-and-possessions)
