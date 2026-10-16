/**
 * Dependency-injection tokens for the Query Workbench ports.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else.
 */
export const QUERY_RESULT_STORE = Symbol('IQueryResultStore');
export const SQL_EXECUTION_READER = Symbol('ISqlExecutionReader');
export const SQL_EXECUTION_REPOSITORY = Symbol('ISqlExecutionRepository');
export const SQL_QUERY_GATEWAY = Symbol('ISqlQueryGateway');
