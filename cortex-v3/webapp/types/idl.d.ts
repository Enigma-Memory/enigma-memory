import { Idl } from "@coral-xyz/anchor";

declare module "../../target/idl/memory_registry.json" {
  const value: Idl;
  export default value;
}

declare module "../../target/idl/budget_escrow.json" {
  const value: Idl;
  export default value;
}

declare module "../../target/idl/capability_registry.json" {
  const value: Idl;
  export default value;
}

declare module "../../target/idl/royalty_router.json" {
  const value: Idl;
  export default value;
}

declare module "../../target/idl/cortex_treasury.json" {
  const value: Idl;
  export default value;
}
