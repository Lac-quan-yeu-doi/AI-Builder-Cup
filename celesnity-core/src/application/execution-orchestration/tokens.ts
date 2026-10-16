/**
 * Dependency-injection tokens for the Execution Orchestration ports.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else.
 */
export const EXECUTION_DISPATCHER = Symbol('IExecutionDispatcher');
export const EXECUTION_LOG_STORE = Symbol('IExecutionLogStore');
export const EXECUTION_READER = Symbol('IExecutionReader');
export const EXECUTION_REPOSITORY = Symbol('IExecutionRepository');
export const SPARK_EXECUTION_GATEWAY = Symbol('ISparkExecutionGateway');
export const EXECUTABLE_WORKLOAD_PROVIDER = Symbol('IExecutableWorkloadProvider');
