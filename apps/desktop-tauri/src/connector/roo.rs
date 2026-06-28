use crate::connector::engine::*;

pub fn profile(ctx: &EngineContext) -> ClientProfile {
    build_profile(ClientId::Roo, ctx)
}

pub fn detect(engine: &ConnectorEngine, ctx: &EngineContext) -> Result<DetectResult, ConnectorError> {
    engine.detect(ClientId::Roo, ctx)
}

pub fn preview_connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_connect(ClientId::Roo, ctx, opts)
}

pub fn connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.connect(ClientId::Roo, ctx, opts)
}

pub fn preview_disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_disconnect(ClientId::Roo, ctx, opts)
}

pub fn disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.disconnect(ClientId::Roo, ctx, opts)
}

pub fn repair(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<RepairResult, ConnectorError> {
    engine.repair(ClientId::Roo, ctx, opts)
}

pub fn rollback(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &RollbackOptions,
) -> Result<Plan, ConnectorError> {
    engine.rollback(ClientId::Roo, ctx, opts)
}

pub fn test(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &TestOptions,
) -> Result<TestResult, ConnectorError> {
    engine.test(ClientId::Roo, ctx, opts)
}

pub fn restart_guidance() -> &'static str {
    "Reload or restart the Roo host."
}
