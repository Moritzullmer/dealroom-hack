// Public fallback is synthetic. A local ignored Dealroom fixture overrides it.
if (window.REAL_FIXTURE) {
  window.DEMO_FIXTURE = window.REAL_FIXTURE;
} else {
window.DEMO_FIXTURE = {
  asOf: "Illustrative fixture",
  theme: { id: "theme-fi", label: "Financial inclusion" },
  companies: [
    { id: "brightbank", name: "BrightBank", group: "fi", product: "Everyday banking for underserved households", gps: ["gp-common", "gp-orchard"], rounds: [{year:2022, amount:8, valuation:20},{year:2023, amount:20, valuation:80},{year:2024, amount:45, valuation:220},{year:2025, amount:25, valuation:300}] },
    { id: "payspring", name: "PaySpring", group: "fi", product: "Low-cost cross-border payments", gps: ["gp-common"], rounds: [{year:2022, amount:5, valuation:15},{year:2023, amount:15, valuation:45},{year:2025, amount:20, valuation:100}] },
    { id: "niacredit", name: "NiaCredit", group: "fi", product: "Thin-file consumer credit", gps: ["gp-orchard"], rounds: [{year:2023, amount:6, valuation:10},{year:2024, amount:15, valuation:25},{year:2025, amount:20, valuation:60}] },
    { id: "openwallet", name: "OpenWallet", group: "fi", product: "Savings and payments for first-time account holders", gps: ["gp-orchard"], rounds: [{year:2022, amount:4, valuation:8},{year:2024, amount:8, valuation:18},{year:2025, amount:12, valuation:40}] },
    { id: "koraflex", name: "KoraFlex", group: "fi", product: "Flexible bills and short-term liquidity", gps: ["gp-civic"], rounds: [{year:2025, amount:4, valuation:20}], exit: {year:2026, type:"acquired"} },
    { id: "homebridge", name: "HomeBridge", group: "fi", product: "Credit building for renters", gps: ["gp-civic"], rounds: [{year:2023, amount:5, valuation:5},{year:2024, amount:4, valuation:12}] },
    { id: "finloop", name: "Finloop", group: "fintech", product: "SME treasury software", gps: ["gp-common"], rounds: [{year:2022, amount:20, valuation:30},{year:2023, amount:30, valuation:80},{year:2025, amount:40, valuation:220}] },
    { id: "finstack", name: "FinStack", group: "fintech", product: "Payments infrastructure", gps: ["gp-orchard"], rounds: [{year:2021, amount:15, valuation:20},{year:2023, amount:20, valuation:60},{year:2025, amount:30, valuation:180}], exit: {year:2026, type:"acquired"} },
    { id: "moneymesh", name: "MoneyMesh", group: "fintech", product: "Finance operations for growing firms", gps: ["gp-civic"], rounds: [{year:2023, amount:5, valuation:10},{year:2024, amount:10, valuation:30},{year:2025, amount:18, valuation:90}] },
    { id: "crosspay", name: "CrossPay", group: "fintech", product: "Merchant payment services", gps: ["gp-civic"], rounds: [{year:2025, amount:6, valuation:35}] },
    { id: "deepcircuit", name: "DeepCircuit", group: "venture", product: "Industrial computing", gps: ["gp-common"], rounds: [{year:2022, amount:12, valuation:30},{year:2023, amount:35, valuation:110},{year:2025, amount:45, valuation:300}] },
    { id: "biofoundry", name: "BioFoundry", group: "venture", product: "Biomanufacturing platform", gps: ["gp-orchard"], rounds: [{year:2022, amount:10, valuation:20},{year:2024, amount:25, valuation:75},{year:2025, amount:30, valuation:150}] },
    { id: "solarforge", name: "SolarForge", group: "venture", product: "Grid-scale energy storage", gps: ["gp-civic"], rounds: [{year:2023, amount:15, valuation:30},{year:2024, amount:25, valuation:40},{year:2025, amount:35, valuation:110}], exit: {year:2026, type:"acquired"} },
    { id: "orbitalworks", name: "OrbitalWorks", group: "venture", product: "Earth observation analytics", gps: ["gp-civic"], rounds: [{year:2025, amount:8, valuation:80}] }
  ],
  gps: [
    {id:"gp-common", name:"CommonGround Ventures"},
    {id:"gp-orchard", name:"Orchard Capital"},
    {id:"gp-civic", name:"Civic Ventures"}
  ],
  lps: [
    {id:"lp-northshore", name:"Northshore Pension", type:"Pension", gps:["gp-common","gp-orchard"], angle:"Ask how its managers identify consumer credit risk and measure outcomes for thin-file customers."},
    {id:"lp-civicfund", name:"Civic Futures Fund", type:"Foundation", gps:["gp-orchard","gp-civic"], angle:"Explore whether financial resilience is an explicit mandate across its venture commitments."},
    {id:"lp-meridian", name:"Meridian Foundation", type:"Foundation", gps:["gp-common"], angle:"Compare its manager selection lens with measurable access-to-finance outcomes."},
    {id:"lp-harbor", name:"Harbor Community Trust", type:"Endowment", gps:["gp-civic"], angle:"Discuss how it evaluates inclusion themes inside a broad venture portfolio."}
  ]
};
}
