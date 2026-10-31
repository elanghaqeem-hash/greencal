# GreenCal CRMS Enterprise — OJK Buku 7 Pendekatan Standar (2026)
**Review date:** 31 October 2026. **Primary evidence:** user-supplied 105-page PDF *Buku 7 Pendekatan Standar CRMS Perbankan 2026*. Printed page numbers below are those in the handbook (PDF pages = printed + 11 for main body). The handbook's page 90 refers to **separate Excel Lampiran files** via QR code. Those files have **not been supplied or independently validated**.

## Operating principle and release status
All new server-side methods are isolated in `src/enterprise/book7.js`, dispatched via existing tenant-isolated `/api/enterprise/analytics/runs` and immutable `gcx_analytic_runs` lineage. Access requires the existing Access/tenant checks, `GC_ENTERPRISE_QUANT_ENABLED=true`, and a **separate off-by-default** `GC_ENTERPRISE_BOOK7_ENABLED=true`. Model outputs are explicitly `officialSubmission:false`; supplied scalar and SHA-256 references are **not independently verified solely because the API accepts them**. Neither these changes nor CI green authorizes regulated reporting, credit decisions, GL posting or bank production.

### Methodology-to-code control matrix
| OJK Book 7 reference (printed page) | Method / endpoint `kind` | Implementation boundary | Status |
|---|---|---|---|
| 1.4 Tabel 1–3, pp 6–8 | `book7_mapping` | Seven sector categories; sales-first 2/15/50 billion IDR, asset fallback 1/5/10 billion IDR; Buku 5 risk score 0, 1–50, 51–100; requires 5-digit KBLI and signed Bank KBLI crosswalk evidence | Implemented mapping; mapping reference not verified |
| 2.1 pp 13–18 | `book7_productive_pd` | Annual baseline PD × scenario/time PD scalar; TTC PD proxy is caller-controlled; no extrapolation, no hidden clip | Formula implemented; official `PD Scalars` and rating workbook missing |
| 2.2 pp 19–24 | `book7_retail_npl` | Quarterly KPR: prior NPL + 0.009029 × lagged ΔNPL growth − 0.039462 × ΔGDP growth. Other consumer: prior NPL − 0.03496 × lagged Δconsumption growth | Formula implemented with caller-supplied lags; macro series missing |
| 2.3 pp 27–42 | `book7_collateral_lgd` | Physical haircut, CRE/RRE transition costs or non-CRE scalar; combine effects, recompute value-to-loan and adjusted LGD | Implemented; hazard/Buku 5 and haircut/matrix reference not verified |
| 2.3 pp 43–46 | — | Frye–Jacobs for unsecured/guarantor/receivables, security-backed collateral valuation | Not yet in this increment; independent numeric validation needed |
| 2.4 pp 46–48 | `book7_npl` | Adjust NPL amount by PD proportional change and recompute performing exposure/NPL ratio | Implemented |
| 2.5 pp 49–53 | `book7_ckpn` | Stage 1 current-year PD/LGD multipliers; Stage 2 mean of annual remaining-term multipliers; Stage 3 LGD only | Implemented for sensitivity; no automated PSAK/ISAK accounting or CKPN ledger |
| 3.3–3.4 pp 59–70 | `book7_market` | PD×LGD CS shock and RF shock; changes from *signed* CS01/PV01 per unit of yield | Partial; bond yield curve, duration, FX, rating migration and market ATMR require bank pricing/risk engine |
| 4.3–4.5 pp 75–81 | `book7_liquidity` | HQLA haircut-adjusted security changes, corporate deposit/undrawn shocks (max 100%), CKPN inflow impact (floor zero), LCR with 75% inflow cap | Partial; Level 2/2B aggregate caps, other LCR classification, and LDR from Buku 6 remain bank input/verification |
| 5.1–5.3 pp 86–89 | `book7_capital` | Tier 1 credit after tax, FVTPL after tax + FVOCI, qualifying Tier 2 addback, stressed credit/market/other ATMR, KPMM | Formula bridge implemented; no bank-authorized ATMR weights or Tier 2 eligibility engine |

