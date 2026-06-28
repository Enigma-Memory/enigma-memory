use crate::connector::engine::*;

pub fn profile(ctx: &EngineContext) -> ClientProfile {
    build_profile(ClientId::Opencode, ctx)
}

pub fn detect(engine: &ConnectorEngine, ctx: &EngineContext) -> Result<DetectResult, ConnectorError> {
    engine.detect(ClientId::Opencode, ctx)
}

pub fn preview_connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_connect(ClientId::Opencode, ctx, opts)
}

pub fn connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.connect(ClientId::Opencode, ctx, opts)
}

pub fn preview_disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_disconnect(ClientId::Opencode, ctx, opts)
}

pub fn disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.disconnect(ClientId::Opencode, ctx, opts)
}

pub fn repair(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<RepairResult, ConnectorError> {
    engine.repair(ClientId::Opencode, ctx, opts)
}

pub fn rollback(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &RollbackOptions,
) -> Result<Plan, ConnectorError> {
    engine.rollback(ClientId::Opencode, ctx, opts)
}

pub fn test(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &TestOptions,
) -> Result<TestResult, ConnectorError> {
    engine.test(ClientId::Opencode, ctx, opts)
}

pub fn restart_guidance() -> &'static str {
    "Restart or reload MCP servers in OpenCode."
}
