# Advisor operating model

## Roles

- GPT-5.5 advisor: owns category, protocol, architecture, test strategy, claim boundaries, and code review decisions.
- Kimi Code implementer: edits repository, runs targeted tests, implements the build brief.
- Enigma verifier: final authority for proof artifacts.

## Loop

1. Advisor defines exact contract.
2. Implementer builds smallest verifiable slice.
3. Implementer runs targeted tests.
4. Advisor reviews code and proof output.
5. Implementer fixes source issues.
6. Verifier report becomes release evidence.

## Non-negotiable review rule

No feature is accepted because it looks plausible in a dashboard. It is accepted when exported artifacts verify offline and adversarial fixtures fail correctly.