### External parameter inventory (DO NOT hardcode illustration values)
- *Lampiran 1 Risiko Kredit:* mapping rating / TTC PD buckets, PD Scalars by sector × size × geography × rating × scenario × year, physical LGD haircut, LGD transition scalars, CRE/RRE transition-cost matrix.
- *Lampiran 2 Risiko Pasar dan Likuiditas:* sovereign/corporate bond scalar buckets; scenario risk-free rates, shock and currency inputs; deposit and undrawn commitment shocks by sector/size/location.
- *Buku 4:* approved scenario macroeconomic GDP, consumption, policy rate, FX and NGFS/IAM vintage; units and time/quarter alignment.
- *Buku 5:* approved kecamatan physical impact scores; asset type and six hazards, geometry data, vintage and bank-approved mapping.
- *Buku 6:* official working-paper template, reporting cell mapping and internal/external reconciliation.
- *CBS/GL/treasury/collateral/CKPN:* authoritative effective-dated portfolio, balance, payments, eligible collateral/EUI, finance and regulatory capital records.

### Source ambiguities requiring OJK/model owner resolution
The document contains several inconsistent labels/numbers or apparent editorial errors. **Do not silently copy a contradictory example as the algorithm**:
1. p 50 labels the LGD multiplier using PD variables even though numerator/denominator in the Stage 2 examples use LGD; implementation uses LGD adjusted/base as described in narrative and worked examples.
2. pp 23–24 consumer-other text/illustration has a 0.003496 vs 0.03496 coefficient/sign inconsistency. Implementation follows the formula stated in §2.2.5 (p 21) and its 1.1538% example; independent validation must resolve the discrepancy.
3. p 40 CRE collateral tabular result differs slightly from the arithmetic formula (5,477,835,349 vs 5,477,853,349), and p 41–42 non-CRE text has mismatched risk-haircut/ratios. Code preserves arithmetic formula and rejects impossible values; differences are explicit review items.
4. p 32 CRE worked example mentions 2026 where the quoted cost is for 2027; asset inventory and source year must be reconciled.
5. Documentation says sector grouping uses KBLI but does **not** provide a complete 5-digit KBLI-to-group crosswalk; `book7_mapping` requires an external bank-governed mapping reference.
6. LGD scalar/performance under missing data and zero PD denominators, negative climate-adjusted collateral and >100% adjusted PD/LGD require **model policy**; this implementation rejects such inputs, not silently caps or substitutes proxies.

### API request shape (synthetic data only)
```http
POST /api/enterprise/analytics/runs
Content-Type: application/json
```
```json
{
  "kind":"book7_productive_pd",
  "input":{
    "scenario":"SYNTHETIC_UAT_ONLY",
    "year":2028,
    "sourceReference":"SYNTHETIC_SCALAR_NOT_FOR_BANK",
    "sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "periods":[{"year":2028,"baselinePD":"0.0004","pdScalar":"1.16"}]
  }
}
```
All rates are *fractions*, not formatted percentages: 0.04% is `0.0004`; scalar 1.16 means a multiplier of 1.16. Amounts and rates are decimal **strings**, max six fractional digits. SHA-256 of the *actual* source must be separately checked against the bank-signed source manifest, not just submitted as a claimed value. API output is an **internal scenario estimate only**.

The generic legacy `book7_standardized` kind remains for backwards compatibility but is explicitly **not** an official Buku 7 implementation. Do not use it for formal computation; migrate callers to the specific method kinds above.

### Planned enterprise UI and further tests
Create a “Buku 7 — Pendekatan Standar” work area under CRMS Enterprise with tabs (mapping, PD, LGD, NPL, CKPN, market, liquidity, capital, result lineage), source/version review and validation errors; never expose it in the public calculator until approved. Quantitative computations must remain server-side. Add signed Excel scalar intake/import with catalog keys, source hash, effective dates, dual-control approvals, sample workbook parity and independent model review. Add Frye–Jacobs numerical tests, pricing curves and official Workbook Buku 6 cell mapping after annexes are available.

### Exit criteria for bank operational use
Dedicated D1 enterprise capacity and Access IdP; signed KBLI crosswalk, official Excel Lampiran, Buku 4/5/6 input; actual CBS/GL/CKPN/securities connectors with reconciliation and source bytes hash; full formula-example parity; numerical stability and negative/extreme regression; unique maker/checker/approver/Risk/Finance/Compliance/IT acknowledgements; staging → isolated UAT → backup/restore → production release authorization. **Do not declare compliance or deploy to bank production before these gates pass.**
