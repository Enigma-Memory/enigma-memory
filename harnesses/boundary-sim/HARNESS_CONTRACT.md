# Boundary simulation harness contract

`boundary_harness.mjs` is the local proof-carrying Boundary/CANP demonstration. It imports `packages/boundary/src/index.js` and prints rows with:

- `scenario`
- `pathId`
- `bGotVia`
- `classification`
- `failClosed`
- `canp`
- `verdict`
- `reason`

Required scenarios:

- control never sent
- honest committed crossing
- scratchpad leak
- tool-output leak
- clipboard leak
- log leak
- file artifact leak
- network callback leak
- mitigated scratchpad route-through-channel
- mitigated clipboard route-through-channel
- mitigated tool route-through-channel
- unknown provider route
- ambiguous tool surface route
- semantic/RAG paraphrase declared out-of-scope

Status and claim rules:

- Every path that is not present in the boundary manifest fails closed with row `classification: fail_closed`, `failClosed: true`, `canp: UNKNOWN_BOUNDARY`, and `verdict: FAIL`.
- A missing or invalid boundary manifest fails closed; the harness must not substitute success for an explicit missing manifest.
- Ambiguous references, including surface-only provider/tool references that match multiple raw/committed routes or mismatched `path_id`/`surface` pairs, fail closed with row `classification: fail_closed`, `failClosed: true`, `canp: UNKNOWN_BOUNDARY`, and `verdict: FAIL`.
- Exact uninstrumented side channels, including scratchpad, clipboard, logs, files, tool results, and network callbacks, must report `classification: broken`, `failClosed: true`, `canp: FALSE_ASSURANCE`, and `verdict: FAIL` when the canary arrives without a committed Enigma receipt.
- Mitigated exact routes pass only through a committed Enigma channel.
- Semantic/RAG paraphrase is outside exact CANP and remains `NARROW_GO` only when declared out of scope.
- The report must include Enigma's honesty text: exact declared paths only; no claim of provider deletion, model forgetting, semantic forgetting, model-weight deletion, or absence of provider-internal side channels.
