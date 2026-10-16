/**
 * Dependency-injection tokens for ports shared by every context.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else.
 */
export const CLOCK = Symbol('IClock');
export const ID_GENERATOR = Symbol('IIdGenerator');
export const INTEGRATION_EVENT_PUBLISHER = Symbol('IIntegrationEventPublisher');
export const OUTBOX_STORE = Symbol('IOutboxStore');
export const UNIT_OF_WORK = Symbol('IUnitOfWork');
