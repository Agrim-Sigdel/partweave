# Partweave v2 Prototype: Verified Logic Cores + Common Template Shells

This prototype demonstrates the architecture described in
[`docs/v2-verified-core.md`](../../docs/v2-verified-core.md) on two modules from
[`docs/planned-modules/`](../../docs/planned-modules/README.md): **`workflow-engine`** and
**`rbac`**.

## Layout

```text
prototypes/v2-verified-core/
  specs/                     # Layer 1: Formal specs + proofs (Dafny & Lean 4)
    workflow_core.dfy
    workflow_core.lean
    rbac_core.dfy
  cores/                     # Layer 2: Proof-erased pure runtime functions
    workflow_core.py
    workflow_core.mjs
    rbac_core.py
    rbac_core.mjs
  templates/                 # Layer 3: Common template wrappers & module builder
    runtime_wrapper.py       # Generic transition runner + policy guard wrappers
    build_module.mjs         # Assembles verified cores + shell templates into module dirs
  tests/                     # Layer 4: Executable tests
    test_runtime.py
    test_builder.mjs
    test_producibility.py
  PRODUCIBILITY_PLAN.md      # Classification rubric & test plan
  producibility_probe.py     # Live catalog + beyond-catalog producibility audit
```

## Running the prototype

```sh
# 1. Run the catalog + beyond-catalog producibility audit & probes
python3 prototypes/v2-verified-core/producibility_probe.py

# 2. Verify Python runtime cores, wrappers & producibility tests
python3 -m unittest discover -s prototypes/v2-verified-core/tests -p "test_*.py" -v

# 3. Verify JS/Python core parity + partweave module template assembly
node --test prototypes/v2-verified-core/tests/test_builder.mjs
```

> **Note on proof compilers:** If `dafny` or `lean` are installed locally, you can check
> the `.dfy` / `.lean` files directly (`dafny verify specs/workflow_core.dfy`,
> `dafny translate py ...`, `lean specs/workflow_core.lean`). In environments without those
> compilers, `cores/` holds the exact proof-erased Python and JavaScript functions emitted
> by those specifications so the runtime wrappers and module builder run with just
> `python3` and `node`.
